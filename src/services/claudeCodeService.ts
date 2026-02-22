import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger';

const execAsync = promisify(exec);

const CLAUDE_CODE_PATH = process.env.CLAUDE_CODE_PATH || 'claude';
const HEARTBEAT_INTERVAL = 30000; // 30초마다 상태 확인
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30분 타임아웃

export interface ClaudeCodeSession {
  sessionName: string;
  vocId: number;
  status: 'starting' | 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: Date;
  lastHeartbeat: Date;
  output: string[];
}

const activeSessions = new Map<number, ClaudeCodeSession>();

// --- tmux 세션 관리 ---

export async function createSession(vocId: number, prdPath: string, branch: string): Promise<ClaudeCodeSession> {
  const sessionName = `voc-${vocId}`;

  // 기존 세션 정리
  await killSession(sessionName).catch(() => {});

  // tmux 세션 생성
  const prompt = `PRD 파일 ${prdPath}을 기반으로 feature/${branch} 브랜치에서 개발을 진행해주세요. 완료되면 'DEVELOPMENT_COMPLETE'를 출력해주세요.`;

  await execAsync(
    `tmux new-session -d -s ${sessionName} -x 200 -y 50`
  );

  // Claude Code 실행
  await execAsync(
    `tmux send-keys -t ${sessionName} '${CLAUDE_CODE_PATH} --print "${escapeShellArg(prompt)}"' Enter`
  );

  const session: ClaudeCodeSession = {
    sessionName,
    vocId,
    status: 'starting',
    startedAt: new Date(),
    lastHeartbeat: new Date(),
    output: [],
  };

  activeSessions.set(vocId, session);
  logger.info(`Claude Code session created: ${sessionName}`);

  return session;
}

export async function killSession(sessionName: string): Promise<void> {
  try {
    await execAsync(`tmux kill-session -t ${sessionName}`);
    logger.info(`Session killed: ${sessionName}`);
  } catch {
    // 세션이 없으면 무시
  }
}

// --- HEARTBEAT 모니터링 ---

export async function captureSessionOutput(sessionName: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `tmux capture-pane -t ${sessionName} -p -S -50`
    );
    return stdout.trim();
  } catch (err) {
    logger.error(`Failed to capture session ${sessionName}:`, err);
    return '';
  }
}

export function startHeartbeatMonitor(
  vocId: number,
  onComplete: (vocId: number, output: string) => void,
  onError: (vocId: number, error: string) => void,
): NodeJS.Timeout {
  const interval = setInterval(async () => {
    const session = activeSessions.get(vocId);
    if (!session) {
      clearInterval(interval);
      return;
    }

    try {
      const output = await captureSessionOutput(session.sessionName);
      session.lastHeartbeat = new Date();
      session.output.push(output);

      // 완료 키워드 감지
      if (output.includes('DEVELOPMENT_COMPLETE')) {
        session.status = 'completed';
        clearInterval(interval);
        activeSessions.delete(vocId);
        await killSession(session.sessionName);
        onComplete(vocId, output);
        return;
      }

      // 에러 키워드 감지
      if (output.includes('ERROR:') || output.includes('FATAL:')) {
        session.status = 'failed';
        clearInterval(interval);
        activeSessions.delete(vocId);
        await killSession(session.sessionName);
        onError(vocId, output);
        return;
      }

      // 타임아웃 체크
      const elapsed = Date.now() - session.startedAt.getTime();
      if (elapsed > SESSION_TIMEOUT) {
        session.status = 'timeout';
        clearInterval(interval);
        activeSessions.delete(vocId);
        await killSession(session.sessionName);
        onError(vocId, `Session timeout after ${SESSION_TIMEOUT / 60000} minutes`);
        return;
      }

      session.status = 'running';
    } catch (err) {
      logger.error(`Heartbeat error for VOC ${vocId}:`, err);
    }
  }, HEARTBEAT_INTERVAL);

  return interval;
}

// --- 유틸 ---

export async function isSessionAlive(sessionName: string): Promise<boolean> {
  try {
    await execAsync(`tmux has-session -t ${sessionName}`);
    return true;
  } catch {
    return false;
  }
}

export function getActiveSession(vocId: number): ClaudeCodeSession | undefined {
  return activeSessions.get(vocId);
}

export async function sendCommand(sessionName: string, command: string): Promise<void> {
  await execAsync(
    `tmux send-keys -t ${sessionName} '${escapeShellArg(command)}' Enter`
  );
}

function escapeShellArg(arg: string): string {
  return arg.replace(/'/g, "'\\''");
}
