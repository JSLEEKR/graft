/**
 * M2-7/M2-8: watch and visualize CLI command tests
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import * as path from 'path';

const CLI = path.resolve('dist/index.js');

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      exitCode: e.status ?? 1,
    };
  }
}

describe('graft visualize', () => {
  it('outputs Mermaid diagram for basic pipeline', () => {
    const { stdout, exitCode } = runCli(['visualize', 'benchmarks/correctness/basic_pipeline.gft']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('graph TD');
  });

  it('shows conditional branches', () => {
    const { stdout, exitCode } = runCli(['visualize', 'benchmarks/correctness/conditional_edge.gft']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('risk_score > 0.7');
    expect(stdout).toContain('else');
    expect(stdout).toContain('DetailedReviewer');
    expect(stdout).toContain('AutoApprove');
  });

  it('shows parallel subgraph', () => {
    const { stdout, exitCode } = runCli(['visualize', 'benchmarks/correctness/parallel_flow.gft']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('subgraph parallel');
  });

  it('shows edge transforms', () => {
    const { stdout, exitCode } = runCli(['visualize', 'benchmarks/correctness/conditional_edge.gft']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('compact');
  });

  it('shows model info in nodes', () => {
    const { stdout, exitCode } = runCli(['visualize', 'benchmarks/correctness/conditional_edge.gft']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('sonnet');
    expect(stdout).toContain('opus');
    expect(stdout).toContain('haiku');
  });

  it('fails on bad file', () => {
    const { exitCode, stderr } = runCli(['visualize', 'nonexistent.gft']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Error');
  });
});

describe('graft watch', () => {
  it('shows help', () => {
    const { stdout, exitCode } = runCli(['watch', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Watch .gft file and recompile on changes');
    expect(stdout).toContain('--out-dir');
  });
});
