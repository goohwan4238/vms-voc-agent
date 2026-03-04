import { analyzeVOC } from '../utils/claude';
import { upsertWorkflow } from '../utils/db';
import { broadcastSSE } from '../utils/sse';
import { notifyAnalysisComplete } from '../utils/telegram';
import logger from '../utils/logger';

export async function processVOCAnalysis(vocId: string, data: any) {
  logger.info(`Analyzing VOC ${vocId}`);

  try {
    await upsertWorkflow(vocId, {
      title: data.title,
      description: data.description,
      requester: data.requester,
      phase: 'analysis',
      status: 'in_progress',
      analysis_started_at: new Date(),
    });

    const analysis = await analyzeVOC(data.title, data.description);

    await upsertWorkflow(vocId, {
      phase: 'analysis',
      status: 'completed',
      analysis,
      analysis_completed_at: new Date(),
    });

    // Telegram 알림
    try {
      await notifyAnalysisComplete(vocId, data.title, analysis);
    } catch (err) {
      logger.warn(`Telegram notification failed for VOC ${vocId}:`, err);
    }

    broadcastSSE({ type: 'workflow-updated', vocId });
    logger.info(`Analysis completed for VOC ${vocId}`);

    return {
      status: 'analyzed',
      vocId,
      analysis,
    };
  } catch (err) {
    await upsertWorkflow(vocId, { phase: 'analysis', status: 'failed' });
    broadcastSSE({ type: 'workflow-updated', vocId });
    logger.error(`Analysis failed for VOC ${vocId}:`, err);
    throw err;
  }
}
