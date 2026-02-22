import { Request, Response } from 'express';
import { Queue } from 'bullmq';
import logger from '../utils/logger';
import { redisConnection } from '../utils/redis';
import * as repo from '../db/vocWorkflowRepository';
import { sendVocDetected } from './telegramService';

let vocQueue: Queue | null = null;

function getQueue(): Queue {
  if (!vocQueue) {
    vocQueue = new Queue('voc-processing', { connection: redisConnection });
  }
  return vocQueue;
}

export async function vocWebhookHandler(req: Request, res: Response) {
  try {
    const voc = req.body;

    if (!voc.id || !voc.title) {
      res.status(400).json({ error: 'Missing required fields: id, title' });
      return;
    }

    logger.info(`Received VOC webhook: ${voc.id}`);

    // 즉시 응답 (timeout 방지)
    res.json({ received: true, voc_id: voc.id });

    // DB에 워크플로우 생성
    await repo.createWorkflow({
      vocId: voc.id,
      title: voc.title,
      description: voc.description || '',
      requester: voc.requester || 'unknown',
    });

    // Telegram 접수 알림
    await sendVocDetected(voc.id, voc.title, voc.requester || 'unknown');

    // Redis 큐에 분석 작업 등록
    await getQueue().add('process-voc', {
      phase: 'analysis',
      vocId: voc.id,
      data: {
        title: voc.title,
        description: voc.description || '',
        requester: voc.requester || 'unknown',
      },
    }, {
      jobId: `voc-${voc.id}-analysis`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
    });

    logger.info(`VOC ${voc.id} queued for analysis`);
  } catch (err) {
    logger.error('Webhook handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
