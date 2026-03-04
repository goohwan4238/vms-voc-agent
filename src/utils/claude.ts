import { spawn } from 'child_process';
import logger from './logger';

const CLAUDE_PATH = process.env.CLAUDE_CODE_PATH || 'claude';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'sonnet';

// 소프트 타임아웃: 경고만 남기고 강제 종료하지 않음 (기본 30분)
const SOFT_TIMEOUT_MS = Number(process.env.CLAUDE_SOFT_TIMEOUT_MS) || 30 * 60 * 1000;

interface ClaudeOptions {
  cwd?: string;
  /** 로그에 표시할 작업 이름 */
  label?: string;
}

export function runClaude(prompt: string, options?: ClaudeOptions): Promise<string> {
  const label = options?.label || 'claude';

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const child = spawn(CLAUDE_PATH, ['-p', '--model', CLAUDE_MODEL], {
      cwd: options?.cwd,
      env: { ...process.env, CLAUDECODE: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];
    let stderrOutput = '';
    let softTimeoutFired = false;

    // stdout 스트리밍 수집
    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // stderr 수집
    child.stderr.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    // 소프트 타임아웃: 경고 로그만 남김 (강제 종료 안 함)
    const softTimer = setTimeout(() => {
      softTimeoutFired = true;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logger.warn(`[${label}] Claude CLI가 ${elapsed}초 경과 — 아직 실행 중 (소프트 타임아웃 경고)`);
    }, SOFT_TIMEOUT_MS);

    // 프로세스 완료
    child.on('close', (code) => {
      clearTimeout(softTimer);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (code !== 0) {
        logger.error(`[${label}] Claude CLI exited with code ${code} (${elapsed}s)`, {
          stderr: stderrOutput.substring(0, 500),
        });
        reject(new Error(`Claude CLI exited with code ${code}`));
        return;
      }

      const result = Buffer.concat(chunks).toString('utf-8').trim();
      if (!result) {
        reject(new Error('Claude CLI returned empty response'));
        return;
      }

      logger.info(`[${label}] Claude CLI completed in ${elapsed}s (${result.length} chars)`);
      resolve(result);
    });

    child.on('error', (err) => {
      clearTimeout(softTimer);
      logger.error(`[${label}] Claude CLI spawn error:`, err);
      reject(new Error(`Claude CLI spawn failed: ${err.message}`));
    });

    // stdin으로 프롬프트 전달
    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

export async function analyzeVOC(title: string, description: string): Promise<string> {
  const prompt = `다음 VOC를 분석하여 개발 관점에서 평가해주세요:

제목: ${title}
내용: ${description}

다음 형식으로 응답해주세요:
1. 요약 (한 문장)
2. 핵심 요구사항 (3개 이내)
3. 예상 개발 공수 (Low/Medium/High/Critical 중 선택)
4. 타 기능 영향도 (관련 모듈/테이블 추정)
5. 리스크 요소
6. 개발 권고 (개발/보류/반려 중 선택)`;

  logger.info('Running VOC analysis via Claude CLI');
  return runClaude(prompt, { label: 'analysis' });
}

export async function generatePRD(analysis: string, vocData: any): Promise<string> {
  const prompt = `당신은 VMSWorks 시스템의 시니어 개발자입니다. 다음 VOC 분석 결과를 바탕으로 실행 가능한 PRD를 작성해주세요.

## 대상 시스템: VMSWorks
- Backend: Flask Blueprint, API는 /api/ 접두사
- Frontend: 새 화면은 Vue.js (SPA), 기존 화면은 Jinja2 템플릿
- ORM: SQLAlchemy, 마이그레이션은 Flask-Migrate (alembic)
- 인증: Flask-Login (@login_required)
- DB: PostgreSQL
- CSP: 모든 script/style에 nonce 필수
- 디렉토리 구조: app/blueprints/, app/models/, app/templates/, app/static/

## VOC 정보
- 제목: ${vocData.title}
- 분석 결과:
${analysis}

## 작성 규칙
- 각 섹션은 구체적이고 실행 가능해야 합니다
- 코드 예시가 필요한 경우 Python/Flask 패턴을 사용하세요
- 테이블명은 snake_case, 모델명은 PascalCase를 따르세요

다음 섹션을 Markdown으로 작성하세요:

1. 개요 — 배경, 목적, 범위
2. 목표 — 측정 가능한 성공 기준 (KPI)
3. 사용자 스토리 — 역할별 시나리오 (Given-When-Then)
4. 데이터 모델 — 테이블/컬럼 정의 (SQLAlchemy 모델 기준, 타입/제약조건 포함)
5. API 명세 — 엔드포인트, HTTP 메서드, 요청/응답 JSON 형식, 상태 코드
6. UI 화면 명세 — 화면별 컴포넌트, 레이아웃, 인터랙션, Vue.js/Jinja2 선택 근거
7. 타 기능 영향도 — 기존 모듈/테이블/API에 대한 영향 분석
8. 기술적 구현 가이드 — 생성/수정할 파일 목록, 코드 패턴, Blueprint 구조
9. 테스트 계획 — API 테스트 케이스 (pytest), UI 테스트 시나리오, 엣지 케이스
10. 일정 — 단계별 추정 (분석/구현/테스트/배포)`;

  logger.info('Running PRD generation via Claude CLI');
  return runClaude(prompt, { label: 'prd-writing' });
}

export async function developFromPRD(prdContent: string): Promise<string> {
  const repoPath = process.env.VMSWORKS_REPO_PATH;

  if (!repoPath) {
    throw new Error('VMSWORKS_REPO_PATH 환경변수가 설정되지 않았습니다');
  }

  const prompt = `당신은 VMSWorks 프로젝트의 개발자입니다. 아래 PRD를 기반으로 코드를 구현하세요.

## 개발 규칙
- Flask Blueprint 패턴 사용 (/api/ 접두사)
- SQLAlchemy 모델은 app/models/ 에 작성
- 새 화면은 Vue.js, 기존 화면 수정은 Jinja2 유지
- 모든 API에 @login_required 데코레이터 적용
- CSP nonce를 script/style 태그에 적용
- Flask-Migrate로 마이그레이션 파일 생성
- 기존 코드 패턴과 컨벤션을 따를 것
- pytest 테스트 파일도 함께 생성 (tests/ 디렉토리)

## PRD 내용
${prdContent}

위 PRD에 따라 필요한 파일을 생성하고 수정하세요. 각 변경사항에 대한 요약을 마지막에 출력하세요.`;

  logger.info('Running development via Claude CLI', { repoPath });
  return runClaude(prompt, { cwd: repoPath, label: 'development' });
}
