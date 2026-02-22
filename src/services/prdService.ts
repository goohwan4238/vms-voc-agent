import { generatePRD } from '../utils/openai';
import logger from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import * as repo from '../db/vocWorkflowRepository';
import { sendPrdComplete } from './telegramService';

export async function processPRDWriting(vocId: number, data: any) {
  logger.info(`Writing PRD for VOC ${vocId}`);

  try {
    // 상태 업데이트: prd_writing
    await repo.updateStatus(vocId, 'prd_writing');

    // AI로 PRD 생성
    const prdContent = await generatePRD(data.analysis, data);

    // PRD 파일 저장
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const filename = `PRD-${vocId}-${dateStr}.md`;
    const filepath = path.join(process.cwd(), 'docs', 'prd', 'voc', filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, prdContent || '', 'utf-8');

    logger.info(`PRD saved: ${filepath}`);

    // DB에 PRD 경로 저장 + 상태를 prd_reviewing으로 변경
    await repo.savePrdPath(vocId, filepath);

    // Telegram 알림: PRD 완료 + 승인 요청
    await sendPrdComplete(vocId, filename);

    return {
      status: 'prd_written',
      vocId,
      prdPath: filepath,
    };
  } catch (err) {
    logger.error(`PRD writing failed for VOC ${vocId}:`, err);
    await repo.updateStatus(vocId, 'error').catch(() => {});
    throw err;
  }
}
