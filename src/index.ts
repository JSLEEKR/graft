#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile, compileAndWrite, compileToProgram } from './compiler.js';
import { VERSION } from './version.js';
import { formatTokenReport } from './format.js';
import { formatProgram } from './formatter.js';
import { CodegenBackend } from './codegen/backend.js';
import { ClaudeCodeBackend } from './codegen/claude-backend.js';
import { GenericBackend } from './codegen/generic-backend.js';

const KNOWN_BACKENDS = new Set(['claude', 'generic']);

function resolveBackend(name: string): CodegenBackend {
  switch (name) {
    case 'claude': return new ClaudeCodeBackend();
    case 'generic': return new GenericBackend();
    default: throw new Error(`Unknown backend: ${name}`);
  }
}

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
    const backend = resolveBackend(opts.backend);

    let result;
    try {
      result = compileAndWrite(source, path.resolve(file), path.resolve(opts.outDir), backend);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }

    if (!result.success) {
      console.error('\n✗ Compilation failed:\n');
      for (const err of result.errors) {
        console.error(err.format(source, file));
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
    const result = compile(source, path.resolve(file));

    if (!result.success) {
      console.error('\n✗ Check failed:\n');
      for (const err of result.errors) {
        console.error(err.format(source, file));
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

program
  .command('init')
  .description('Scaffold a new Graft project')
  .argument('<name>', 'project name')
  .action((name: string) => {
    const dir = path.resolve(name);
    if (fs.existsSync(dir)) {
      console.error(`Error: directory '${name}' already exists`);
      process.exit(1);
    }

    fs.mkdirSync(dir, { recursive: true });

    const baseName = path.basename(name);
    const safeName = baseName.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'pipeline';

    fs.writeFileSync(path.join(dir, 'pipeline.gft'), `// ${safeName} — a simple two-node pipeline

context Input(max_tokens: 500) {
  question: String
}

node Analyst(model: sonnet, budget: 4k/2k) {
  reads: [Input]
  produces Analysis {
    answer: String
    confidence: Float(0..1)
  }
}

node Reviewer(model: haiku, budget: 2k/1k) {
  reads: [Analysis]
  produces Output {
    final_answer: String
    approved: Bool
  }
}

edge Analyst -> Reviewer | select(answer, confidence) | compact

graph ${safeName}(input: Input, output: Output, budget: 10k) {
  Analyst -> Reviewer -> done
}
`);

    console.log(`\nCreated ${name}/`);
    console.log(`  pipeline.gft`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${name}`);
    console.log(`  graft compile pipeline.gft`);
    console.log(`  # Open in Claude Code to run the pipeline`);
    console.log('');
  });

program
  .command('watch')
  .description('Watch .gft file and recompile on changes')
  .argument('<file>', '.gft source file')
  .option('--out-dir <dir>', 'output directory', '.')
  .action((file: string, opts: { outDir: string }) => {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) {
      console.error(`Error: file not found: ${resolved}`);
      process.exit(1);
    }

    function doCompile() {
      const source = fs.readFileSync(resolved, 'utf-8');
      try {
        const result = compileAndWrite(source, resolved, path.resolve(opts.outDir));
        if (!result.success) {
          console.error('\n✗ Compilation failed:\n');
          for (const err of result.errors) {
            console.error(err.format(source, file));
            console.error('');
          }
        } else {
          const timestamp = new Date().toLocaleTimeString();
          const fileCount = result.files?.length || 0;
          console.log(`[${timestamp}] ✓ Compiled ${file} → ${fileCount} files`);
          for (const w of result.warnings) {
            console.log(`  ⚠ ${w.message}`);
          }
        }
      } catch (e) {
        console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Initial compile
    doCompile();
    console.log(`\nWatching ${file} for changes... (Ctrl+C to stop)\n`);

    // Watch for changes
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    fs.watch(resolved, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(doCompile, 100);
    });

    // Also watch imported files in the same directory
    const dir = path.dirname(resolved);
    try {
      fs.watch(dir, { recursive: false }, (_, filename) => {
        if (filename && filename.endsWith('.gft') && filename !== path.basename(resolved)) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(doCompile, 100);
        }
      });
    } catch {
      // Ignore if directory watch fails
    }
  });

program
  .command('visualize')
  .description('Output pipeline DAG as a Mermaid diagram')
  .argument('<file>', '.gft source file')
  .option('--format <fmt>', 'output format: mermaid', 'mermaid')
  .action((file: string) => {
    const source = readSource(file);
    const result = compileToProgram(source, path.resolve(file));

    if (!result.success || !result.program) {
      console.error('\n✗ Compilation failed:\n');
      for (const err of result.errors) {
        console.error(err.format(source, file));
        console.error('');
      }
      process.exit(1);
    }

    const { program: prog } = result;
    const lines: string[] = ['graph TD'];

    // Nodes
    for (const node of prog.nodes) {
      const model = node.model;
      lines.push(`    ${node.name}["${node.name}<br/><small>${model}</small>"]`);
    }

    // Direct edges
    for (const edge of prog.edges) {
      if (edge.target.kind === 'direct') {
        const label = edge.transforms.length > 0
          ? edge.transforms.map(t => t.type).join(' → ')
          : '';
        if (label) {
          lines.push(`    ${edge.source} -->|${label}| ${edge.target.node}`);
        } else {
          lines.push(`    ${edge.source} --> ${edge.target.node}`);
        }
      } else if (edge.target.kind === 'conditional') {
        for (const branch of edge.target.branches) {
          const target = branch.target === 'done' ? 'done((done))' : branch.target;
          const label = branch.condition
            ? formatExprForMermaid(branch.condition)
            : 'else';
          lines.push(`    ${edge.source} -->|${label}| ${target}`);
        }
      }
    }

    // Graph flow (parallel blocks)
    if (prog.graphs[0]) {
      for (const step of prog.graphs[0].flow) {
        if (step.kind === 'parallel') {
          lines.push(`    subgraph parallel["parallel"]`);
          for (const b of step.branches) {
            lines.push(`        ${b}`);
          }
          lines.push(`    end`);
        }
      }
    }

    console.log(lines.join('\n'));
  });

program
  .command('fmt')
  .description('Format .gft source file')
  .argument('<file>', '.gft source file')
  .option('--check', 'check if file is already formatted (exit 1 if not)')
  .option('-w, --write', 'write formatted output back to the file')
  .action((file: string, opts: { check?: boolean; write?: boolean }) => {
    const source = readSource(file);
    const result = compileToProgram(source, path.resolve(file));

    if (!result.success || !result.program) {
      console.error('\n✗ Parse failed:\n');
      for (const err of result.errors) {
        console.error(err.format(source, file));
        console.error('');
      }
      process.exit(1);
    }

    const formatted = formatProgram(result.program);

    if (opts.check) {
      if (source === formatted) {
        console.log(`✓ ${file} is already formatted`);
      } else {
        console.log(`✗ ${file} needs formatting`);
        process.exit(1);
      }
      return;
    }

    if (opts.write) {
      fs.writeFileSync(path.resolve(file), formatted, 'utf-8');
      console.log(`✓ Formatted ${file}`);
      return;
    }

    // Default: print to stdout
    process.stdout.write(formatted);
  });

program
  .command('test')
  .description('Test a .gft pipeline with mock data (dry-run + validation)')
  .argument('<file>', '.gft source file')
  .option('--input <json>', 'input JSON string or file path')
  .option('--verbose', 'print detailed node outputs')
  .action(async (file: string, opts: { input?: string; verbose?: boolean }) => {
    const { runTest } = await import('./test-runner.js');
    const source = readSource(file);

    let input: Record<string, unknown> | undefined;
    if (opts.input) {
      // Try as JSON string first, then as file path
      try {
        input = JSON.parse(opts.input);
      } catch {
        const inputPath = path.resolve(opts.input);
        if (fs.existsSync(inputPath)) {
          try {
            input = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
          } catch (e) {
            console.error(`Error: failed to parse input file: ${e instanceof Error ? e.message : String(e)}`);
            process.exit(1);
          }
        } else {
          console.error(`Error: --input is not valid JSON and file not found: ${opts.input}`);
          process.exit(1);
        }
      }
    }

    const result = await runTest({
      source,
      sourceFile: path.resolve(file),
      input,
      verbose: opts.verbose,
    });

    if (result.compileErrors.length > 0) {
      console.error('\nCompilation failed:');
      for (const err of result.compileErrors) console.error(`  ${err}`);
      process.exit(1);
    }

    console.log(`\nTest input: ${JSON.stringify(result.inputUsed)}`);
    console.log('');

    let allPassed = true;
    for (const nr of result.nodeResults) {
      const status = nr.passed ? 'PASS' : 'FAIL';
      const icon = nr.passed ? '+' : 'x';
      console.log(`  [${icon}] ${nr.node.padEnd(20)} ${status}`);
      if (!nr.passed) {
        allPassed = false;
        for (const err of nr.validationErrors) {
          console.log(`      ${err}`);
        }
      }
      if (opts.verbose && nr.output) {
        console.log(`      output: ${JSON.stringify(nr.output)}`);
      }
    }

    console.log('');
    if (allPassed) {
      console.log(`All ${result.nodeResults.length} nodes passed validation.`);
    } else {
      const failed = result.nodeResults.filter(r => !r.passed).length;
      console.log(`${failed} of ${result.nodeResults.length} nodes failed validation.`);
      process.exit(1);
    }
    console.log('');
  });

program
  .command('generate')
  .description('Generate .gft from a natural language description (requires ANTHROPIC_API_KEY)')
  .argument('<description>', 'what the pipeline should do')
  .option('--output <file>', 'write .gft to file (default: stdout)')
  .option('--model <model>', 'Anthropic model to use', 'claude-sonnet-4-20250514')
  .action(async (description: string, opts: { output?: string; model?: string }) => {
    const { generateGft } = await import('./generator.js');

    try {
      const result = await generateGft(description, { model: opts.model, output: opts.output });

      if (result.errors.length > 0) {
        console.error('\nGeneration completed with validation errors:\n');
        for (const err of result.errors) {
          console.error(err.format(result.source, 'generated.gft'));
          console.error('');
        }
        console.error('--- Raw output (fix manually) ---\n');
        console.log(result.source);
        process.exit(1);
      }

      if (opts.output) {
        fs.writeFileSync(path.resolve(opts.output), result.source, 'utf-8');
        console.error(`✓ Generated ${opts.output}`);
      } else {
        process.stdout.write(result.source);
      }
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });

function formatExprForMermaid(expr: import('./parser/ast.js').Expr): string {
  if (expr.kind === 'binary') {
    const left = expr.left.kind === 'field_access' ? expr.left.segments[0] : '?';
    const right = expr.right.kind === 'literal' ? String(expr.right.value) : '?';
    return `${left} ${expr.op} ${right}`;
  }
  return '?';
}

function readSource(file: string): string {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: file not found: ${resolved}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, 'utf-8');
}

program.parse();
