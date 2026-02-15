import { Pool } from 'pg';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import logger from './utils/logger';

const vmsPool = new Pool({
  connectionString: process.env.VMS_DB_URL,
  ssl: false,
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const vocQueue = new Queue('voc-processing', { connection: redis });

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
          delay: 60000, // 1분 후 재시도
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
async function startPoller() {
  logger.info('VOC Poller started');
  
  // 폴 방식 (기본)
  setInterval(checkNewVOCs, 60000); // 1분 간격
  
  // LISTEN 방식 (VMS Works 수정 시)
  // await listenVOCNotifications();
  
  // 즉시 한 번 실행
  await checkNewVOCs();
}

startPoller().catch(console.error);
