import { Worker } from 'bullmq';
import logger from './utils/logger';
import { redisConnection } from './utils/redis';
import { processVOCAnalysis } from './services/analysisService';
import { processPRDWriting } from './services/prdService';
import { processPRDReview } from './services/reviewService';
import { processDevelopment } from './services/developmentService';
import { processTesting } from './services/testingService';
import { sendError } from './services/telegramService';

// VOC 처리 워커
const vocWorker = new Worker('voc-processing', async (job) => {
  const { phase, vocId, data } = job.data;

  logger.info(`Processing job ${job.id}, phase: ${phase}, voc: ${vocId}`);

  switch (phase) {
    case 'analysis':
      return await processVOCAnalysis(vocId, data);

    case 'prd-writing':
      return await processPRDWriting(vocId, data);

    case 'review':
      return await processPRDReview(vocId, data);

    case 'development':
      return await processDevelopment(vocId, data);

    case 'testing':
      return await processTesting(vocId, data);

    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}, {
  connection: redisConnection,
  concurrency: 2, // WIP 제한: 동시 2개 처리
});

vocWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

vocWorker.on('failed', async (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);

  // 실패 시 Telegram 알림
  if (job?.data?.vocId) {
    await sendError(job.data.vocId, `작업 실패 (${job.data.phase}): ${err.message}`).catch(() => {});
  }
});

export { vocWorker };

logger.info('VOC Worker started');
