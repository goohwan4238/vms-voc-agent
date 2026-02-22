import { Pool } from 'pg';

// 로컬 DB (VOC Agent 상태 관리)
export const localPool = new Pool({
  connectionString: process.env.DB_URL || 'postgresql://vocagent:vocagent@localhost:5433/vocagent',
});

// VMS Works DB (읽기 전용)
export const vmsPool = new Pool({
  connectionString: process.env.VMS_DB_URL,
  ssl: false,
});
