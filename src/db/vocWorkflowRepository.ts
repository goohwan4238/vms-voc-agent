import { localPool } from './index';
import logger from '../utils/logger';

export interface VocWorkflow {
  id: number;
  voc_id: number;
  status: string;
  title: string | null;
  description: string | null;
  requester: string | null;
  analysis_result: any | null;
  prd_path: string | null;
  dev_branch: string | null;
  test_result: any | null;
  review_count: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export type VocStatus =
  | 'detected'
  | 'analyzing'
  | 'analyzed'
  | 'prd_writing'
  | 'prd_reviewing'
  | 'developing'
  | 'testing'
  | 'completed'
  | 'rejected'
  | 'error';

export async function createWorkflow(params: {
  vocId: number;
  title: string;
  description: string;
  requester: string;
}): Promise<VocWorkflow> {
  const { rows } = await localPool.query(
    `INSERT INTO voc_workflow (voc_id, title, description, requester, status)
     VALUES ($1, $2, $3, $4, 'detected')
     ON CONFLICT (voc_id) DO NOTHING
     RETURNING *`,
    [params.vocId, params.title, params.description, params.requester]
  );

  if (rows.length === 0) {
    // 이미 존재하는 경우 조회
    const existing = await getByVocId(params.vocId);
    if (!existing) throw new Error(`Failed to create or find workflow for VOC ${params.vocId}`);
    return existing;
  }

  logger.info(`Workflow created for VOC ${params.vocId}`);
  return rows[0];
}

export async function getByVocId(vocId: number): Promise<VocWorkflow | null> {
  const { rows } = await localPool.query(
    'SELECT * FROM voc_workflow WHERE voc_id = $1',
    [vocId]
  );
  return rows[0] || null;
}

export async function getById(id: number): Promise<VocWorkflow | null> {
  const { rows } = await localPool.query(
    'SELECT * FROM voc_workflow WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function updateStatus(vocId: number, status: VocStatus): Promise<VocWorkflow> {
  const completedAt = status === 'completed' || status === 'rejected'
    ? 'NOW()'
    : 'completed_at';

  const { rows } = await localPool.query(
    `UPDATE voc_workflow
     SET status = $1, updated_at = NOW(), completed_at = ${completedAt}
     WHERE voc_id = $2
     RETURNING *`,
    [status, vocId]
  );

  if (rows.length === 0) throw new Error(`Workflow not found for VOC ${vocId}`);
  logger.info(`VOC ${vocId} status updated to ${status}`);
  return rows[0];
}

export async function saveAnalysisResult(vocId: number, analysisResult: any): Promise<VocWorkflow> {
  const { rows } = await localPool.query(
    `UPDATE voc_workflow
     SET analysis_result = $1, status = 'analyzed', updated_at = NOW()
     WHERE voc_id = $2
     RETURNING *`,
    [JSON.stringify(analysisResult), vocId]
  );

  if (rows.length === 0) throw new Error(`Workflow not found for VOC ${vocId}`);
  return rows[0];
}

export async function savePrdPath(vocId: number, prdPath: string): Promise<VocWorkflow> {
  const { rows } = await localPool.query(
    `UPDATE voc_workflow
     SET prd_path = $1, status = 'prd_reviewing', updated_at = NOW()
     WHERE voc_id = $2
     RETURNING *`,
    [prdPath, vocId]
  );

  if (rows.length === 0) throw new Error(`Workflow not found for VOC ${vocId}`);
  return rows[0];
}

export async function incrementReviewCount(vocId: number): Promise<VocWorkflow> {
  const { rows } = await localPool.query(
    `UPDATE voc_workflow
     SET review_count = review_count + 1, updated_at = NOW()
     WHERE voc_id = $1
     RETURNING *`,
    [vocId]
  );

  if (rows.length === 0) throw new Error(`Workflow not found for VOC ${vocId}`);
  return rows[0];
}

export async function saveDevBranch(vocId: number, branch: string): Promise<VocWorkflow> {
  const { rows } = await localPool.query(
    `UPDATE voc_workflow
     SET dev_branch = $1, updated_at = NOW()
     WHERE voc_id = $2
     RETURNING *`,
    [branch, vocId]
  );

  if (rows.length === 0) throw new Error(`Workflow not found for VOC ${vocId}`);
  return rows[0];
}

export async function saveTestResult(vocId: number, testResult: any): Promise<VocWorkflow> {
  const { rows } = await localPool.query(
    `UPDATE voc_workflow
     SET test_result = $1, updated_at = NOW()
     WHERE voc_id = $2
     RETURNING *`,
    [JSON.stringify(testResult), vocId]
  );

  if (rows.length === 0) throw new Error(`Workflow not found for VOC ${vocId}`);
  return rows[0];
}

export async function listByStatus(status: VocStatus): Promise<VocWorkflow[]> {
  const { rows } = await localPool.query(
    'SELECT * FROM voc_workflow WHERE status = $1 ORDER BY created_at DESC',
    [status]
  );
  return rows;
}

export async function listAll(limit = 20): Promise<VocWorkflow[]> {
  const { rows } = await localPool.query(
    'SELECT * FROM voc_workflow ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows;
}
