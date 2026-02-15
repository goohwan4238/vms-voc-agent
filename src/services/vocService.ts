import { Request, Response } from 'express';
import logger from '../utils/logger';

export async function vocWebhookHandler(req: Request, res: Response) {
  try {
    const voc = req.body;
    
    logger.info('Received VOC webhook:', voc.id);
    
    // 즉시 응답 (timeout 방지)
    res.json({ received: true, voc_id: voc.id });
    
    // TODO: Redis 큐에 작업 등록
    
  } catch (err) {
    logger.error('Webhook handler error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
