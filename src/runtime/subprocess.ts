import { spawn, ChildProcess } from 'node:child_process';

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface SpawnOptions {
  args: string[];
  cwd: string;
  timeoutMs: number;
}

export function spawnClaude(options: SpawnOptions): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn('claude', options.args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    child.stdin?.end(); // Critical: close stdin immediately

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, options.timeoutMs);

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error('Claude CLI not found. Install: npm install -g @anthropic-ai/claude-code'));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');
      if (timedOut) {
        reject(new Error(`Claude subprocess timed out after ${options.timeoutMs / 1000}s. stderr: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

export function extractJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  try { return JSON.parse(trimmed); } catch { /* fallback */ }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)); } catch { /* fallback */ }
  }
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try { return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1)); } catch { /* fallback */ }
  }
  throw new Error(`Failed to parse JSON from claude output. First 200 chars: ${trimmed.slice(0, 200)}`);
}
