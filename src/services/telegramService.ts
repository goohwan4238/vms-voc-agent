import { Telegraf, Markup } from 'telegraf';
import { Queue } from 'bullmq';
import logger from '../utils/logger';
import { redisConnection } from '../utils/redis';
import * as repo from '../db/vocWorkflowRepository';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
const chatId = process.env.TELEGRAM_CHAT_ID || '';

let vocQueue: Queue | null = null;

function getQueue(): Queue {
  if (!vocQueue) {
    vocQueue = new Queue('voc-processing', { connection: redisConnection });
  }
  return vocQueue;
}

// --- 알림 발송 함수 ---

export async function sendVocDetected(vocId: number, title: string, requester: string) {
  const message = [
    `VOC 접수 알림`,
    ``,
    `VOC #${vocId}`,
    `제목: ${title}`,
    `요청자: ${requester}`,
    ``,
    `검토 후 의견 드리겠습니다.`,
  ].join('\n');

  await sendMessage(message);
}

export async function sendAnalysisResult(vocId: number, analysis: string) {
  const message = [
    `VOC 분석 완료`,
    ``,
    `VOC #${vocId}`,
    ``,
    analysis,
    ``,
    `개발하시겠습니까?`,
  ].join('\n');

  await sendMessage(message, Markup.inlineKeyboard([
    Markup.button.callback('예 - 개발 진행', `approve_dev_${vocId}`),
    Markup.button.callback('아니오 - 반려', `reject_dev_${vocId}`),
  ]));
}

export async function sendPrdComplete(vocId: number, prdPath: string) {
  const message = [
    `PRD 작성 완료`,
    ``,
    `VOC #${vocId}`,
    `파일: ${prdPath}`,
    ``,
    `승인하시겠습니까?`,
  ].join('\n');

  await sendMessage(message, Markup.inlineKeyboard([
    Markup.button.callback('승인', `approve_prd_${vocId}`),
    Markup.button.callback('수정 요청', `revise_prd_${vocId}`),
    Markup.button.callback('반려', `reject_prd_${vocId}`),
  ]));
}

export async function sendReviewComplete(vocId: number, reviewCount: number, prdPath: string) {
  const message = [
    `PRD 검토 완료 (${reviewCount}회)`,
    ``,
    `VOC #${vocId}`,
    `파일: ${prdPath}`,
    ``,
    `승인하시겠습니까?`,
  ].join('\n');

  await sendMessage(message, Markup.inlineKeyboard([
    Markup.button.callback('승인 - 개발 시작', `approve_prd_${vocId}`),
    Markup.button.callback('수정 요청', `revise_prd_${vocId}`),
    Markup.button.callback('반려', `reject_prd_${vocId}`),
  ]));
}

export async function sendStatusUpdate(vocId: number, statusMessage: string) {
  const message = [
    `VOC #${vocId} 상태 업데이트`,
    ``,
    statusMessage,
  ].join('\n');

  await sendMessage(message);
}

export async function sendError(vocId: number, errorMessage: string) {
  const message = [
    `오류 발생`,
    ``,
    `VOC #${vocId}`,
    `오류: ${errorMessage}`,
    ``,
    `수동 개입이 필요합니다.`,
  ].join('\n');

  await sendMessage(message);
}

async function sendMessage(text: string, extra?: any) {
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) {
    logger.warn('Telegram not configured, skipping message');
    logger.info(`[Telegram skip] ${text}`);
    return;
  }

  try {
    await bot.telegram.sendMessage(chatId, text, extra);
    logger.info('Telegram message sent');
  } catch (err) {
    logger.error('Failed to send Telegram message:', err);
    // NFR-005: 재시도 3회
    for (let i = 0; i < 3; i++) {
      try {
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        await bot.telegram.sendMessage(chatId, text, extra);
        logger.info(`Telegram message sent (retry ${i + 1})`);
        return;
      } catch (retryErr) {
        logger.error(`Telegram retry ${i + 1} failed:`, retryErr);
      }
    }
  }
}

// --- 사용자 응답 콜백 처리 ---

function setupCallbackHandlers() {
  // 개발 승인
  bot.action(/approve_dev_(\d+)/, async (ctx) => {
    const vocId = parseInt(ctx.match[1]);
    logger.info(`User approved development for VOC ${vocId}`);
    await ctx.answerCbQuery('개발 승인되었습니다');
    await ctx.editMessageReplyMarkup(undefined);

    try {
      await repo.updateStatus(vocId, 'prd_writing');
      const workflow = await repo.getByVocId(vocId);
      if (!workflow) return;

      await getQueue().add('process-voc', {
        phase: 'prd-writing',
        vocId,
        data: {
          title: workflow.title,
          description: workflow.description,
          analysis: workflow.analysis_result,
        },
      }, {
        jobId: `voc-${vocId}-prd-writing`,
      });
    } catch (err) {
      logger.error(`Error processing dev approval for VOC ${vocId}:`, err);
    }
  });

  // 개발 반려
  bot.action(/reject_dev_(\d+)/, async (ctx) => {
    const vocId = parseInt(ctx.match[1]);
    logger.info(`User rejected development for VOC ${vocId}`);
    await ctx.answerCbQuery('반려되었습니다');
    await ctx.editMessageReplyMarkup(undefined);

    try {
      await repo.updateStatus(vocId, 'rejected');
    } catch (err) {
      logger.error(`Error processing dev rejection for VOC ${vocId}:`, err);
    }
  });

  // PRD 승인
  bot.action(/approve_prd_(\d+)/, async (ctx) => {
    const vocId = parseInt(ctx.match[1]);
    logger.info(`User approved PRD for VOC ${vocId}`);
    await ctx.answerCbQuery('PRD 승인되었습니다');
    await ctx.editMessageReplyMarkup(undefined);

    try {
      await repo.updateStatus(vocId, 'developing');
      await sendStatusUpdate(vocId, '개발 준비 중입니다. Claude Code 연동은 Phase 2에서 구현 예정입니다.');
    } catch (err) {
      logger.error(`Error processing PRD approval for VOC ${vocId}:`, err);
    }
  });

  // PRD 수정 요청
  bot.action(/revise_prd_(\d+)/, async (ctx) => {
    const vocId = parseInt(ctx.match[1]);
    logger.info(`User requested PRD revision for VOC ${vocId}`);
    await ctx.answerCbQuery('수정 요청이 등록되었습니다');
    await ctx.editMessageReplyMarkup(undefined);

    try {
      const workflow = await repo.getByVocId(vocId);
      if (!workflow) return;

      if (workflow.review_count >= 3) {
        await sendError(vocId, 'PRD 검토 최대 횟수(3회)를 초과했습니다. 수동 개입이 필요합니다.');
        await repo.updateStatus(vocId, 'error');
        return;
      }

      await getQueue().add('process-voc', {
        phase: 'review',
        vocId,
        data: {
          title: workflow.title,
          description: workflow.description,
          analysis: workflow.analysis_result,
          prdPath: workflow.prd_path,
        },
      }, {
        jobId: `voc-${vocId}-review-${workflow.review_count + 1}`,
      });
    } catch (err) {
      logger.error(`Error processing PRD revision for VOC ${vocId}:`, err);
    }
  });

  // PRD 반려
  bot.action(/reject_prd_(\d+)/, async (ctx) => {
    const vocId = parseInt(ctx.match[1]);
    logger.info(`User rejected PRD for VOC ${vocId}`);
    await ctx.answerCbQuery('반려되었습니다');
    await ctx.editMessageReplyMarkup(undefined);

    try {
      await repo.updateStatus(vocId, 'rejected');
    } catch (err) {
      logger.error(`Error processing PRD rejection for VOC ${vocId}:`, err);
    }
  });
}

// --- 봇 시작 ---

export async function startTelegramBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not set, Telegram bot disabled');
    return;
  }

  setupCallbackHandlers();

  bot.catch((err: any) => {
    logger.error('Telegram bot error:', err);
  });

  // 폴 방식으로 시작 (Webhook 대비 간단)
  await bot.launch();
  logger.info('Telegram bot started');

  // 종료 시 graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

export { bot };
