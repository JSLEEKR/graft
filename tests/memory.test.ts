import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadMemory } from '../src/runtime/memory.js';

describe('loadMemory — verbose option', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-mem-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs warning when verbose=true and JSON is corrupt', () => {
    const filePath = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(filePath, 'NOT VALID JSON {{{');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = loadMemory(tmpDir, 'Broken', { verbose: true });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('[MEMORY]');
    expect(warnSpy.mock.calls[0][0]).toContain('invalid JSON');
    expect(warnSpy.mock.calls[0][0]).toContain(filePath);
    warnSpy.mockRestore();
  });

  it('does not log warning when no options and JSON is corrupt', () => {
    const filePath = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(filePath, 'NOT VALID JSON {{{');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = loadMemory(tmpDir, 'Broken');

    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
