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
