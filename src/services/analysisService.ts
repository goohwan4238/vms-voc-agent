import { analyzeVOC } from '../utils/openai';
import logger from '../utils/logger';
import * as repo from '../db/vocWorkflowRepository';
import { sendAnalysisResult } from './telegramService';

export async function processVOCAnalysis(vocId: number, data: any) {
  logger.info(`Analyzing VOC ${vocId}`);

  try {
    // 상태 업데이트: analyzing
    await repo.updateStatus(vocId, 'analyzing');

    // AI 분석 수행
    const analysis = await analyzeVOC(data.title, data.description);

    // DB에 분석 결과 저장 + 상태를 analyzed로 변경
    await repo.saveAnalysisResult(vocId, { raw: analysis, title: data.title });

    logger.info(`Analysis completed for VOC ${vocId}`);

    // Telegram 알림: 분석 결과 + 개발 여부 의사결정 요청
    await sendAnalysisResult(vocId, analysis || '분석 결과 없음');

    return {
      status: 'analyzed',
      vocId,
      analysis,
    };
  } catch (err) {
    logger.error(`Analysis failed for VOC ${vocId}:`, err);
    await repo.updateStatus(vocId, 'error').catch(() => {});
    throw err;
  }
}
