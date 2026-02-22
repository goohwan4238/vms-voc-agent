import express from 'express';
import { vocWebhookHandler } from './services/vocService';
import * as repo from './db/vocWorkflowRepository';
import logger from './utils/logger';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// VOC Webhook endpoint
app.post('/webhook/voc', vocWebhookHandler);

// VOC 상태 조회
app.get('/voc/:id', async (req, res) => {
  try {
    const vocId = parseInt(req.params.id);
    if (isNaN(vocId)) {
      res.status(400).json({ error: 'Invalid VOC ID' });
      return;
    }

    const workflow = await repo.getByVocId(vocId);
    if (!workflow) {
      res.status(404).json({ error: 'VOC not found' });
      return;
    }

    res.json({
      id: workflow.id,
      voc_id: workflow.voc_id,
      status: workflow.status,
      title: workflow.title,
      requester: workflow.requester,
      prd_path: workflow.prd_path,
      review_count: workflow.review_count,
      created_at: workflow.created_at,
      updated_at: workflow.updated_at,
      completed_at: workflow.completed_at,
    });
  } catch (err) {
    logger.error('Error fetching VOC status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// VOC 목록 조회
app.get('/voc', async (_req, res) => {
  try {
    const workflows = await repo.listAll();
    res.json(workflows);
  } catch (err) {
    logger.error('Error fetching VOC list:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;

export function startServer() {
  app.listen(PORT, () => {
    logger.info(`VOC Server listening on port ${PORT}`);
  });
}

if (require.main === module) {
  require('dotenv').config();
  startServer();
}
