import fs from 'fs/promises';
import { developFromPRD } from '../utils/claude';
import { upsertWorkflow, getWorkflow } from '../utils/db';
import { broadcastSSE } from '../utils/sse';
import { notifyStatusChange } from '../utils/telegram';
import logger from '../utils/logger';

export async function processDevelopment(vocId: string, data: any) {
  logger.info(`Starting development for VOC ${vocId}`);

  try {
    await upsertWorkflow(vocId, { phase: 'development', status: 'in_progress', dev_started_at: new Date() });
    broadcastSSE({ type: 'workflow-updated', vocId });

    // PRD 내용 읽기
    let prdContent: string;
    const prdPath = data.prdPath || (await getWorkflow(vocId))?.prd_path;

    if (prdPath) {
      try {
        prdContent = await fs.readFile(prdPath, 'utf-8');
      } catch (err) {
        logger.warn(`PRD file not found at ${prdPath}, using analysis as fallback`);
        prdContent = data.analysis || '(PRD 내용을 찾을 수 없습니다)';
      }
    } else {
      prdContent = data.analysis || '(PRD 내용을 찾을 수 없습니다)';
    }

    // Claude CLI로 VMSWorks 레포에서 코드 생성
    const result = await developFromPRD(prdContent);

    await upsertWorkflow(vocId, { phase: 'development', status: 'completed', dev_completed_at: new Date() });
    broadcastSSE({ type: 'workflow-updated', vocId });

    try {
      await notifyStatusChange(vocId, data.title || vocId, 'development', 'completed');
    } catch (err) {
      logger.warn('Telegram notification failed:', err);
    }

    logger.info(`Development completed for VOC ${vocId}`);

    return {
      status: 'developed',
      vocId,
      devResult: result.substring(0, 2000),
    };
  } catch (err) {
    await upsertWorkflow(vocId, { phase: 'development', status: 'failed' });
    broadcastSSE({ type: 'workflow-updated', vocId });

    try {
      await notifyStatusChange(vocId, data.title || vocId, 'development', 'failed');
    } catch (notifyErr) {
      logger.warn('Telegram notification failed:', notifyErr);
    }

    logger.error(`Development failed for VOC ${vocId}:`, err);
    throw err;
  }
}
