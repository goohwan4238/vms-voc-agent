import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger';
import * as repo from '../db/vocWorkflowRepository';
import { sendTestResult, sendError } from './telegramService';

const execAsync = promisify(exec);

export interface TestResult {
  total: number;
  passed: number;
  failed: number;
  coverage: number | null;
  details: string;
  bugs: string[];
}

export async function processTesting(vocId: number, data: any) {
  logger.info(`Starting tests for VOC ${vocId}`);

  try {
    await repo.updateStatus(vocId, 'testing');

    const branch = data.branch || `feature/voc-${vocId}`;

    // 테스트 브랜치로 이동
    try {
      await execAsync(`git checkout ${branch}`);
    } catch {
      logger.warn(`Could not checkout ${branch}, running tests on current branch`);
    }

    // 테스트 실행
    const testResult = await runTests();

    // DB에 테스트 결과 저장
    await repo.saveTestResult(vocId, testResult);

    logger.info(`Tests completed for VOC ${vocId}: ${testResult.passed}/${testResult.total} passed`);

    // Telegram 알림: 테스트 결과 + 배포 의사결정 요청
    await sendTestResult(vocId, testResult);

    return {
      status: 'tested',
      vocId,
      testResult,
    };
  } catch (err) {
    logger.error(`Testing failed for VOC ${vocId}:`, err);
    await repo.updateStatus(vocId, 'error').catch(() => {});
    await sendError(vocId, `테스트 실행 중 오류: ${(err as Error).message}`);
    throw err;
  }
}

async function runTests(): Promise<TestResult> {
  const result: TestResult = {
    total: 0,
    passed: 0,
    failed: 0,
    coverage: null,
    details: '',
    bugs: [],
  };

  // 1. 단위 테스트 실행 (npm test)
  try {
    const { stdout, stderr } = await execAsync('npm test 2>&1', {
      timeout: 300000, // 5분 타임아웃
    });

    const output = stdout + stderr;
    result.details = output;

    // Jest 결과 파싱
    const testMatch = output.match(/Tests:\s+(\d+)\s+passed.*?(\d+)\s+total/);
    if (testMatch) {
      result.passed = parseInt(testMatch[1]);
      result.total = parseInt(testMatch[2]);
      result.failed = result.total - result.passed;
    }

    // 실패 테스트 파싱
    const failMatch = output.match(/Tests:\s+(\d+)\s+failed/);
    if (failMatch) {
      result.failed = parseInt(failMatch[1]);
    }

    // 커버리지 파싱
    const coverageMatch = output.match(/All files\s*\|\s*([\d.]+)/);
    if (coverageMatch) {
      result.coverage = parseFloat(coverageMatch[1]);
    }

    // 실패 항목 수집
    const failedTests = output.match(/FAIL\s+(.+)/g);
    if (failedTests) {
      result.bugs = failedTests.map((f) => f.replace('FAIL ', '').trim());
    }
  } catch (err: any) {
    // 테스트 실패해도 결과는 파싱
    const output = err.stdout || err.stderr || err.message;
    result.details = output;

    const testMatch = output.match(/Tests:\s+(\d+)\s+failed.*?(\d+)\s+total/);
    if (testMatch) {
      result.failed = parseInt(testMatch[1]);
      result.total = parseInt(testMatch[2]);
      result.passed = result.total - result.failed;
    }

    const failedTests = output.match(/FAIL\s+(.+)/g);
    if (failedTests) {
      result.bugs = failedTests.map((f: string) => f.replace('FAIL ', '').trim());
    }

    // 테스트 스크립트 자체가 없는 경우
    if (output.includes('Missing script: "test"') || output.includes('no test specified')) {
      result.details = '테스트 스크립트가 설정되지 않았습니다.';
      result.total = 0;
    }
  }

  // 2. 타입 체크
  try {
    await execAsync('npm run typecheck 2>&1');
    logger.info('TypeScript type check passed');
  } catch (err: any) {
    const typeErrors = (err.stdout || '').match(/error TS\d+/g);
    if (typeErrors) {
      result.bugs.push(`TypeScript 에러 ${typeErrors.length}개`);
    }
  }

  return result;
}
