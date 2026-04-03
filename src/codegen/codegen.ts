import * as fs from 'node:fs';
import * as path from 'node:path';
import { Program } from '../parser/ast.js';
import { TokenReport } from '../analyzer/estimator.js';
import { ProgramIndex } from '../program-index.js';
import { CodegenBackend, CodegenContext } from './backend.js';
import { ClaudeCodeBackend } from './claude-backend.js';

export interface GeneratedFile {
  path: string;
  content: string;
}

const defaultBackend = new ClaudeCodeBackend();

export function generate(program: Program, report: TokenReport, sourceFile: string, index?: ProgramIndex, backend?: CodegenBackend): GeneratedFile[] {
  const idx = index ?? new ProgramIndex(program);
  const be = backend ?? defaultBackend;
  const ctx: CodegenContext = { program, report, index: idx, sourceFile };

  const files: GeneratedFile[] = [];
  const memoryNames = new Set(program.memories.map(m => m.name));

  // Agents
  for (const node of program.nodes) {
    files.push({
      path: `.claude/agents/${node.name.toLowerCase()}.md`,
      content: be.generateAgent(node, memoryNames, ctx),
    });
  }

  // Hooks
  for (const edge of program.edges) {
    if (edge.target.kind === 'conditional') {
      // Conditional edge → router hook
      const hook = be.generateConditionalHook?.(edge, ctx);
      if (hook) {
        files.push({
          path: `.claude/hooks/${edge.source.toLowerCase()}-router.js`,
          content: hook,
        });
      }
    } else {
      // Direct edge → transform hook
      const hook = be.generateHook(edge, ctx);
      if (hook && edge.target.kind === 'direct') {
        const source = edge.source.toLowerCase();
        const target = edge.target.node.toLowerCase();
        files.push({
          path: `.claude/hooks/${source}-to-${target}.js`,
          content: hook,
        });
      }
    }
  }

  // Orchestration
  files.push({
    path: '.claude/CLAUDE.md',
    content: be.generateOrchestration(ctx),
  });

  // Settings
  const settings = be.generateSettings(ctx);
  files.push({
    path: '.claude/settings.json',
    content: JSON.stringify(settings, null, 2),
  });

  // Runtime scaffold
  files.push({ path: '.graft/session/node_outputs/.gitkeep', content: '' });
  files.push({ path: '.graft/token_log.txt', content: '' });

  // Routing scaffold (only when conditional edges exist)
  const hasConditionalEdges = program.edges.some(e => e.target.kind === 'conditional');
  if (hasConditionalEdges) {
    files.push({ path: '.graft/session/routing/.gitkeep', content: '' });
  }

  // Memory scaffold — conditional
  if (program.memories.length > 0) {
    files.push({ path: '.graft/memory/.gitkeep', content: '' });
  }

  return files;
}

export function writeFiles(files: GeneratedFile[], outDir: string): void {
  for (const file of files) {
    const fullPath = path.join(outDir, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf-8');
  }
}
