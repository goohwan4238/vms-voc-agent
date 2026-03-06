import { Pool } from 'pg';
import logger from './logger';

const pool = new Pool({
  connectionString: process.env.DB_URL || 'postgresql://vocagent:vocagent@localhost:5434/vocagent',
});

// vmsworks DB 커넥션을 poller에서 가져오지 않고, 지연 임포트로 처리
let _vmsPool: Pool | null = null;
function getVmsPool(): Pool | null {
  if (!_vmsPool && process.env.VMS_DB_URL) {
    _vmsPool = new Pool({
      connectionString: process.env.VMS_DB_URL,
      ssl: false,
    });
  }
  return _vmsPool;
}

/**
 * vmsworks DB의 VOC 상태를 업데이트한다.
 * 실패 시 로깅만 하고 에이전트 파이프라인은 계속 진행한다.
 */
export async function updateVmsVocStatus(
  vmsVocId: number,
  newStatus: string,
  timestampColumn?: string,
) {
  const vmsPool = getVmsPool();
  if (!vmsPool) {
    logger.warn('VMS_DB_URL not configured, skipping vmsworks status sync');
    return;
  }

  try {
    const setClauses = ['status = $1', 'updated_at = NOW()'];
    if (timestampColumn) {
      setClauses.push(`${timestampColumn} = NOW()`);
    }

    await vmsPool.query(
      `UPDATE voc_requests SET ${setClauses.join(', ')} WHERE id = $2`,
      [newStatus, vmsVocId],
    );
    logger.info(`Synced vmsworks VOC ${vmsVocId} status → ${newStatus}`);
  } catch (err) {
    logger.error(`Failed to sync vmsworks VOC ${vmsVocId} status:`, err);
  }
}

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS voc_workflows (
        id SERIAL PRIMARY KEY,
        voc_id VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(500),
        description TEXT,
        requester VARCHAR(200),
        phase VARCHAR(50) NOT NULL DEFAULT 'queued',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        analysis TEXT,
        prd_path VARCHAR(500),
        telegram_message_id INTEGER,
        test_results TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- test_results / review_results 컬럼이 없으면 추가 (기존 DB 호환)
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS test_results TEXT;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS review_results TEXT;

      -- phase별 타임스탬프 컬럼 (기존 DB 호환 — NULL 허용)
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS queued_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS analysis_started_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS prd_started_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS prd_completed_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS dev_started_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS dev_completed_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS review_completed_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS testing_started_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS testing_completed_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMP;
      ALTER TABLE voc_workflows ADD COLUMN IF NOT EXISTS review_retry_count INTEGER DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_voc_workflows_voc_id ON voc_workflows(voc_id);
      CREATE INDEX IF NOT EXISTS idx_voc_workflows_phase ON voc_workflows(phase);
      CREATE INDEX IF NOT EXISTS idx_voc_workflows_status ON voc_workflows(status);
    `);
    logger.info('Database initialized');
  } finally {
    client.release();
  }
}

export async function upsertWorkflow(vocId: string, data: Partial<{
  title: string;
  description: string;
  requester: string;
  phase: string;
  status: string;
  analysis: string;
  prd_path: string;
  telegram_message_id: number;
  test_results: string;
  review_results: string;
  queued_at: Date;
  analysis_started_at: Date;
  analysis_completed_at: Date;
  prd_started_at: Date;
  prd_completed_at: Date;
  approved_at: Date;
  dev_started_at: Date;
  dev_completed_at: Date;
  review_started_at: Date;
  review_completed_at: Date;
  testing_started_at: Date;
  testing_completed_at: Date;
  deployed_at: Date;
  review_retry_count: number;
}>) {
  const fields = Object.keys(data);
  const values = Object.values(data);

  if (fields.length === 0) return;

  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');

  await pool.query(
    `INSERT INTO voc_workflows (voc_id, ${fields.join(', ')}, updated_at)
     VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
     ON CONFLICT (voc_id) DO UPDATE SET ${setClause}, updated_at = NOW()`,
    [vocId, ...values],
  );
}

export async function getWorkflow(vocId: string) {
  const result = await pool.query(
    'SELECT * FROM voc_workflows WHERE voc_id = $1',
    [vocId],
  );
  return result.rows[0] || null;
}

export async function getAllWorkflows() {
  const result = await pool.query(
    'SELECT * FROM voc_workflows ORDER BY created_at DESC',
  );
  return result.rows;
}

/**
 * 서비스 재시작 시 중단된 작업(status = 'in_progress')을 조회한다.
 */
export async function getStuckWorkflows() {
  const result = await pool.query(
    `SELECT * FROM voc_workflows WHERE status = 'in_progress' ORDER BY updated_at ASC`,
  );
  return result.rows;
}

/**
 * testing 완료된 워크플로우 목록 (배포 대상)
 */
export async function getDeployableWorkflows() {
  const result = await pool.query(
    `SELECT * FROM voc_workflows WHERE phase = 'testing' AND status = 'completed' ORDER BY updated_at ASC`,
  );
  return result.rows;
}

/**
 * VOC ID에서 vmsworks 숫자 ID를 추출한다. (VOC-19 → 19)
 * 숫자가 아니면 null을 반환한다.
 */
export function extractVmsVocId(vocId: string): number | null {
  const match = vocId.match(/^VOC-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

export default pool;
