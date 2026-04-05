import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile } from './compiler.js';
import { Executor, RunResult, RunOptions, SpawnerFn } from './runtime/executor.js';
import { Program } from './parser/ast.js';

export type { RunResult, RunOptions, SpawnerFn } from './runtime/executor.js';

let _lastProgram: Program | undefined;

/** Get the Program from the last run() call (for validation/feedback). */
export function getProgram(): Program | undefined {
  return _lastProgram;
}

export interface RunInput {
  sourceFile: string;
  inputFile?: string;
  input?: Record<string, unknown>;
  workDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
  timeoutMs?: number;
  spawner?: SpawnerFn;
}

export async function run(opts: RunInput): Promise<RunResult> {
  const sourceFile = path.resolve(opts.sourceFile);
  if (!fs.existsSync(sourceFile)) {
    return { success: false, graph: '', nodeResults: [], finalOutput: null, totalDurationMs: 0, errors: [`Source file not found: ${sourceFile}`] };
  }
  const source = fs.readFileSync(sourceFile, 'utf-8');
  const workDir = opts.workDir ?? path.dirname(sourceFile);

  const compileResult = compile(source, sourceFile);
  if (!compileResult.success || !compileResult.program) {
    _lastProgram = undefined;
    return { success: false, graph: '', nodeResults: [], finalOutput: null, totalDurationMs: 0, errors: compileResult.errors.map(e => e.message) };
  }

  _lastProgram = compileResult.program;
  const programIndex = compileResult.index;

  let input: Record<string, unknown>;
  if (opts.input) {
    input = opts.input;
  } else if (opts.inputFile) {
    const inputPath = path.resolve(opts.inputFile);
    if (!fs.existsSync(inputPath)) {
      return { success: false, graph: compileResult.program.graphs[0]?.name ?? '', nodeResults: [], finalOutput: null, totalDurationMs: 0, errors: [`Input file not found: ${inputPath}`] };
    }
    try { input = JSON.parse(fs.readFileSync(inputPath, 'utf-8')); }
    catch (e) { return { success: false, graph: compileResult.program.graphs[0]?.name ?? '', nodeResults: [], finalOutput: null, totalDurationMs: 0, errors: [`Failed to parse input JSON: ${e instanceof Error ? e.message : String(e)}`] }; }
  } else {
    input = {};
  }

  const executor = new Executor(compileResult.program, {
    sourceFile: path.basename(sourceFile), input, workDir,
    dryRun: opts.dryRun, verbose: opts.verbose, timeoutMs: opts.timeoutMs, spawner: opts.spawner,
  }, programIndex);
  return executor.execute();
}
