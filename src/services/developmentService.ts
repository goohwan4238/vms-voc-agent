import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger';
import * as repo from '../db/vocWorkflowRepository';
import * as claudeCode from './claudeCodeService';
import { sendDevComplete, sendDevProgress, sendError } from './telegramService';

const execAsync = promisify(exec);

export async function processDevelopment(vocId: number, data: any) {
  logger.info(`Starting development for VOC ${vocId}`);

  try {
    await repo.updateStatus(vocId, 'developing');

    const workflow = await repo.getByVocId(vocId);
    if (!workflow) throw new Error(`Workflow not found for VOC ${vocId}`);

    const branch = `voc-${vocId}`;

    // 1. Git 브랜치 생성
    await createFeatureBranch(branch);

    // 2. DB에 브랜치 정보 저장
    await repo.saveDevBranch(vocId, `feature/${branch}`);

    // 3. Claude Code tmux 세션 시작
    const prdPath = workflow.prd_path || '';
    const session = await claudeCode.createSession(vocId, prdPath, branch);

    // 4. Telegram 알림: 개발 시작
    await sendDevProgress(vocId, `개발이 시작되었습니다.\n브랜치: feature/${branch}`);

    // 5. HEARTBEAT 모니터링 시작
    claudeCode.startHeartbeatMonitor(
      vocId,
      // 완료 콜백
      async (completedVocId, output) => {
        logger.info(`Development completed for VOC ${completedVocId}`);

        try {
          // Git 커밋 정보 수집
          const commitInfo = await getCommitInfo(branch);

          // Telegram 알림: 개발 완료
          await sendDevComplete(completedVocId, `feature/${branch}`, commitInfo);

          // 자동으로 테스트 phase 큐 등록
          const { Queue } = await import('bullmq');
          const { redisConnection } = await import('../utils/redis');
          const queue = new Queue('voc-processing', { connection: redisConnection });

          await queue.add('process-voc', {
            phase: 'testing',
            vocId: completedVocId,
            data: {
              ...data,
              branch: `feature/${branch}`,
            },
          }, {
            jobId: `voc-${completedVocId}-testing`,
          });
        } catch (err) {
          logger.error(`Error handling dev completion for VOC ${completedVocId}:`, err);
          await sendError(completedVocId, `개발 완료 처리 중 오류: ${(err as Error).message}`);
        }
      },
      // 에러 콜백
      async (failedVocId, error) => {
        logger.error(`Development failed for VOC ${failedVocId}: ${error}`);
        await repo.updateStatus(failedVocId, 'error').catch(() => {});
        await sendError(failedVocId, `개발 중 오류 발생: ${error}`);
      },
    );

    return {
      status: 'developing',
      vocId,
      branch: `feature/${branch}`,
      sessionName: session.sessionName,
    };
  } catch (err) {
    logger.error(`Development setup failed for VOC ${vocId}:`, err);
    await repo.updateStatus(vocId, 'error').catch(() => {});
    throw err;
  }
}

async function createFeatureBranch(branch: string): Promise<void> {
  try {
    // 현재 브랜치에서 feature 브랜치 생성
    await execAsync(`git checkout -b feature/${branch}`);
    logger.info(`Branch created: feature/${branch}`);
  } catch (err) {
    // 이미 존재하면 checkout
    try {
      await execAsync(`git checkout feature/${branch}`);
      logger.info(`Switched to existing branch: feature/${branch}`);
    } catch (checkoutErr) {
      logger.error(`Failed to create/switch branch feature/${branch}:`, checkoutErr);
      throw checkoutErr;
    }
  }
}

async function getCommitInfo(branch: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `git log feature/${branch} --oneline -5 --not main 2>/dev/null || git log feature/${branch} --oneline -5 --not master 2>/dev/null || echo "커밋 정보 없음"`
    );
    return stdout.trim();
  } catch {
    return '커밋 정보를 가져올 수 없습니다';
  }
}
