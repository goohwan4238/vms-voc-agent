import 'dotenv/config';
import logger from './utils/logger';
import { runMigrations } from './db/migrate';
import { startServer } from './server';
import { startPoller } from './poller';
import { startTelegramBot } from './services/telegramService';

async function main() {
  logger.info('VMS VOC Agent starting...');

  // 1. DB 마이그레이션 실행
  try {
    await runMigrations();
  } catch (err) {
    logger.error('Migration failed, continuing without DB:', err);
  }

  // 2. Telegram 봇 시작
  await startTelegramBot();

  // 3. HTTP 서버 시작
  startServer();

  // 4. Worker 시작 (import만으로 자동 시작)
  await import('./worker');

  // 5. Poller 시작
  try {
    await startPoller();
  } catch (err) {
    logger.error('Poller failed to start (VMS DB may be unavailable):', err);
  }

  logger.info('VMS VOC Agent fully started');
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
