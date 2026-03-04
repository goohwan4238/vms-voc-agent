import 'dotenv/config';
import { startServer } from './server';
import { initDB } from './utils/db';
import { startBot } from './utils/telegram';
import logger from './utils/logger';

const component = process.argv[2] || 'server';

async function main() {
  logger.info(`VMS VOC Agent starting (component: ${component})...`);

  // DB 초기화 (모든 컴포넌트 공통)
  await initDB();

  switch (component) {
    case 'server':
      startServer();
      break;

    case 'worker':
      // worker.ts를 직접 import하면 자동 실행됨
      await import('./worker');
      // Telegram 봇도 worker에서 시작 (승인/반려 콜백 수신)
      await startBot();
      break;

    case 'poller':
      await import('./poller');
      break;

    case 'all':
      startServer();
      await import('./worker');
      await import('./poller');
      await startBot();
      break;

    default:
      logger.error(`Unknown component: ${component}. Use: server|worker|poller|all`);
      process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Failed to start:', err);
  process.exit(1);
});
