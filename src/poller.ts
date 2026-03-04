import { Pool } from 'pg';
import { Queue } from 'bullmq';
import logger from './utils/logger';
import pool, { upsertWorkflow } from './utils/db';

// vmsworks DB 커넥션 (외부 읽기 + 상태 쓰기용)
export const vmsPool = new Pool({
  connectionString: process.env.VMS_DB_URL,
  ssl: false,
});

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const vocQueue = new Queue('voc-processing', { connection: { url: redisUrl } });

let lastCheckedTime = new Date();

// 에이전트 DB에서 마지막 처리 시간을 조회하여 lastCheckedTime 초기화
async function initLastCheckedTime() {
  try {
    const result = await pool.query(
      'SELECT MAX(created_at) as last_time FROM voc_workflows'
    );
    if (result.rows[0]?.last_time) {
      lastCheckedTime = new Date(result.rows[0].last_time);
      logger.info(`Initialized lastCheckedTime from DB: ${lastCheckedTime.toISOString()}`);
    } else {
      logger.info('No existing workflows found, using current time as lastCheckedTime');
    }
  } catch (err) {
    logger.warn('Failed to initialize lastCheckedTime from DB, using current time:', err);
  }
}

async function checkNewVOCs() {
  try {
    const query = `
      SELECT vr.id, vr.title, vr.description, vr.voc_type, vr.priority,
             vr.status, vr.created_at, u.name as requester_name
      FROM voc_requests vr
      LEFT JOIN users u ON vr.requester_id = u.id
      WHERE vr.created_at > $1
        AND vr.status = 'registered'
      ORDER BY vr.created_at ASC
    `;

    const result = await vmsPool.query(query, [lastCheckedTime]);

    for (const row of result.rows) {
      logger.info(`New VOC detected: VOC-${row.id} - ${row.title} [${row.voc_type}]`);

      // queued_at 타임스탬프 기록
      await upsertWorkflow(`VOC-${row.id}`, { queued_at: new Date() });

      // Redis 큐에 작업 등록
      await vocQueue.add('process-voc', {
        phase: 'analysis',
        vocId: `VOC-${row.id}`,
        data: {
          vmsVocId: row.id,
          title: row.title,
          description: row.description,
          vocType: row.voc_type,
          priority: row.priority,
          requester: row.requester_name,
          createdAt: row.created_at,
        },
      }, {
        jobId: `voc-${row.id}-analysis`, // 중복 방지
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // 1분 후 재시도
        },
      });
    }

    if (result.rows.length > 0) {
      lastCheckedTime = new Date();
    }
  } catch (err) {
    logger.error('Error checking new VOCs:', err);
  }
}

// 메인 실행
async function startPoller() {
  logger.info('VOC Poller started');

  // 마지막 처리 시간 초기화
  await initLastCheckedTime();

  // 폴 방식 (60초 간격)
  setInterval(checkNewVOCs, 60000);

  // 즉시 한 번 실행
  await checkNewVOCs();
}

startPoller().catch(console.error);
