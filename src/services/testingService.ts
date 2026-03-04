import path from 'path';
import { execCommand } from '../utils/exec';
import { upsertWorkflow } from '../utils/db';
import { broadcastSSE } from '../utils/sse';
import { notifyStatusChange } from '../utils/telegram';
import logger from '../utils/logger';

interface TestStepResult {
  step: string;
  passed: boolean;
  output: string;
  duration: number;
  screenshotPaths?: string[];
}

// venv 내 Python 실행 파일 경로 (Windows: venv/Scripts/python.exe)
function getVenvPython(repoPath: string): string {
  const isWin = process.platform === 'win32';
  return path.join(repoPath, 'venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
}

// 명령어가 사용 가능한지 확인 (exit code 0이면 사용 가능)
async function isToolAvailable(command: string, cwd: string): Promise<boolean> {
  const result = await execCommand(command, { cwd, timeout: 10_000 });
  return result.exitCode === 0;
}

// vmsworks 서버 health check (Playwright 실행 전 서버 기동 확인)
async function waitForServer(url: string, maxRetries: number = 10, intervalMs: number = 3000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await execCommand(`curl -s -o /dev/null -w "%{http_code}" ${url}`, { timeout: 5000 });
      const statusCode = parseInt(result.stdout.trim(), 10);
      if (statusCode >= 200 && statusCode < 500) {
        logger.info(`Server health check passed: ${url} (status: ${statusCode})`);
        return true;
      }
    } catch {
      // 연결 실패 — 재시도
    }
    if (i < maxRetries - 1) {
      logger.info(`Server not ready, retrying in ${intervalMs / 1000}s... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  logger.error(`Server health check failed after ${maxRetries} retries: ${url}`);
  return false;
}

// Playwright 테스트 결과 디렉토리에서 스크린샷 경로 수집
async function collectScreenshots(repoPath: string): Promise<string[]> {
  const screenshotDir = path.join(repoPath, 'test-results');
  const result = await execCommand(
    process.platform === 'win32'
      ? `dir /s /b "${screenshotDir}\\*.png" 2>nul`
      : `find "${screenshotDir}" -name "*.png" 2>/dev/null`,
    { cwd: repoPath, timeout: 10_000 }
  );
  if (result.exitCode === 0 && result.stdout.trim()) {
    return result.stdout.trim().split('\n').filter(Boolean);
  }
  return [];
}

export async function processTesting(vocId: string, data: any) {
  const repoPath = process.env.VMSWORKS_REPO_PATH;

  if (!repoPath) {
    throw new Error('VMSWORKS_REPO_PATH 환경변수가 설정되지 않았습니다');
  }

  const venvPython = getVenvPython(repoPath);
  logger.info(`Starting testing for VOC ${vocId}`, { repoPath, venvPython });

  try {
    await upsertWorkflow(vocId, { phase: 'testing', status: 'in_progress', testing_started_at: new Date() });
    broadcastSSE({ type: 'workflow-updated', vocId });

    const results: TestStepResult[] = [];

    // Step 1: Ruff 린트 (python -m ruff)
    const ruffCmd = `"${venvPython}" -m ruff check app/ --fix`;
    const ruffAvailable = await isToolAvailable(`"${venvPython}" -m ruff --version`, repoPath);

    if (ruffAvailable) {
      const ruffStart = Date.now();
      const ruffResult = await execCommand(ruffCmd, {
        cwd: repoPath,
        timeout: 60_000,
      });
      results.push({
        step: 'ruff',
        passed: ruffResult.exitCode === 0,
        output: ruffResult.stdout || ruffResult.stderr,
        duration: Date.now() - ruffStart,
      });
      logger.info(`Ruff lint: ${ruffResult.exitCode === 0 ? 'PASSED' : 'FAILED'}`);
    } else {
      results.push({ step: 'ruff', passed: true, output: 'SKIPPED: ruff not installed', duration: 0 });
      logger.info('Ruff lint: SKIPPED (not installed)');
    }

    // Step 2: pytest (python -m pytest)
    const pytestCmd = `"${venvPython}" -m pytest tests/ -v --tb=short`;
    const pytestAvailable = await isToolAvailable(`"${venvPython}" -m pytest --version`, repoPath);

    if (pytestAvailable) {
      const pytestStart = Date.now();
      const pytestResult = await execCommand(pytestCmd, {
        cwd: repoPath,
        timeout: 180_000,
      });
      results.push({
        step: 'pytest',
        passed: pytestResult.exitCode === 0,
        output: pytestResult.stdout || pytestResult.stderr,
        duration: Date.now() - pytestStart,
      });
      logger.info(`Pytest: ${pytestResult.exitCode === 0 ? 'PASSED' : 'FAILED'}`);
    } else {
      results.push({ step: 'pytest', passed: true, output: 'SKIPPED: pytest not installed', duration: 0 });
      logger.info('Pytest: SKIPPED (not installed)');
    }

    // Step 3: Playwright E2E (필수)
    const vmsworksUrl = process.env.VMSWORKS_URL || 'http://localhost:5000';
    logger.info(`Checking vmsworks server availability at ${vmsworksUrl}...`);
    const serverReady = await waitForServer(vmsworksUrl);

    if (!serverReady) {
      results.push({
        step: 'playwright',
        passed: false,
        output: `FAILED: vmsworks server not reachable at ${vmsworksUrl}. Playwright E2E cannot run without the target server.`,
        duration: 0,
      });
      logger.error('Playwright E2E: SKIPPED — server health check failed');
    } else {
      const e2eStart = Date.now();
      const e2eResult = await execCommand('npx playwright test --reporter=list,html', {
        cwd: repoPath,
        timeout: 300_000,
      });

      // 실패 시 스크린샷 경로 수집
      let screenshotPaths: string[] = [];
      if (e2eResult.exitCode !== 0) {
        screenshotPaths = await collectScreenshots(repoPath);
      }

      results.push({
        step: 'playwright',
        passed: e2eResult.exitCode === 0,
        output: e2eResult.stdout || e2eResult.stderr,
        duration: Date.now() - e2eStart,
        screenshotPaths: screenshotPaths.length > 0 ? screenshotPaths : undefined,
      });
      logger.info(`Playwright E2E: ${e2eResult.exitCode === 0 ? 'PASSED' : 'FAILED'}${screenshotPaths.length > 0 ? ` (${screenshotPaths.length} screenshots captured)` : ''}`);
    }

    // 결과 종합
    const allPassed = results.every(r => r.passed);
    const testResultsJson = JSON.stringify(results);
    const finalStatus = allPassed ? 'completed' : 'failed';

    await upsertWorkflow(vocId, {
      phase: 'testing',
      status: finalStatus,
      test_results: testResultsJson,
      testing_completed_at: new Date(),
    });
    broadcastSSE({ type: 'workflow-updated', vocId });

    // Telegram 알림 — 요약 포함
    const summary = results
      .map(r => `${r.passed ? '✅' : '❌'} ${r.step} (${(r.duration / 1000).toFixed(1)}s)`)
      .join('\n');

    try {
      await notifyStatusChange(
        vocId,
        data.title || vocId,
        'testing',
        `${finalStatus}\n${summary}`,
      );
    } catch (err) {
      logger.warn('Telegram notification failed:', err);
    }

    logger.info(`Testing ${finalStatus} for VOC ${vocId}`, { allPassed, results: results.map(r => ({ step: r.step, passed: r.passed })) });

    return {
      status: allPassed ? 'tested' : 'test_failed',
      vocId,
      testResults: results,
    };
  } catch (err) {
    await upsertWorkflow(vocId, { phase: 'testing', status: 'failed' });
    broadcastSSE({ type: 'workflow-updated', vocId });

    try {
      await notifyStatusChange(vocId, data.title || vocId, 'testing', 'failed');
    } catch (notifyErr) {
      logger.warn('Telegram notification failed:', notifyErr);
    }

    logger.error(`Testing failed for VOC ${vocId}:`, err);
    throw err;
  }
}
