const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Redis URL을 파싱하여 BullMQ ConnectionOptions 형태로 반환
function parseRedisUrl(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port) || 6379,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

// BullMQ Queue/Worker에 전달할 커넥션 옵션
export const redisConnection = {
  ...parseRedisUrl(REDIS_URL),
  maxRetriesPerRequest: null,
};
