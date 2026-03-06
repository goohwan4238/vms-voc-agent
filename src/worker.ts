import { Worker, Queue } from 'bullmq';
import logger from './utils/logger';
import { broadcastSSE } from './utils/sse';
import { getStuckWorkflows } from './utils/db';
import { notifyReviewApproval } from './utils/telegram';
import { processVOCAnalysis } from './services/analysisService';
import { processPRDWriting } from './services/prdService';
import { processDevelopment } from './services/developmentService';
import { processReview } from './services/reviewService';
import { processTesting } from './services/testingService';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const vocQueue = new Queue('voc-processing', { connection: { url: redisUrl } });

// 다음 단계 매핑
// 파이프라인: analysis → prd-writing → (Telegram 승인) → development → review → testing
const NEXT_PHASE: Record<string, string | null> = {
  'analysis': 'prd-writing',
  'prd-writing': null,      // PRD 작성 후 Telegram 승인 대기
  'development': 'review',  // 개발 완료 → 자동 코드 리뷰
  'review': 'testing',      // 리뷰 통과 → 자동 테스트 (실패 시 별도 처리)
  'testing': null,           // 최종 단계
};

// 다음 단계를 큐에 등록
async function enqueueNextPhase(vocId: string, currentPhase: string, result: any) {
  const nextPhase = NEXT_PHASE[currentPhase];
  if (!nextPhase) return;

  // review 실패 → Telegram 승인 요청 또는 중단
  if (currentPhase === 'review') {
    if (result.status === 'review_failed') {
      logger.info(`VOC ${vocId}: Review failed — not chaining to testing. Manual intervention required.`);
      return;
    }
    if (result.status === 'review_needs_approval') {
      logger.info(`VOC ${vocId}: Review failed after retries — requesting Telegram approval.`);
      await notifyReviewApproval(vocId, result.title || vocId, result.reviewResult);
      return;
    }
  }

  logger.info(`Chaining VOC ${vocId}: ${currentPhase} → ${nextPhase}`);

  await vocQueue.add('process-voc', {
    phase: nextPhase,
    vocId,
    data: {
      ...result,
      title: result.title || result.vocId,
    },
  }, {
    jobId: `voc-${vocId}-${nextPhase}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  });
}

// VOC 처리 워커
const vocWorker = new Worker('voc-processing', async (job) => {
  const { phase, vocId, data } = job.data;

  logger.info(`Processing job ${job.id}, phase: ${phase}, voc: ${vocId}`);

  let result;

  switch (phase) {
    case 'analysis':
      result = await processVOCAnalysis(vocId, data);
      break;

    case 'prd-writing':
      result = await processPRDWriting(vocId, data);
      // PRD 완료 후 Telegram 승인 대기 (telegram.ts에서 approve 시 development 큐 등록)
      break;

    case 'development':
      result = await processDevelopment(vocId, data);
      break;

    case 'review':
      result = await processReview(vocId, data);
      break;

    case 'testing':
      result = await processTesting(vocId, data);
      break;

    default:
      throw new Error(`Unknown phase: ${phase}`);
  }

  // 자동 체이닝
  if (result) {
    await enqueueNextPhase(vocId, phase, { ...data, ...result });
  }

  return result;
}, {
  connection: { url: redisUrl },
  concurrency: 1, // Claude CLI는 동시 실행 불가
  lockDuration: 60 * 60 * 1000, // 1시간 — 장시간 Claude CLI 실행 대비
  lockRenewTime: 30 * 1000, // 30초마다 락 갱신
});

vocWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

vocWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);
});

// 서비스 시작 시 중단된 작업 복구
async function recoverStuckWorkflows() {
  try {
    const stuck = await getStuckWorkflows();
    if (stuck.length === 0) {
      logger.info('No stuck workflows to recover');
      return;
    }

    logger.info(`Found ${stuck.length} stuck workflow(s), re-queuing...`);

    for (const wf of stuck) {
      const jobId = `voc-${wf.voc_id}-${wf.phase}-recover`;

      // 이미 큐에 동일 작업이 있으면 스킵
      const existing = await vocQueue.getJob(jobId);
      if (existing) {
        logger.info(`Skip re-queue ${wf.voc_id}/${wf.phase} — already in queue`);
        continue;
      }

      await vocQueue.add('process-voc', {
        phase: wf.phase,
        vocId: wf.voc_id,
        data: {
          title: wf.title || wf.voc_id,
          description: wf.description,
          analysis: wf.analysis,
          prdPath: wf.prd_path,
        },
      }, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
      });

      logger.info(`Re-queued stuck workflow: ${wf.voc_id} (phase: ${wf.phase})`);
    }
  } catch (err) {
    logger.error('Failed to recover stuck workflows:', err);
  }
}

logger.info('VOC Worker started');

// Worker 준비 후 복구 실행 (약간의 딜레이로 worker가 먼저 리스닝하도록)
setTimeout(() => recoverStuckWorkflows(), 3000);
