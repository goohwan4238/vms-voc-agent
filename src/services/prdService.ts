import { generatePRD } from '../utils/openai';
import logger from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export async function processPRDWriting(vocId: string, data: any) {
  logger.info(`Writing PRD for VOC ${vocId}`);
  
  try {
    const prdContent = await generatePRD(data.analysis, data);
    
    // PRD 파일 저장
    const filename = `PRD-${vocId}-${new Date().toISOString().split('T')[0]}.md`;
    const filepath = path.join(process.cwd(), 'docs', 'prd', 'voc', filename);
    
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, prdContent, 'utf-8');
    
    logger.info(`PRD saved: ${filepath}`);
    
    // TODO: Telegram 알림 (승인 요청)
    
    return {
      status: 'prd_written',
      vocId,
      prdPath: filepath,
    };
  } catch (err) {
    logger.error(`PRD writing failed for VOC ${vocId}:`, err);
    throw err;
  }
}
