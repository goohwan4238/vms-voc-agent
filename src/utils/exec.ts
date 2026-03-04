import { exec } from 'child_process';
import logger from './logger';

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function execCommand(command: string, options?: ExecOptions): Promise<ExecResult> {
  const timeout = options?.timeout || 120_000;
  const maxBuffer = options?.maxBuffer || 1024 * 1024 * 10; // 10MB

  return new Promise((resolve) => {
    logger.info(`Executing: ${command}`, { cwd: options?.cwd });

    exec(command, {
      cwd: options?.cwd,
      timeout,
      maxBuffer,
      encoding: 'utf-8',
    }, (error, stdout, stderr) => {
      const exitCode = error?.code ?? (error ? 1 : 0);

      if (error) {
        logger.warn(`Command exited with code ${exitCode}: ${command}`, {
          stderr: stderr?.substring(0, 500),
        });
      }

      resolve({
        stdout: stdout?.trim() || '',
        stderr: stderr?.trim() || '',
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
      });
    });
  });
}
