import express from 'express';
import { vocWebhookHandler } from './services/vocService';
import logger from './utils/logger';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// VOC Webhook endpoint
app.post('/webhook/voc', vocWebhookHandler);

// VOC 상태 조회
app.get('/voc/:id', async (req, res) => {
  // TODO: VOC 상태 조회 구현
  res.json({ id: req.params.id, status: 'pending' });
});

const PORT = process.env.PORT || 3000;

export function startServer() {
  app.listen(PORT, () => {
    logger.info(`VOC Server listening on port ${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}
