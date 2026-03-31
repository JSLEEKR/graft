/**
 * Graft Compiler Benchmark Runner
 *
 * Compiles all .gft files in benchmarks/correctness/ and benchmarks/error_cases/,
 * verifies expected outcomes, records timing and token data, and writes a
 * date-stamped JSON report to benchmarks/results/.
 *
 * Usage:  npx tsx benchmarks/run.ts
 * Exit:   0 if all cases pass, 1 if any fail
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile, CompileResult } from '../src/compiler.js';

// ---------------------------------------------------------------------------
// Expected errors for each error_cases/*.gft file.
// Key = filename without extension. Value = substring that must appear in at
// least one error message for the case to count as "matched".
// ---------------------------------------------------------------------------

const EXPECTED_ERRORS: Record<string, string> = {
  bad_field: 'does not exist',
  bad_ref: 'is not declared',
  missing_graph: 'No graph declaration found',
  no_graph: 'No graph declaration found',
  syntax_error: 'Expected',
  undefined_context_ref: 'is not declared',
  undefined_node_ref: 'is not declared',
};

// Cases that should compile successfully but MUST produce at least one warning
// containing the given substring.
const EXPECTED_WARNINGS: Record<string, string> = {
  over_budget: 'exceeds budget',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaseResult {
  name: string;
  category: 'correctness' | 'error_cases';
  status: 'pass' | 'fail';
  duration_ms: number;
  tokens_best?: number;
  tokens_worst?: number;
  tokens_budget?: number;
  file_count?: number;
  errors: string[];
  failure_reason?: string;
}

interface BenchmarkReport {
  timestamp: string;
  compiler_version: string;
  total: number;
  passed: number;
  failed: number;
  results: CaseResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getVersion(): string {
  const pkgPath = path.resolve(import.meta.dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return pkg.version ?? 'unknown';
}

function collectGftFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.gft'))
    .sort()
    .map((f) => path.join(dir, f));
}

function runCorrectness(filePath: string): CaseResult {
  const name = path.basename(filePath, '.gft');
  const source = fs.readFileSync(filePath, 'utf-8');

  const start = performance.now();
  let result: CompileResult;
  try {
    result = compile(source, path.basename(filePath));
  } catch (e: unknown) {
    const elapsed = performance.now() - start;
    return {
      name,
      category: 'correctness',
      status: 'fail',
      duration_ms: round(elapsed),
      errors: [String(e)],
      failure_reason: 'compile threw an exception',
    };
  }
  const elapsed = performance.now() - start;

  if (!result.success) {
    return {
      name,
      category: 'correctness',
      status: 'fail',
      duration_ms: round(elapsed),
      errors: result.errors.map((e) => e.message),
      failure_reason: 'expected success but compilation failed',
    };
  }

  return {
    name,
    category: 'correctness',
    status: 'pass',
    duration_ms: round(elapsed),
    tokens_best: result.report?.bestCase,
    tokens_worst: result.report?.worstCase,
    tokens_budget: result.report?.budget,
    file_count: result.files?.length,
    errors: [],
  };
}

function runErrorCase(filePath: string): CaseResult {
  const name = path.basename(filePath, '.gft');
  const source = fs.readFileSync(filePath, 'utf-8');
  const expectedSubstring = EXPECTED_ERRORS[name];
  const expectedWarning = EXPECTED_WARNINGS[name];

  const start = performance.now();
  let result: CompileResult;
  try {
    result = compile(source, path.basename(filePath));
  } catch (e: unknown) {
    // An uncaught throw still counts as a failure if the message matches
    const msg = e instanceof Error ? e.message : String(e);
    const elapsed = performance.now() - start;
    const matched = expectedSubstring ? msg.includes(expectedSubstring) : true;
    return {
      name,
      category: 'error_cases',
      status: matched ? 'pass' : 'fail',
      duration_ms: round(elapsed),
      errors: [msg],
      failure_reason: matched ? undefined : `error message did not contain "${expectedSubstring}"`,
    };
  }
  const elapsed = performance.now() - start;

  // Warning-only cases: compilation succeeds but must produce expected warnings
  if (expectedWarning) {
    const warningMessages = result.warnings.map((w) => w.message);
    const matched = warningMessages.some((m) => m.includes(expectedWarning));
    if (!result.success) {
      return {
        name,
        category: 'error_cases',
        status: 'fail',
        duration_ms: round(elapsed),
        errors: result.errors.map((e) => e.message),
        failure_reason: 'expected successful compile with warnings, but compilation failed',
      };
    }
    return {
      name,
      category: 'error_cases',
      status: matched ? 'pass' : 'fail',
      duration_ms: round(elapsed),
      tokens_best: result.report?.bestCase,
      tokens_worst: result.report?.worstCase,
      tokens_budget: result.report?.budget,
      file_count: result.files?.length,
      errors: warningMessages,
      failure_reason: matched ? undefined : `no warning contained "${expectedWarning}"`,
    };
  }

  // Standard error cases: compilation must fail
  if (result.success) {
    return {
      name,
      category: 'error_cases',
      status: 'fail',
      duration_ms: round(elapsed),
      errors: [],
      failure_reason: 'expected compilation failure but it succeeded',
    };
  }

  const errorMessages = result.errors.map((e) => e.message);

  if (expectedSubstring) {
    const matched = errorMessages.some((m) => m.includes(expectedSubstring));
    if (!matched) {
      return {
        name,
        category: 'error_cases',
        status: 'fail',
        duration_ms: round(elapsed),
        errors: errorMessages,
        failure_reason: `no error message contained "${expectedSubstring}"`,
      };
    }
  }

  return {
    name,
    category: 'error_cases',
    status: 'pass',
    duration_ms: round(elapsed),
    errors: errorMessages,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

function printTable(results: CaseResult[]): void {
  const colName = 30;
  const colCat = 14;
  const colStatus = 8;
  const colTime = 10;
  const colTokens = 18;
  const colFiles = 7;

  const header = [
    'Name'.padEnd(colName),
    'Category'.padEnd(colCat),
    'Status'.padEnd(colStatus),
    'Time (ms)'.padStart(colTime),
    'Tokens (best/worst)'.padEnd(colTokens),
    'Files'.padStart(colFiles),
  ].join('  ');

  const divider = '-'.repeat(header.length);

  console.log('');
  console.log(header);
  console.log(divider);

  for (const r of results) {
    const statusMark = r.status === 'pass' ? 'PASS' : 'FAIL';
    const tokensStr =
      r.tokens_best != null && r.tokens_worst != null
        ? `${r.tokens_best.toLocaleString('en-US')}/${r.tokens_worst.toLocaleString('en-US')}`
        : '-';
    const filesStr = r.file_count != null ? String(r.file_count) : '-';

    const line = [
      r.name.padEnd(colName),
      r.category.padEnd(colCat),
      statusMark.padEnd(colStatus),
      String(r.duration_ms).padStart(colTime),
      tokensStr.padEnd(colTokens),
      filesStr.padStart(colFiles),
    ].join('  ');

    console.log(line);

    if (r.failure_reason) {
      console.log(`  >> ${r.failure_reason}`);
    }
  }

  console.log(divider);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const benchDir = path.resolve(import.meta.dirname);
  const correctnessDir = path.join(benchDir, 'correctness');
  const errorDir = path.join(benchDir, 'error_cases');
  const resultsDir = path.join(benchDir, 'results');

  // Ensure results directory exists
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const correctnessFiles = collectGftFiles(correctnessDir);
  const errorFiles = collectGftFiles(errorDir);

  if (correctnessFiles.length === 0 && errorFiles.length === 0) {
    console.log('No .gft benchmark files found.');
    process.exit(1);
  }

  console.log(`Graft Benchmark Runner  v${getVersion()}`);
  console.log(`Correctness cases: ${correctnessFiles.length}`);
  console.log(`Error cases:       ${errorFiles.length}`);

  const results: CaseResult[] = [];

  for (const f of correctnessFiles) {
    results.push(runCorrectness(f));
  }
  for (const f of errorFiles) {
    results.push(runErrorCase(f));
  }

  // Print summary table
  printTable(results);

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const total = results.length;

  console.log(`\n${passed}/${total} passed, ${failed} failed\n`);

  // Write JSON report
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const report: BenchmarkReport = {
    timestamp: now.toISOString(),
    compiler_version: getVersion(),
    total,
    passed,
    failed,
    results,
  };

  const outPath = path.join(resultsDir, `${dateStr}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`Results written to ${path.relative(path.resolve(benchDir, '..'), outPath)}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
