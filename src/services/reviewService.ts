import fs from 'fs/promises';
import path from 'path';
import { runClaude } from '../utils/claude';
import { execCommand } from '../utils/exec';
import { upsertWorkflow, getWorkflow } from '../utils/db';
import { broadcastSSE } from '../utils/sse';
import { notifyStatusChange } from '../utils/telegram';
import logger from '../utils/logger';

interface ReviewStepResult {
  step: string;
  passed: boolean;
  output: string;
  issues: string[];
}

interface ReviewResult {
  steps: ReviewStepResult[];
  overallPassed: boolean;
  summary: string;
}

// venv 내 Python 실행 파일 경로
function getVenvPython(repoPath: string): string {
  const isWin = process.platform === 'win32';
  return path.join(repoPath, 'venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
}

// Step 1: ruff check (린트 검사) — 자동 수정 없이 검사만
async function runRuffCheck(repoPath: string): Promise<ReviewStepResult> {
  const venvPython = getVenvPython(repoPath);
  const result = await execCommand(
    `"${venvPython}" -m ruff check app/ --output-format=text`,
    { cwd: repoPath, timeout: 60_000 }
  );

  const issues = result.stdout
    ? result.stdout.trim().split('\n').filter(Boolean)
    : [];

  return {
    step: 'ruff-lint',
    passed: result.exitCode === 0,
    output: result.stdout || result.stderr || 'No issues found',
    issues,
  };
}

// Step 2: 기본 보안 패턴 검사
async function runSecurityCheck(repoPath: string): Promise<ReviewStepResult> {
  const patterns = [
    { pattern: 'password\\s*=\\s*["\'][^"\']+["\']', desc: 'Hardcoded password' },
    { pattern: 'secret\\s*=\\s*["\'][^"\']+["\']', desc: 'Hardcoded secret' },
    { pattern: 'execute\\s*\\(\\s*["\'].*%s', desc: 'SQL injection risk (string formatting)' },
    { pattern: 'execute\\s*\\(\\s*f["\']', desc: 'SQL injection risk (f-string)' },
    { pattern: '\\|\\s*safe\\b', desc: 'Jinja2 safe filter (XSS risk)' },
  ];

  const issues: string[] = [];

  for (const { pattern, desc } of patterns) {
    const result = await execCommand(
      process.platform === 'win32'
        ? `findstr /s /r /n "${pattern}" app\\*.py`
        : `grep -rn "${pattern}" app/ --include="*.py" || true`,
      { cwd: repoPath, timeout: 30_000 }
    );

    if (result.stdout && result.stdout.trim()) {
      const matches = result.stdout.trim().split('\n').filter(Boolean);
      for (const match of matches) {
        issues.push(`[${desc}] ${match.trim()}`);
      }
    }
  }

  return {
    step: 'security-scan',
    passed: issues.length === 0,
    output: issues.length === 0
      ? 'No security issues detected'
      : `Found ${issues.length} potential security issue(s)`,
    issues,
  };
}

// Step 3: Claude CLI로 코드 품질 리뷰 (개발 결과물 검토)
async function runCodeQualityReview(
  repoPath: string,
  prdContent: string,
): Promise<ReviewStepResult> {
  const prompt = `당신은 시니어 코드 리뷰어입니다. 최근 변경된 코드(git diff HEAD~1)를 검토하고, PRD를 참고하여 코드 품질을 평가해주세요.

## PRD (참고용)
${prdContent.substring(0, 3000)}

## 코드 리뷰 기준 (중요도 순)
1. **버그/오류**: 런타임 에러, 논리 오류, 예외 처리 누락
2. **보안**: SQL 인젝션, XSS, 인증/권한 누락, 민감정보 노출
3. **코드 품질**: 중복 코드, 복잡도, 네이밍, 가독성
4. **Flask 패턴 준수**: Blueprint 구조, @login_required, CSP nonce
5. **DB 안전성**: 마이그레이션 누락, N+1 쿼리, 인덱스 필요 여부
6. **PRD 충족도**: 요구사항 대비 구현 완성도

## 응답 형식 (반드시 이 형식으로)
PASSED: [true 또는 false — 심각한 버그/보안 이슈가 없으면 true]
ISSUES:
- [발견된 문제점, 없으면 "없음"]
SUMMARY: [한 문장 요약]`;

  try {
    const response = await runClaude(prompt, { cwd: repoPath, label: 'code-review' });

    const passedMatch = response.match(/PASSED:\s*(true|false)/i);
    const passed = passedMatch ? passedMatch[1].toLowerCase() === 'true' : false;

    const issuesMatch = response.match(/ISSUES:\n([\s\S]*?)(?=SUMMARY:|$)/);
    const issueLines = issuesMatch
      ? issuesMatch[1].trim().split('\n').filter(l => l.trim().startsWith('-') && !l.includes('없음'))
      : [];

    const summaryMatch = response.match(/SUMMARY:\s*(.+)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : 'Review completed';

    return {
      step: 'code-quality',
      passed,
      output: summary,
      issues: issueLines.map(l => l.replace(/^-\s*/, '').trim()),
    };
  } catch (err) {
    logger.error('PRD compliance check failed:', err);
    return {
      step: 'code-quality',
      passed: false,
      output: `Review failed: ${err instanceof Error ? err.message : String(err)}`,
      issues: ['Claude CLI review failed — manual review required'],
    };
  }
}

export async function processReview(vocId: string, data: any): Promise<{
  status: string;
  vocId: string;
  reviewResult: ReviewResult;
}> {
  const repoPath = process.env.VMSWORKS_REPO_PATH;

  if (!repoPath) {
    throw new Error('VMSWORKS_REPO_PATH 환경변수가 설정되지 않았습니다');
  }

  logger.info(`Starting code review for VOC ${vocId}`);

  try {
    await upsertWorkflow(vocId, { phase: 'review', status: 'in_progress', review_started_at: new Date() });
    broadcastSSE({ type: 'workflow-updated', vocId });

    const steps: ReviewStepResult[] = [];

    // Step 1: ruff lint
    const ruffResult = await runRuffCheck(repoPath);
    steps.push(ruffResult);
    logger.info(`Review ruff-lint: ${ruffResult.passed ? 'PASSED' : 'FAILED'} (${ruffResult.issues.length} issues)`);

    // Step 2: Security scan
    const securityResult = await runSecurityCheck(repoPath);
    steps.push(securityResult);
    logger.info(`Review security-scan: ${securityResult.passed ? 'PASSED' : 'FAILED'} (${securityResult.issues.length} issues)`);

    // Step 3: PRD compliance (Claude CLI)
    let prdContent = '';
    const prdPath = data.prdPath || (await getWorkflow(vocId))?.prd_path;
    if (prdPath) {
      try {
        prdContent = await fs.readFile(prdPath, 'utf-8');
      } catch {
        prdContent = data.analysis || '';
      }
    }

    if (prdContent) {
      const complianceResult = await runCodeQualityReview(repoPath, prdContent);
      steps.push(complianceResult);
      logger.info(`Review code-quality: ${complianceResult.passed ? 'PASSED' : 'FAILED'}`);
    } else {
      steps.push({
        step: 'code-quality',
        passed: true,
        output: 'SKIPPED: No PRD content available',
        issues: [],
      });
    }

    // 결과 종합
    const overallPassed = steps.every(s => s.passed);
    const allIssues = steps.flatMap(s => s.issues);
    const summary = overallPassed
      ? 'All review checks passed'
      : `Review found ${allIssues.length} issue(s): ${steps.filter(s => !s.passed).map(s => s.step).join(', ')}`;

    const reviewResult: ReviewResult = { steps, overallPassed, summary };
    const reviewResultsJson = JSON.stringify(reviewResult);
    const finalStatus = overallPassed ? 'completed' : 'failed';

    await upsertWorkflow(vocId, {
      phase: 'review',
      status: finalStatus,
      review_results: reviewResultsJson,
      review_completed_at: new Date(),
    });
    broadcastSSE({ type: 'workflow-updated', vocId });

    // Telegram 알림
    const stepSummary = steps
      .map(s => `${s.passed ? '✅' : '❌'} ${s.step} (${s.issues.length} issues)`)
      .join('\n');

    try {
      await notifyStatusChange(
        vocId,
        data.title || vocId,
        'review',
        `${finalStatus}\n${stepSummary}`,
      );
    } catch (err) {
      logger.warn('Telegram notification failed:', err);
    }

    logger.info(`Review ${finalStatus} for VOC ${vocId}`, { overallPassed, summary });

    return {
      status: overallPassed ? 'reviewed' : 'review_failed',
      vocId,
      reviewResult,
    };
  } catch (err) {
    await upsertWorkflow(vocId, { phase: 'review', status: 'failed' });
    broadcastSSE({ type: 'workflow-updated', vocId });

    try {
      await notifyStatusChange(vocId, data.title || vocId, 'review', 'failed');
    } catch (notifyErr) {
      logger.warn('Telegram notification failed:', notifyErr);
    }

    logger.error(`Review failed for VOC ${vocId}:`, err);
    throw err;
  }
}
