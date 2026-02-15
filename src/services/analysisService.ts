import { analyzeVOC } from '../utils/openai';
import logger from '../utils/logger';

export async function processVOCAnalysis(vocId: string, data: any) {
  logger.info(`Analyzing VOC ${vocId}`);
  
  try {
    const analysis = await analyzeVOC(data.title, data.description);
    
    logger.info(`Analysis completed for VOC ${vocId}`);
    
    // TODO: Telegram 알림 발송
    // TODO: 결과 저장
    
    return {
      status: 'analyzed',
      vocId,
      analysis,
    };
  } catch (err) {
    logger.error(`Analysis failed for VOC ${vocId}:`, err);
    throw err;
  }
}
