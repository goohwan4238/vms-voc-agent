import { Queue } from 'bullmq';
import logger from './utils/logger';
import { vmsPool } from './db';
import { redisConnection } from './utils/redis';
import * as repo from './db/vocWorkflowRepository';
import { sendVocDetected } from './services/telegramService';

const vocQueue = new Queue('voc-processing', { connection: redisConnection });

let lastCheckedTime = new Date();

async function checkNewVOCs() {
  try {
    const query = `
      SELECT ar.*, u.name as requester_name
      FROM approval_requests ar
      LEFT JOIN users u ON ar.requester_id = u.id
      WHERE ar.created_at > $1
        AND ar.status = 'submitted'
      ORDER BY ar.created_at ASC
    `;

    const result = await vmsPool.query(query, [lastCheckedTime]);

    for (const row of result.rows) {
      logger.info(`New VOC detected: ${row.id} - ${row.title}`);

      // 로컬 DB에 워크플로우 생성
      await repo.createWorkflow({
        vocId: row.id,
        title: row.title,
        description: row.description || '',
        requester: row.requester_name || 'unknown',
      });

      // Telegram 접수 알림
      await sendVocDetected(row.id, row.title, row.requester_name || 'unknown');

      // Redis 큐에 작업 등록
      await vocQueue.add('process-voc', {
        phase: 'analysis',
        vocId: row.id,
        data: {
          title: row.title,
          description: row.description,
          requester: row.requester_name,
          createdAt: row.created_at,
        },
      }, {
        jobId: `voc-${row.id}-analysis`, // 중복 방지
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
      });
    }

    lastCheckedTime = new Date();
  } catch (err) {
    logger.error('Error checking new VOCs:', err);
  }
}

// PostgreSQL LISTEN 방식 (VMS Works에 트리거 필요)
async function listenVOCNotifications() {
  const client = await vmsPool.connect();

  client.on('notification', async (msg) => {
    logger.info('Received PostgreSQL notification:', msg.payload);
    const payload = JSON.parse(msg.payload || '{}');

    await repo.createWorkflow({
      vocId: payload.id,
      title: payload.title || '',
      description: payload.description || '',
      requester: payload.requester || 'unknown',
    });

    await vocQueue.add('process-voc', {
      phase: 'analysis',
      vocId: payload.id,
      data: payload,
    });
  });

  await client.query('LISTEN new_voc');
  logger.info('Listening for VOC notifications...');
}

// 메인 실행
export async function startPoller() {
  logger.info('VOC Poller started');

  // 폴 방식 (기본)
  setInterval(checkNewVOCs, 60000); // 1분 간격

  // LISTEN 방식 (VMS Works 수정 시)
  // await listenVOCNotifications();

  // 즉시 한 번 실행
  await checkNewVOCs();
}

if (require.main === module) {
  require('dotenv').config();
  startPoller().catch(console.error);
}
