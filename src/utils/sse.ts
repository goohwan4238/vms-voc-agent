import { Response } from 'express';
import logger from './logger';

const clients = new Set<Response>();

export function addSSEClient(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  clients.add(res);
  logger.info(`SSE client connected (total: ${clients.size})`);

  res.on('close', () => {
    clients.delete(res);
    logger.info(`SSE client disconnected (total: ${clients.size})`);
  });
}

export function broadcastSSE(event: { type: string; vocId: string }) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}
