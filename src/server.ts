import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { Queue } from 'bullmq';
import { vocWebhookHandler } from './services/vocService';
import { getWorkflow, getAllWorkflows, upsertWorkflow, updateVmsVocStatus, extractVmsVocId, getDeployableWorkflows } from './utils/db';
import { addSSEClient, broadcastSSE } from './utils/sse';
import logger from './utils/logger';

const app = express();

// CORS (dev 환경)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SSE endpoint
app.get('/events', (req, res) => {
  addSSEClient(res);
});

// VOC Webhook endpoint
app.post('/webhook/voc', vocWebhookHandler);

// VOC 상태 조회
app.get('/voc/:id', async (req, res) => {
  try {
    const workflow = await getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: 'VOC not found' });
      return;
    }
    res.json(workflow);
  } catch (err) {
    logger.error('Failed to get VOC status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PRD 파일 내용 반환
app.get('/voc/:id/prd', async (req, res) => {
  try {
    const workflow = await getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: 'VOC not found' });
      return;
    }
    if (!workflow.prd_path) {
      res.status(404).json({ error: 'PRD not found' });
      return;
    }
    const content = await fs.readFile(workflow.prd_path, 'utf-8');
    res.type('text/markdown').send(content);
  } catch (err) {
    logger.error('Failed to read PRD:', err);
    res.status(500).json({ error: 'Failed to read PRD file' });
  }
});

// PRD 승인
app.post('/voc/:id/approve', async (req, res) => {
  try {
    const workflow = await getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: 'VOC not found' });
      return;
    }
    if (workflow.phase !== 'prd-writing' || workflow.status !== 'completed') {
      res.status(400).json({ error: 'VOC is not in approvable state (requires phase=prd-writing, status=completed)' });
      return;
    }

    await upsertWorkflow(req.params.id, { phase: 'development', status: 'approved', approved_at: new Date() });

    // vmsworks VOC 상태 동기화: → planned (승인됨)
    const vmsVocId = extractVmsVocId(req.params.id);
    if (vmsVocId) {
      await updateVmsVocStatus(vmsVocId, 'planned', 'planned_at');
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const vocQueue = new Queue('voc-processing', { connection: { url: redisUrl } });
    await vocQueue.add('process-voc', {
      phase: 'development',
      vocId: req.params.id,
      data: {},
    }, {
      jobId: `voc-${req.params.id}-development`,
    });
    await vocQueue.close();

    broadcastSSE({ type: 'workflow-updated', vocId: req.params.id });
    res.json({ success: true, message: 'PRD approved, development phase started' });
  } catch (err) {
    logger.error('Failed to approve PRD:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PRD 반려
app.post('/voc/:id/reject', async (req, res) => {
  try {
    const workflow = await getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: 'VOC not found' });
      return;
    }
    if (workflow.phase !== 'prd-writing' || workflow.status !== 'completed') {
      res.status(400).json({ error: 'VOC is not in rejectable state (requires phase=prd-writing, status=completed)' });
      return;
    }

    await upsertWorkflow(req.params.id, { phase: 'review', status: 'rejected' });
    broadcastSSE({ type: 'workflow-updated', vocId: req.params.id });
    res.json({ success: true, message: 'PRD rejected' });
  } catch (err) {
    logger.error('Failed to reject PRD:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 일괄 배포
app.post('/deploy', async (req, res) => {
  try {
    const { deployAll } = await import('./services/deployService');
    const result = await deployAll();
    if (result.deployedVocIds.length === 0) {
      res.json({ success: true, message: 'No deployable VOCs found', ...result });
      return;
    }
    res.json({ success: true, message: `Deployed ${result.deployedVocIds.length} VOC(s)`, ...result });
  } catch (err) {
    logger.error('Deploy failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Deploy failed' });
  }
});

// 배포 가능 VOC 수 조회
app.get('/deploy/count', async (req, res) => {
  try {
    const deployable = await getDeployableWorkflows();
    res.json({ count: deployable.length });
  } catch (err) {
    logger.error('Failed to get deployable count:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 전체 VOC 목록
app.get('/voc', async (req, res) => {
  try {
    const workflows = await getAllWorkflows();
    res.json(workflows);
  } catch (err) {
    logger.error('Failed to list VOCs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Production: 정적 파일 서빙 (SPA fallback)
const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
app.use(express.static(dashboardDist));
app.get('*', (req, res, next) => {
  // API 경로는 통과
  if (req.path.startsWith('/voc') || req.path.startsWith('/webhook') || req.path.startsWith('/health') || req.path.startsWith('/events') || req.path.startsWith('/deploy')) {
    next();
    return;
  }
  res.sendFile(path.join(dashboardDist, 'index.html'), (err) => {
    if (err) next();
  });
});

const PORT = process.env.PORT || 4000;

export function startServer() {
  app.listen(PORT, () => {
    logger.info(`VOC Server listening on port ${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}
