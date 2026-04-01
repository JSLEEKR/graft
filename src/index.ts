#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile, compileAndWrite } from './compiler.js';
import { VERSION } from './version.js';
import { formatTokenReport } from './format.js';

const KNOWN_BACKENDS = new Set(['claude']);

const program = new Command();

program
  .name('graft')
  .description('Graft compiler — graph-native language for AI agent harness engineering')
  .version(VERSION);

program
  .command('compile')
  .description('Compile .gft source to Claude Code harness structure')
  .argument('<file>', '.gft source file')
  .option('--out-dir <dir>', 'output directory', '.')
  .option('--backend <name>', 'codegen backend', 'claude')
  .action((file: string, opts: { outDir: string; backend: string }) => {
    if (!KNOWN_BACKENDS.has(opts.backend)) {
      console.error(`Error: unknown backend '${opts.backend}'. Available: ${[...KNOWN_BACKENDS].join(', ')}`);
      process.exit(1);
    }
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
      console.log(formatTokenReport(result.report, { showBudget: true }));
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
      console.log(formatTokenReport(result.report));
    }

    for (const w of result.warnings) {
      console.log(`\n⚠ ${w.message}`);
    }
    console.log('');
  });

program
  .command('run')
  .description('Compile and execute a .gft pipeline')
  .argument('<file>', '.gft source file')
  .option('--input <file>', 'input JSON file')
  .option('--dry-run', 'simulate execution without spawning subprocesses')
  .option('--verbose', 'print execution details')
  .option('--timeout <seconds>', 'subprocess timeout in seconds', '300')
  .option('--work-dir <dir>', 'working directory for execution')
  .action(async (file: string, opts: { input?: string; dryRun?: boolean; verbose?: boolean; timeout: string; workDir?: string }) => {
    const { run } = await import('./runner.js');
    const result = await run({
      sourceFile: file,
      inputFile: opts.input,
      workDir: opts.workDir,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
      timeoutMs: parseInt(opts.timeout, 10) * 1000,
    });
    if (!result.success) {
      console.error('\nExecution failed:');
      for (const err of result.errors) console.error(`  ${err}`);
      process.exit(1);
    }
    console.log(`\nGraph '${result.graph}' completed in ${result.totalDurationMs}ms`);
    console.log(`Nodes executed: ${result.nodeResults.length}`);
    for (const nr of result.nodeResults) {
      const status = nr.success ? 'OK' : 'FAILED';
      console.log(`  ${nr.node.padEnd(20)} ${status.padEnd(8)} ${nr.durationMs}ms`);
    }
    if (result.finalOutput !== null) {
      console.log('\nFinal output:');
      console.log(JSON.stringify(result.finalOutput, null, 2));
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
