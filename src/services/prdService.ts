import { generatePRD } from '../utils/claude';
import { upsertWorkflow, updateVmsVocStatus, extractVmsVocId } from '../utils/db';
import { broadcastSSE } from '../utils/sse';
import { notifyPRDApproval } from '../utils/telegram';
import logger from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export async function processPRDWriting(vocId: string, data: any) {
  logger.info(`Writing PRD for VOC ${vocId}`);

  try {
    await upsertWorkflow(vocId, { phase: 'prd-writing', status: 'in_progress', prd_started_at: new Date() });

    const prdContent = await generatePRD(data.analysis, data);

    // PRD 파일 저장
    const filename = `PRD-${vocId}-${new Date().toISOString().split('T')[0]}.md`;
    const filepath = path.join(process.cwd(), 'docs', 'prd', 'voc', filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, prdContent, 'utf-8');

    await upsertWorkflow(vocId, {
      phase: 'prd-writing',
      status: 'completed',
      prd_path: filepath,
      prd_completed_at: new Date(),
    });

    // vmsworks VOC 상태 동기화: → in_progress (PRD 작성 완료 = 확인중)
    const vmsVocId = extractVmsVocId(vocId);
    if (vmsVocId) {
      await updateVmsVocStatus(vmsVocId, 'in_progress');
    }

    // Telegram 승인 요청
    try {
      await notifyPRDApproval(vocId, data.title || vocId, filepath);
    } catch (err) {
      logger.warn(`Telegram notification failed for VOC ${vocId}:`, err);
    }

    broadcastSSE({ type: 'workflow-updated', vocId });
    logger.info(`PRD saved: ${filepath}`);

    return {
      status: 'prd_written',
      vocId,
      prdPath: filepath,
    };
  } catch (err) {
    await upsertWorkflow(vocId, { phase: 'prd-writing', status: 'failed' });
    broadcastSSE({ type: 'workflow-updated', vocId });
    logger.error(`PRD writing failed for VOC ${vocId}:`, err);
    throw err;
  }
}
