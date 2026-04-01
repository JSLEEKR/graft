import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/version.js';
import { createRequire } from 'node:module';

describe('VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('matches semver format', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('matches package.json version', () => {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    expect(VERSION).toBe(pkg.version);
  });
});
