import { Telegraf, Markup } from 'telegraf';
import { Queue } from 'bullmq';
import { upsertWorkflow, updateVmsVocStatus, extractVmsVocId } from './db';
import { broadcastSSE } from './sse';
import logger from './logger';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
const chatId = process.env.TELEGRAM_CHAT_ID || '';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let vocQueue: Queue;

function getQueue() {
  if (!vocQueue) {
    vocQueue = new Queue('voc-processing', { connection: { url: redisUrl } });
  }
  return vocQueue;
}

// 분석 완료 알림
export async function notifyAnalysisComplete(vocId: string, title: string, analysis: string) {
  const truncated = analysis.length > 3000 ? analysis.substring(0, 3000) + '\n...(생략)' : analysis;

  const msg = await bot.telegram.sendMessage(
    chatId,
    `📋 *VOC 분석 완료*\n\n` +
    `*VOC*: ${escapeMarkdown(title)}\n` +
    `*ID*: \`${vocId}\`\n\n` +
    `${escapeMarkdown(truncated)}`,
    { parse_mode: 'Markdown' },
  );

  await upsertWorkflow(vocId, { telegram_message_id: msg.message_id });
  return msg;
}

// PRD 승인 요청 알림
export async function notifyPRDApproval(vocId: string, title: string, prdPath: string) {
  const msg = await bot.telegram.sendMessage(
    chatId,
    `📝 *PRD 작성 완료 \\- 승인 요청*\n\n` +
    `*VOC*: ${escapeMarkdownV2(title)}\n` +
    `*ID*: \`${vocId}\`\n` +
    `*파일*: \`${escapeMarkdownV2(prdPath)}\`\n\n` +
    `아래 버튼으로 승인 또는 반려해주세요\\.`,
    {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        Markup.button.callback('✅ 승인', `approve:${vocId}`),
        Markup.button.callback('❌ 반려', `reject:${vocId}`),
      ]),
    },
  );

  await upsertWorkflow(vocId, { telegram_message_id: msg.message_id });
  return msg;
}

// 리뷰 실패 후 승인 요청 알림
export async function notifyReviewApproval(vocId: string, title: string, reviewResult: any) {
  const stepSummary = (reviewResult?.steps || [])
    .map((s: any) => `${s.passed ? '✅' : '❌'} ${s.step} (${s.issues?.length || 0} issues)`)
    .join('\n');

  const msg = await bot.telegram.sendMessage(
    chatId,
    `🔍 *코드 리뷰 승인 요청*\n\n` +
    `*VOC*: ${escapeMarkdownV2(title)}\n` +
    `*ID*: \`${vocId}\`\n\n` +
    `자동 수정 2회 시도 후에도 리뷰를 통과하지 못했습니다\\.\n\n` +
    `${escapeMarkdownV2(stepSummary)}\n\n` +
    `계속 진행할까요?`,
    {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        Markup.button.callback('✅ 계속 진행', `review-approve:${vocId}`),
        Markup.button.callback('❌ 중단', `review-reject:${vocId}`),
      ]),
    },
  );

  await upsertWorkflow(vocId, { telegram_message_id: msg.message_id });
  return msg;
}

// 상태 변경 알림
export async function notifyStatusChange(vocId: string, title: string, phase: string, status: string) {
  await bot.telegram.sendMessage(
    chatId,
    `🔄 *상태 변경*\n\n` +
    `*VOC*: ${escapeMarkdown(title)}\n` +
    `*단계*: ${escapeMarkdown(phase)}\n` +
    `*상태*: ${escapeMarkdown(status)}`,
    { parse_mode: 'Markdown' },
  );
}

// Telegram 봇 콜백 핸들러 등록
export function setupBotCallbacks() {
  // 승인 콜백
  bot.action(/^approve:(.+)$/, async (ctx) => {
    const vocId = ctx.match[1];
    logger.info(`PRD approved for VOC ${vocId} by ${ctx.from?.username}`);

    await upsertWorkflow(vocId, { phase: 'development', status: 'approved', approved_at: new Date() });
    broadcastSSE({ type: 'workflow-updated', vocId });

    // vmsworks VOC 상태 동기화: → planned (승인됨)
    const vmsVocId = extractVmsVocId(vocId);
    if (vmsVocId) {
      await updateVmsVocStatus(vmsVocId, 'planned', 'planned_at');
    }

    // 다음 단계(development)를 큐에 등록
    await getQueue().add('process-voc', {
      phase: 'development',
      vocId,
      data: {},
    }, {
      jobId: `voc-${vocId}-development`,
    });

    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply(`✅ VOC ${vocId} PRD가 승인되었습니다. 개발 단계로 진행합니다.`);
  });

  // 리뷰 승인 콜백 (리뷰 실패 후 계속 진행)
  bot.action(/^review-approve:(.+)$/, async (ctx) => {
    const vocId = ctx.match[1];
    logger.info(`Review approved for VOC ${vocId} by ${ctx.from?.username}`);

    await upsertWorkflow(vocId, { phase: 'review', status: 'completed', review_completed_at: new Date() });
    broadcastSSE({ type: 'workflow-updated', vocId });

    // testing 큐 등록
    await getQueue().add('process-voc', {
      phase: 'testing',
      vocId,
      data: {},
    }, {
      jobId: `voc-${vocId}-testing`,
    });

    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply(`✅ VOC ${vocId} 리뷰가 승인되었습니다. 테스트 단계로 진행합니다.`);
  });

  // 리뷰 반려 콜백 (파이프라인 종료)
  bot.action(/^review-reject:(.+)$/, async (ctx) => {
    const vocId = ctx.match[1];
    logger.info(`Review rejected for VOC ${vocId} by ${ctx.from?.username}`);

    await upsertWorkflow(vocId, { phase: 'review', status: 'rejected' });
    broadcastSSE({ type: 'workflow-updated', vocId });

    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply(`❌ VOC ${vocId} 리뷰가 반려되었습니다. 파이프라인이 중단됩니다.`);
  });

  // PRD 반려 콜백
  bot.action(/^reject:(.+)$/, async (ctx) => {
    const vocId = ctx.match[1];
    logger.info(`PRD rejected for VOC ${vocId} by ${ctx.from?.username}`);

    await upsertWorkflow(vocId, { phase: 'review', status: 'rejected' });
    broadcastSSE({ type: 'workflow-updated', vocId });

    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply(`❌ VOC ${vocId} PRD가 반려되었습니다.`);
  });

  // /status 명령어
  bot.command('status', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      await ctx.reply('사용법: /status <VOC ID>');
      return;
    }

    const { getWorkflow } = await import('./db');
    const workflow = await getWorkflow(args[1]);
    if (!workflow) {
      await ctx.reply(`VOC ${args[1]}을 찾을 수 없습니다.`);
      return;
    }

    await ctx.reply(
      `📊 *VOC 상태*\n\n` +
      `*ID*: \`${workflow.voc_id}\`\n` +
      `*제목*: ${escapeMarkdown(workflow.title || '-')}\n` +
      `*단계*: ${escapeMarkdown(workflow.phase)}\n` +
      `*상태*: ${escapeMarkdown(workflow.status)}\n` +
      `*갱신*: ${workflow.updated_at}`,
      { parse_mode: 'Markdown' },
    );
  });
}

export async function startBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not set, Telegram bot disabled');
    return;
  }

  setupBotCallbacks();

  try {
    await bot.launch();
    logger.info('Telegram bot started');

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (err) {
    logger.warn('Telegram bot failed to start (non-fatal):', err);
    logger.warn('Telegram notifications and approvals will be unavailable');
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

export default bot;
