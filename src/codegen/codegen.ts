import * as fs from 'node:fs';
import * as path from 'node:path';
import { Program } from '../parser/ast.js';
import { TokenReport } from '../analyzer/estimator.js';
import { generateAgent } from './agents.js';
import { generateHook } from './hooks.js';
import { generateOrchestration } from './orchestration.js';
import { generateSettings } from './settings.js';

export interface GeneratedFile {
  path: string;
  content: string;
}

export function generate(program: Program, report: TokenReport, sourceFile: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Build memory name set for agent generation
  const memoryNames = new Set(program.memories.map(m => m.name));

  // Agents — pass memoryNames
  for (const node of program.nodes) {
    files.push({
      path: `.claude/agents/${node.name.toLowerCase()}.md`,
      content: generateAgent(node, memoryNames),
    });
  }

  // Hooks
  for (const edge of program.edges) {
    const hook = generateHook(edge);
    if (hook && edge.target.kind === 'direct') {
      const source = edge.source.toLowerCase();
      const target = edge.target.node.toLowerCase();
      files.push({
        path: `.claude/hooks/${source}-to-${target}.sh`,
        content: hook,
      });
    }
  }

  // Orchestration
  files.push({
    path: '.claude/CLAUDE.md',
    content: generateOrchestration(program, report),
  });

  // Settings
  const settings = generateSettings(program, sourceFile);
  files.push({
    path: '.claude/settings.json',
    content: JSON.stringify(settings, null, 2),
  });

  // Runtime scaffold
  files.push({ path: '.graft/session/node_outputs/.gitkeep', content: '' });
  files.push({ path: '.graft/token_log.txt', content: '' });

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
