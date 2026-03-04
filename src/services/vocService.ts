import { Request, Response } from 'express';
import { Queue } from 'bullmq';
import { upsertWorkflow } from '../utils/db';
import { broadcastSSE } from '../utils/sse';
import logger from '../utils/logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const vocQueue = new Queue('voc-processing', { connection: { url: redisUrl } });

export async function vocWebhookHandler(req: Request, res: Response) {
  try {
    const voc = req.body;

    if (!voc.id || !voc.title) {
      res.status(400).json({ error: 'id and title are required' });
      return;
    }

    logger.info(`Received VOC webhook: ${voc.id} - ${voc.title}`);

    // 즉시 응답 (timeout 방지)
    res.json({ received: true, voc_id: voc.id });

    // DB에 초기 상태 저장
    await upsertWorkflow(voc.id, {
      title: voc.title,
      description: voc.description,
      requester: voc.requester,
      phase: 'queued',
      status: 'pending',
    });

    // Redis 큐에 분석 작업 등록
    await vocQueue.add('process-voc', {
      phase: 'analysis',
      vocId: voc.id,
      data: {
        title: voc.title,
        description: voc.description,
        requester: voc.requester,
        createdAt: voc.createdAt || new Date().toISOString(),
      },
    }, {
      jobId: `voc-${voc.id}-analysis`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
    });

    broadcastSSE({ type: 'workflow-updated', vocId: voc.id });
    logger.info(`VOC ${voc.id} enqueued for analysis`);
  } catch (err) {
    logger.error('Webhook handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
