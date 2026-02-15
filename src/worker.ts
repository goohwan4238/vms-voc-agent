import { Worker } from 'bullmq';
import Redis from 'ioredis';
import logger from './utils/logger';
import { processVOCAnalysis } from './services/analysisService';
import { processPRDWriting } from './services/prdService';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

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
      // TODO: PRD 검토 (Claude Code 연동)
      logger.info(`Review phase for VOC ${vocId}`);
      return { status: 'reviewed' };
    
    case 'development':
      // TODO: 개발 (Claude Code 연동)
      logger.info(`Development phase for VOC ${vocId}`);
      return { status: 'developed' };
    
    case 'testing':
      // TODO: 테스트
      logger.info(`Testing phase for VOC ${vocId}`);
      return { status: 'tested' };
    
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}, {
  connection: redis,
  concurrency: 2, // WIP 제한: 동시 2개 처리
});

vocWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

vocWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);
});

logger.info('VOC Worker started');
