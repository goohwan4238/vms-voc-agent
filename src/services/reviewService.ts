import OpenAI from 'openai';
import fs from 'fs/promises';
import logger from '../utils/logger';
import * as repo from '../db/vocWorkflowRepository';
import { sendReviewComplete } from './telegramService';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function processPRDReview(vocId: number, data: any) {
  logger.info(`Reviewing PRD for VOC ${vocId}`);

  try {
    await repo.updateStatus(vocId, 'prd_reviewing');

    const workflow = await repo.getByVocId(vocId);
    if (!workflow || !workflow.prd_path) {
      throw new Error(`No PRD found for VOC ${vocId}`);
    }

    // PRD 파일 읽기
    const prdContent = await fs.readFile(workflow.prd_path, 'utf-8');

    // AI 검토 수행
    const reviewResult = await reviewPRD(prdContent, workflow.review_count + 1);

    // PRD 업데이트 (검토 결과 반영)
    const updatedPrd = await applyReviewFeedback(prdContent, reviewResult);
    await fs.writeFile(workflow.prd_path, updatedPrd, 'utf-8');

    // 검토 횟수 증가
    const updated = await repo.incrementReviewCount(vocId);

    logger.info(`PRD review ${updated.review_count} completed for VOC ${vocId}`);

    // Telegram 알림: 검토 완료 + 승인 요청
    await sendReviewComplete(vocId, updated.review_count, workflow.prd_path);

    return {
      status: 'reviewed',
      vocId,
      reviewCount: updated.review_count,
    };
  } catch (err) {
    logger.error(`PRD review failed for VOC ${vocId}:`, err);
    await repo.updateStatus(vocId, 'error').catch(() => {});
    throw err;
  }
}

async function reviewPRD(prdContent: string, reviewRound: number): Promise<string> {
  const reviewFocus: Record<number, string> = {
    1: '아키텍처 적절성, 타 기능 영향도 정확성, 기술적 실현 가능성',
    2: '공수 산정 타당성, 리스크 요소 추가 식별, 일정 현실성',
    3: 'UI/UX 적절성, 디자인 시스템 준수 여부, 사용자 경험',
  };

  const focus = reviewFocus[reviewRound] || reviewFocus[1];

  const prompt = `
다음 PRD를 검토해주세요. ${reviewRound}차 검토입니다.

검토 초점: ${focus}

PRD 내용:
${prdContent}

다음 형식으로 응답해주세요:
1. 전체 평가 (A/B/C/D 등급)
2. 잘된 점 (2~3개)
3. 개선 필요사항 (구체적으로, 번호 매기기)
4. 수정 제안 (각 개선사항에 대한 구체적 수정안)
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  return response.choices[0].message.content || '';
}

async function applyReviewFeedback(prdContent: string, reviewResult: string): Promise<string> {
  const prompt = `
다음 PRD에 검토 결과를 반영하여 개선된 PRD를 작성해주세요.
원문의 구조는 유지하되 개선사항을 적용해주세요.

원본 PRD:
${prdContent}

검토 결과:
${reviewResult}

개선된 PRD를 Markdown 형식으로 출력해주세요.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  return response.choices[0].message.content || prdContent;
}
