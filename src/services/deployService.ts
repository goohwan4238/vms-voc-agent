import { execCommand } from '../utils/exec';
import { getDeployableWorkflows, upsertWorkflow, updateVmsVocStatus, extractVmsVocId } from '../utils/db';
import { broadcastSSE } from '../utils/sse';
import { notifyStatusChange } from '../utils/telegram';
import logger from '../utils/logger';

interface DeployResult {
  deployedVocIds: string[];
  commitHash: string | null;
  error: string | null;
}

/**
 * testing 완료된 모든 VOC를 일괄 배포한다.
 * 로직: git add → git commit → git push → DB 상태 업데이트 → vmsworks 동기화
 */
export async function deployAll(): Promise<DeployResult> {
  const repoPath = process.env.VMSWORKS_REPO_PATH;
  if (!repoPath) {
    throw new Error('VMSWORKS_REPO_PATH 환경변수가 설정되지 않았습니다');
  }

  const deployable = await getDeployableWorkflows();
  if (deployable.length === 0) {
    return { deployedVocIds: [], commitHash: null, error: null };
  }

  const vocIds = deployable.map((w: any) => w.voc_id as string);
  logger.info(`Deploying ${vocIds.length} VOC(s): ${vocIds.join(', ')}`);

  // git add
  const addResult = await execCommand('git add -A', { cwd: repoPath, timeout: 30_000 });
  if (addResult.exitCode !== 0) {
    throw new Error(`git add failed: ${addResult.stderr}`);
  }

  // git commit
  const commitMsg = `deploy: ${vocIds.join(', ')}\n\nAutomatic deployment by VOC Agent`;
  const commitResult = await execCommand(
    `git commit -m "${commitMsg.replace(/"/g, '\\"')}" --allow-empty`,
    { cwd: repoPath, timeout: 30_000 },
  );
  if (commitResult.exitCode !== 0) {
    throw new Error(`git commit failed: ${commitResult.stderr}`);
  }

  // commit hash 추출
  const hashResult = await execCommand('git rev-parse --short HEAD', { cwd: repoPath, timeout: 10_000 });
  const commitHash = hashResult.stdout.trim() || null;

  // git push
  const pushResult = await execCommand('git push', { cwd: repoPath, timeout: 60_000 });
  if (pushResult.exitCode !== 0) {
    throw new Error(`git push failed: ${pushResult.stderr}`);
  }

  // DB 상태 업데이트 + vmsworks 동기화
  const now = new Date();
  for (const wf of deployable) {
    const vocId = wf.voc_id as string;

    await upsertWorkflow(vocId, {
      phase: 'deployed',
      status: 'completed',
      deployed_at: now,
    });
    broadcastSSE({ type: 'workflow-updated', vocId });

    // vmsworks 동기화: → deployed
    const vmsVocId = extractVmsVocId(vocId);
    if (vmsVocId) {
      await updateVmsVocStatus(vmsVocId, 'deployed', 'deployed_at');
    }

    try {
      await notifyStatusChange(vocId, wf.title || vocId, 'deployed', 'completed');
    } catch (err) {
      logger.warn(`Telegram notification failed for ${vocId}:`, err);
    }
  }

  logger.info(`Deployment completed: ${vocIds.join(', ')} (commit: ${commitHash})`);

  return { deployedVocIds: vocIds, commitHash, error: null };
}
