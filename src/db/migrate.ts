import { Pool } from 'pg';
import logger from '../utils/logger';

const pool = new Pool({
  connectionString: process.env.DB_URL || 'postgresql://vocagent:vocagent@localhost:5433/vocagent',
});

const migrations = [
  {
    name: '001_create_voc_workflow',
    sql: `
      CREATE TABLE IF NOT EXISTS voc_workflow (
        id SERIAL PRIMARY KEY,
        voc_id INTEGER NOT NULL UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'detected',
        title TEXT,
        description TEXT,
        requester VARCHAR(100),
        analysis_result JSONB,
        prd_path VARCHAR(500),
        dev_branch VARCHAR(100),
        test_result JSONB,
        review_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_voc_workflow_status ON voc_workflow(status);
      CREATE INDEX IF NOT EXISTS idx_voc_workflow_voc_id ON voc_workflow(voc_id);
    `,
  },
  {
    name: '002_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },
];

export async function runMigrations() {
  const client = await pool.connect();
  try {
    // migrations 테이블 먼저 생성
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);

    for (const migration of migrations) {
      const exists = await client.query(
        'SELECT 1 FROM migrations WHERE name = $1',
        [migration.name]
      );

      if (exists.rows.length === 0) {
        logger.info(`Running migration: ${migration.name}`);
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration.name]
        );
        logger.info(`Migration completed: ${migration.name}`);
      }
    }

    logger.info('All migrations up to date');
  } catch (err) {
    logger.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// CLI에서 직접 실행 시
if (require.main === module) {
  require('dotenv').config();
  runMigrations()
    .then(() => {
      logger.info('Migration complete');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration failed:', err);
      process.exit(1);
    });
}
