// 메인 진입점
import { startServer } from './server';
import logger from './utils/logger';

logger.info('VMS VOC Agent starting...');

// 서버 시작
startServer();

// TODO: Poller, Worker도 함께 시작하도록 개선
