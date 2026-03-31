# T7 Convergence: Compiler Pipeline & CLI

## Verification

```
npx tsc --noEmit  -> clean (0 errors)
npx vitest run    -> 110 tests passed (101 prior + 9 new integration tests)
```

## Files Created/Modified

| File | Action | Lines |
|------|--------|-------|
| `src/compiler.ts` | CREATE | 81 |
| `src/index.ts` | OVERWRITE | 103 |
| `tests/integration.test.ts` | CREATE | 120 |

## Unanimous Fixes Applied

### Fix 1: Import path `./analyzer/tokens.js` -> `./analyzer/estimator.js`
All four agents flagged. Build-breaking. Applied in `src/compiler.ts`.

### Fix 2: Parser constructor `new Parser(tokens, source)` -> `new Parser(tokens)`
All four agents flagged. Build-breaking per T4-R01. Applied in `src/compiler.ts`.

### Fix 3: "No graph = silent success" guard
A3 discovered, A1/A2/A4 accepted. After parsing, `compile()` checks `program.graphs.length === 0` and returns `success: false` with a descriptive error. Prevents the compiler from silently producing degenerate output for incomplete `.gft` files.

### Fix 4: `check` command description
A3 flagged, all agents agreed the description was misleading. Changed from `'Check .gft source (parse + analyze, no generation)'` to `'Validate .gft source without writing files'`.

### Fix 5: `toLocaleString('en-US')` in CLI
A3 flagged locale-dependent formatting. Applied `'en-US'` consistently to all `.toLocaleString()` calls in `src/index.ts`, matching T6-R02 convention.

### Fix 6: `writeFiles` error handling in CLI
A3 flagged that filesystem errors in `writeFiles()` would produce raw stack traces. Added try-catch around `compileAndWrite()` in the CLI compile action handler, printing a clean error message and exiting with code 1.

### Fix 7: Lexer error integration test
A3 flagged missing coverage of the `catch (e) { if (e instanceof GraftError) }` path. Added `'catches lexer errors'` test case with `'@@@'` input.

### Fix 8: No-graph-declaration integration test
Added test verifying that programs without a `graph` declaration fail with the expected error message.

## Architecture Decisions Confirmed

1. **Pipeline ordering**: Lex -> Parse -> Graph guard -> Scope -> Type -> Gate -> Estimate -> Codegen
2. **Dual error handling**: throw-on-first for lex/parse, accumulate for analyzers
3. **`compiler.ts` is pure orchestration** -- no business logic (T7-R01)
4. **`CompileResult` discriminated type** with `success` boolean (T7-R02)
5. **`process.exit` only in CLI handlers**, not library code (T7-R03)
6. **Integration tests use inline source strings**, not filesystem reads (T7-R04)
7. **`check` runs full pipeline in-memory** including codegen -- intentional, validates full pipeline without disk writes
8. **`compileAndWrite` is a thin wrapper**: compile() + writeFiles()
9. **Non-GraftError exceptions re-throw** -- unexpected bugs should crash, not be swallowed
10. **Hardcoded version string** avoids need for `resolveJsonModule`

## Deferred Items

| Item | Rationale |
|------|-----------|
| CRLF caret misalignment in `GraftError.format()` | Pre-existing bug in `diagnostics.ts` (T2 scope), not T7 |
| `readSource` permission error handling | Rare edge case, raw error is informative enough |
| Multiple `graph` declarations warning | Single-graph spec for v1 |
| `CompileResult` true discriminated union | Acceptable trade-off; tests use `!` assertions |
| Integration test fixture breadth (tools, on_failure, etc.) | Unit tests in T6 cover these features |

## Ratchet Locks

- **[T7-R01]** `compiler.ts` is pure orchestration -- no business logic
- **[T7-R02]** `CompileResult` discriminated type with `success` boolean
- **[T7-R03]** `process.exit` only in CLI handlers, not library code
- **[T7-R04]** Integration tests use inline source strings, not filesystem reads
- **[T7-R05]** Compiler rejects programs with zero graph declarations

## Test Count Progression

T1: 5 -> T2: 31 -> T3: 31 -> T4: 64 -> T5: 78 -> T6: 101 -> **T7: 110**

---

## Complete File Contents

### src/compiler.ts

```typescript
import { Lexer } from './lexer/lexer.js';
import { Parser } from './parser/parser.js';
import { ScopeChecker } from './analyzer/scope.js';
import { TypeChecker } from './analyzer/types.js';
import { TokenEstimator, TokenReport } from './analyzer/estimator.js';
import { generate, GeneratedFile, writeFiles } from './codegen/codegen.js';
import { GraftError } from './errors/diagnostics.js';
import { Program } from './parser/ast.js';

export interface CompileResult {
  success: boolean;
  program?: Program;
  report?: TokenReport;
  files?: GeneratedFile[];
  errors: GraftError[];
  warnings: GraftError[];
}

export function compile(source: string, sourceFile: string): CompileResult {
  const errors: GraftError[] = [];
  const warnings: GraftError[] = [];

  // Lex
  let tokens;
  try {
    const lexer = new Lexer(source);
    tokens = lexer.tokenize();
  } catch (e) {
    if (e instanceof GraftError) {
      return { success: false, errors: [e], warnings };
    }
    throw e;
  }

  // Parse
  let program: Program;
  try {
    const parser = new Parser(tokens);
    program = parser.parse();
  } catch (e) {
    if (e instanceof GraftError) {
      return { success: false, errors: [e], warnings };
    }
    throw e;
  }

  // Guard: no graph declaration
  if (program.graphs.length === 0) {
    return {
      success: false,
      errors: [new GraftError('No graph declaration found', { line: 1, column: 1, offset: 0 })],
      warnings,
    };
  }

  // Analyze: scope
  const scopeErrors = new ScopeChecker(program).check();
  errors.push(...scopeErrors);

  // Analyze: types
  const typeErrors = new TypeChecker(program).check();
  errors.push(...typeErrors);

  if (errors.length > 0) {
    return { success: false, program, errors, warnings };
  }

  // Analyze: tokens
  const report = new TokenEstimator(program).estimate();
  warnings.push(...report.warnings);

  // Generate
  const files = generate(program, report, sourceFile);

  return { success: true, program, report, files, errors, warnings };
}

export function compileAndWrite(source: string, sourceFile: string, outDir: string): CompileResult {
  const result = compile(source, sourceFile);
  if (result.success && result.files) {
    writeFiles(result.files, outDir);
  }
  return result;
}
```

### src/index.ts

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile, compileAndWrite } from './compiler.js';

const program = new Command();

program
  .name('graft')
  .description('Graft compiler — graph-native language for AI agent harness engineering')
  .version('0.1.0');

program
  .command('compile')
  .description('Compile .gft source to Claude Code harness structure')
  .argument('<file>', '.gft source file')
  .option('--out-dir <dir>', 'output directory', '.')
  .action((file: string, opts: { outDir: string }) => {
    const source = readSource(file);

    let result;
    try {
      result = compileAndWrite(source, path.basename(file), path.resolve(opts.outDir));
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }

    if (!result.success) {
      console.error('\n✗ Compilation failed:\n');
      for (const err of result.errors) {
        console.error(err.format(source));
        console.error('');
      }
      process.exit(1);
    }

    console.log('\n✓ Parse OK');
    console.log('✓ Scope check OK');
    console.log('✓ Type check OK');

    if (result.report) {
      console.log('✓ Token analysis:');
      for (const node of result.report.nodes) {
        console.log(`    ${node.name.padEnd(20)} in ~${node.estimatedIn.toLocaleString('en-US').padStart(6)}  out ~${node.estimatedOut.toLocaleString('en-US').padStart(6)}`);
      }
      console.log(`    Best path:  ${result.report.bestCase.toLocaleString('en-US').padStart(8)} tokens ${result.report.bestCase <= result.report.budget ? '✓' : '✗'} ${result.report.bestCase <= result.report.budget ? 'within' : 'exceeds'} budget (${result.report.budget.toLocaleString('en-US')})`);
      console.log(`    Worst path: ${result.report.worstCase.toLocaleString('en-US').padStart(8)} tokens ${result.report.worstCase <= result.report.budget ? '✓' : '⚠'} ${result.report.worstCase <= result.report.budget ? 'within' : 'exceeds'} budget (${result.report.budget.toLocaleString('en-US')})`);
    }

    for (const w of result.warnings) {
      console.log(`\n⚠ ${w.message}`);
    }

    if (result.files) {
      console.log('\nGenerated:');
      for (const f of result.files) {
        console.log(`  ${f.path}`);
      }
    }
    console.log('');
  });

program
  .command('check')
  .description('Validate .gft source without writing files')
  .argument('<file>', '.gft source file')
  .action((file: string) => {
    const source = readSource(file);
    const result = compile(source, path.basename(file));

    if (!result.success) {
      console.error('\n✗ Check failed:\n');
      for (const err of result.errors) {
        console.error(err.format(source));
        console.error('');
      }
      process.exit(1);
    }

    console.log('\n✓ Parse OK');
    console.log('✓ Scope check OK');
    console.log('✓ Type check OK');

    if (result.report) {
      console.log('✓ Token analysis:');
      for (const node of result.report.nodes) {
        console.log(`    ${node.name.padEnd(20)} in ~${node.estimatedIn.toLocaleString('en-US').padStart(6)}  out ~${node.estimatedOut.toLocaleString('en-US').padStart(6)}`);
      }
      console.log(`    Best path:  ${result.report.bestCase.toLocaleString('en-US').padStart(8)} tokens`);
      console.log(`    Worst path: ${result.report.worstCase.toLocaleString('en-US').padStart(8)} tokens`);
    }

    for (const w of result.warnings) {
      console.log(`\n⚠ ${w.message}`);
    }
    console.log('');
  });

function readSource(file: string): string {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: file not found: ${resolved}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, 'utf-8');
}

program.parse();
```

### tests/integration.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import { GraftError } from '../src/errors/diagnostics.js';

const HELLO_GFT = `
context UserRequest(max_tokens: 500) {
  question: String
}

node Researcher(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]

  produces Research {
    findings: List<String>
    confidence: Float(0..1)
  }
}

node Writer(model: haiku, budget: 1500/800) {
  reads: [Research.findings]

  produces Answer {
    response: String
  }
}

edge Researcher -> Writer
  | select(findings)
  | compact

graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
  Researcher -> Writer -> done
}
`;

describe('end-to-end compilation', () => {
  it('compiles hello.gft successfully', () => {
    const result = compile(HELLO_GFT, 'hello.gft');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.program).toBeDefined();
    expect(result.report).toBeDefined();
    expect(result.files).toBeDefined();
  });

  it('generates correct file set', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const filePaths = result.files!.map(f => f.path).sort();

    expect(filePaths).toContain('.claude/CLAUDE.md');
    expect(filePaths).toContain('.claude/agents/researcher.md');
    expect(filePaths).toContain('.claude/agents/writer.md');
    expect(filePaths).toContain('.claude/hooks/researcher-to-writer.sh');
    expect(filePaths).toContain('.claude/settings.json');
    expect(filePaths).toContain('.graft/session/node_outputs/.gitkeep');
    expect(filePaths).toContain('.graft/token_log.txt');
  });

  it('reports token analysis within budget', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const report = result.report!;

    expect(report.graphName).toBe('SimpleQA');
    expect(report.budget).toBe(6000);
    expect(report.bestCase).toBeLessThanOrEqual(report.budget);
    expect(report.nodes).toHaveLength(2);
    expect(report.warnings).toEqual([]);
  });

  it('generates valid JSON in settings', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const settingsFile = result.files!.find(f => f.path === '.claude/settings.json');
    expect(settingsFile).toBeDefined();

    const settings = JSON.parse(settingsFile!.content);
    expect(settings.model).toBe('claude-sonnet-4-20250514');
    expect(settings.graft.budget.total).toBe(6000);
    expect(settings.graft.model_routing.overrides.writer).toBe('claude-haiku-4-5-20251001');
  });

  it('generates agent markdown with correct structure', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const researcherAgent = result.files!.find(f => f.path === '.claude/agents/researcher.md');
    expect(researcherAgent).toBeDefined();
    expect(researcherAgent!.content).toContain('claude-sonnet-4-20250514');
    expect(researcherAgent!.content).toContain('===NODE_COMPLETE:researcher===');
  });

  it('generates hook script with jq transforms', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const hook = result.files!.find(f => f.path === '.claude/hooks/researcher-to-writer.sh');
    expect(hook).toBeDefined();
    expect(hook!.content).toContain('jq');
    expect(hook!.content).toContain('findings');
  });

  it('rejects invalid programs', () => {
    const badSource = `
      node A(model: sonnet, budget: 1k/500) {
        reads: [NonExistent]
        produces Out { data: String }
      }
      graph G(input: NonExistent, output: Out, budget: 5k) { A -> done }
    `;
    const result = compile(badSource, 'bad.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('catches lexer errors', () => {
    const result = compile('@@@', 'bad.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toBeInstanceOf(GraftError);
  });

  it('rejects programs with no graph declaration', () => {
    const noGraphSource = `
      context Ctx(max_tokens: 100) {
        data: String
      }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Ctx]
        produces Out { data: String }
      }
    `;
    const result = compile(noGraphSource, 'nograph.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('No graph declaration found');
  });
});
```
