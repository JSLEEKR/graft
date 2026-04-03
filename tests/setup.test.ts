import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

describe('project scaffolding', () => {
  it('vitest can run TypeScript tests', () => {
    // Proves vitest + TypeScript + ESM pipeline is wired correctly
    const x: number = 42;
    expect(x).toBe(42);
  });

  it('package.json is valid and has correct type', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    expect(pkg.name).toBe('@graft-lang/graft');
    expect(pkg.type).toBe('module');
    expect(pkg.bin.graft).toBe('./dist/index.js');
  });

  it('tsconfig.json has strict mode enabled', () => {
    const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf-8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.module).toBe('NodeNext');
  });

  it('example .gft file exists', () => {
    const content = readFileSync('examples/hello.gft', 'utf-8');
    expect(content).toContain('context UserRequest');
    expect(content).toContain('node Researcher');
    expect(content).toContain('graph SimpleQA');
  });

  it('tsc compiles without errors', { timeout: 30000 }, () => {
    // This is the real smoke test: does the full toolchain work?
    const result = execSync('npx tsc --noEmit', { encoding: 'utf-8', timeout: 25000 });
    // tsc --noEmit produces no output on success
    expect(result.trim()).toBe('');
  });
});
