import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compile } from '../src/compiler.js';
import { GraftError } from '../src/errors/diagnostics.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

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

    expect(filePaths).toContain('.claude/orchestration.md');
    expect(filePaths).toContain('.claude/agents/researcher.md');
    expect(filePaths).toContain('.claude/agents/writer.md');
    expect(filePaths).toContain('.claude/hooks/researcher-to-writer.js');
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

  it('generates hook script with Node.js transforms', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const hook = result.files!.find(f => f.path === '.claude/hooks/researcher-to-writer.js');
    expect(hook).toBeDefined();
    expect(hook!.content).toContain('#!/usr/bin/env node');
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

  it('compiles parallel_flow.gft end-to-end', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../benchmarks/correctness/parallel_flow.gft'), 'utf-8');
    const result = compile(source, 'parallel_flow.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.report).toBeDefined();
    expect(result.report!.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it('compiles foreach_flow.gft end-to-end', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../benchmarks/correctness/foreach_flow.gft'), 'utf-8');
    const result = compile(source, 'foreach_flow.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.report).toBeDefined();
    // Foreach best case should be much less than worst case
    expect(result.report!.worstCase).toBeGreaterThan(result.report!.bestCase);
  });
});

const MEMORY_SOURCE = `
context Msg(max_tokens: 500) { content: String }

memory Log(max_tokens: 1k, storage: file) {
  entries: List<String>
}

node Bot(model: sonnet, budget: 2k/1k) {
  reads: [Msg, Log]
  writes: [Log]
  produces Reply {
    answer: String
    entries: List<String>
  }
}

graph ChatBot(input: Msg, output: Reply, budget: 4k) {
  Bot -> done
}
`;

const SHARED_SOURCE = `
context UserMessage(max_tokens: 500) {
  content: String
  user_id: String
}

context SystemConfig(max_tokens: 200) {
  persona: String
  temperature: Float(0..1)
}
`;

const MAIN_WITH_IMPORT_SOURCE = `
import { UserMessage } from "./shared.gft"

node Greeter(model: haiku, budget: 1k/500) {
  reads: [UserMessage]
  produces Greeting { message: String }
}

graph Hello(input: UserMessage, output: Greeting, budget: 2k) {
  Greeter -> done
}
`;

const CHATBOT_SOURCE = `
import { UserMessage, SystemConfig } from "./shared.gft"

memory ConversationLog(max_tokens: 2k, storage: file) {
  turns: List<Turn {
    role: String
    content: String
  }>
  summary: Optional<String>
}

node Responder(model: sonnet, budget: 4k/2k) {
  reads: [UserMessage, SystemConfig, ConversationLog]
  writes: [ConversationLog]

  produces Response {
    reply: String
    updated_turns: List<Turn {
      role: String
      content: String
    }>
    summary: Optional<String>
  }
}

graph Chat(input: UserMessage, output: Response, budget: 8k) {
  Responder -> done
}
`;

describe('v2.0 features', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-v2-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('compiles source with memory and writes', () => {
    const result = compile(MEMORY_SOURCE, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.program).toBeDefined();
    expect(result.program!.memories).toHaveLength(1);
    expect(result.program!.memories[0].name).toBe('Log');
    // Memory scaffold should be in generated files
    const filePaths = result.files!.map(f => f.path);
    expect(filePaths).toContain('.graft/memory/.gitkeep');
  });

  it('generates agent with .graft/memory/ path for memory reads/writes', () => {
    const result = compile(MEMORY_SOURCE, 'test.gft');
    expect(result.success).toBe(true);
    const agentFile = result.files!.find(f => f.path === '.claude/agents/bot.md');
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).toContain('.graft/memory/log.json');
    expect(agentFile!.content).toContain('Memory Saving');
  });

  it('generates orchestration with Persistent Memory section', () => {
    const result = compile(MEMORY_SOURCE, 'test.gft');
    expect(result.success).toBe(true);
    const claudeMd = result.files!.find(f => f.path === '.claude/orchestration.md');
    expect(claudeMd).toBeDefined();
    expect(claudeMd!.content).toContain('Persistent Memory');
    expect(claudeMd!.content).toContain('.graft/memory/log.json');
  });

  it('compiles with imports using temp files', () => {
    writeFile('shared.gft', SHARED_SOURCE);
    const mainPath = writeFile('main.gft', MAIN_WITH_IMPORT_SOURCE);
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    const result = compile(mainContent, mainPath);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    // Imported context should be present in program
    const contextNames = result.program!.contexts.map(c => c.name);
    expect(contextNames).toContain('UserMessage');
  });

  it('compiles with imports and memory combined', () => {
    writeFile('shared.gft', SHARED_SOURCE);
    const chatbotPath = writeFile('chatbot.gft', CHATBOT_SOURCE);
    const chatbotContent = fs.readFileSync(chatbotPath, 'utf-8');

    const result = compile(chatbotContent, chatbotPath);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    // Both imports and memory should work
    const contextNames = result.program!.contexts.map(c => c.name);
    expect(contextNames).toContain('UserMessage');
    expect(contextNames).toContain('SystemConfig');
    expect(result.program!.memories).toHaveLength(1);
    expect(result.program!.memories[0].name).toBe('ConversationLog');
    // Memory scaffold in output
    const filePaths = result.files!.map(f => f.path);
    expect(filePaths).toContain('.graft/memory/.gitkeep');
  });

  it('detects circular import error', () => {
    writeFile('a.gft', `
import { B } from "./b.gft"
context A(max_tokens: 100) { data: String }
node N(model: haiku, budget: 1k/500) {
  reads: [A]
  produces Out { data: String }
}
graph G(input: A, output: Out, budget: 2k) { N -> done }
`);
    writeFile('b.gft', `
import { A } from "./a.gft"
context B(max_tokens: 100) { data: String }
`);
    const aPath = path.join(tmpDir, 'a.gft');
    const aContent = fs.readFileSync(aPath, 'utf-8');

    const result = compile(aContent, aPath);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.message.includes('Circular import'))).toBe(true);
  });

  it('detects missing import file error', () => {
    const mainPath = writeFile('main.gft', `
import { Foo } from "./nonexistent.gft"
node N(model: haiku, budget: 1k/500) {
  reads: [Foo]
  produces Out { data: String }
}
graph G(input: Foo, output: Out, budget: 2k) { N -> done }
`);
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    const result = compile(mainContent, mainPath);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.message.includes('not found'))).toBe(true);
  });

  it('compiles examples/content-pipeline.gft with memory', () => {
    const p = path.resolve(__dirname, '../examples/content-pipeline.gft');
    const result = compile(fs.readFileSync(p, 'utf-8'), p);
    expect(result.success).toBe(true);
    expect(result.program!.nodes).toHaveLength(4);
    expect(result.program!.memories).toHaveLength(1);
    // Memory scaffold
    expect(result.files!.map(f => f.path)).toContain('.graft/memory/.gitkeep');
    // MetadataExtractor has memory write
    const meta = result.files!.find(f => f.path === '.claude/agents/metadataextractor.md');
    expect(meta!.content).toContain('Memory Saving');
  });

  it('compiles examples/data-analysis.gft with seq→parallel→seq', () => {
    const p = path.resolve(__dirname, '../examples/data-analysis.gft');
    const result = compile(fs.readFileSync(p, 'utf-8'), p);
    expect(result.success).toBe(true);
    expect(result.program!.nodes).toHaveLength(4);
    // Parallel step in orchestration
    const claudeMd = result.files!.find(f => f.path === '.claude/orchestration.md');
    expect(claudeMd!.content).toContain('[parallel]');
    expect(claudeMd!.content).toContain('Dispatch all 2 agents');
    // ReportWriter has transformed inputs from parallel branches
    expect(claudeMd!.content).toContain('statanalyzer_to_reportwriter.json');
    expect(claudeMd!.content).toContain('trendanalyzer_to_reportwriter.json');
    // StatAnalyzer has transformed input from Classifier
    const stat = result.files!.find(f => f.path === '.claude/agents/statanalyzer.md');
    expect(stat!.content).toContain('classifier_to_statanalyzer.json');
  });

  it('compiles examples/pr-summarizer.gft', () => {
    const p = path.resolve(__dirname, '../examples/pr-summarizer.gft');
    const result = compile(fs.readFileSync(p, 'utf-8'), p);
    expect(result.success).toBe(true);
    expect(result.program!.nodes).toHaveLength(2);
    expect(result.report!.bestCase).toBeLessThanOrEqual(result.report!.budget);
  });

  it('compiles examples/adversarial-debate.gft (complex 8-node)', () => {
    const p = path.resolve(__dirname, '../examples/adversarial-debate.gft');
    const result = compile(fs.readFileSync(p, 'utf-8'), p);
    expect(result.success).toBe(true);
    expect(result.program!.nodes).toHaveLength(8);
    expect(result.program!.memories).toHaveLength(1);
    // 4-agent parallel dispatch
    const claudeMd = result.files!.find(f => f.path === '.claude/orchestration.md');
    expect(claudeMd!.content).toContain('Dispatch all 4 agents');
    // Edge transforms from parallel to Critic
    expect(claudeMd!.content).toContain('architect_to_critic.json');
    // Implementer has retry(2)
    const impl = result.files!.find(f => f.path === '.claude/agents/implementer.md');
    expect(impl!.content).toContain('Retry up to 2 times');
    expect(impl!.content).toContain('tools: [Read, Write, Edit, Bash]');
  });

  it('compiles examples/debate-lite.gft', () => {
    const p = path.resolve(__dirname, '../examples/debate-lite.gft');
    const result = compile(fs.readFileSync(p, 'utf-8'), p);
    expect(result.success).toBe(true);
    expect(result.program!.nodes).toHaveLength(3);
    expect(result.report!.bestCase).toBeLessThanOrEqual(result.report!.budget);
  });

  it('compiles examples/code-review.gft with parallel pipeline', () => {
    const codereviewPath = path.resolve(__dirname, '../examples/code-review.gft');
    const source = fs.readFileSync(codereviewPath, 'utf-8');
    const result = compile(source, codereviewPath);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.report).toBeDefined();
    expect(result.program!.nodes).toHaveLength(4);
    expect(result.program!.edges).toHaveLength(3);

    // File set: 4 agents + 3 hooks + CLAUDE.md + settings.json + 2 scaffold = 10
    expect(result.files).toBeDefined();
    const filePaths = result.files!.map(f => f.path);
    expect(filePaths).toContain('.claude/agents/securityreviewer.md');
    expect(filePaths).toContain('.claude/agents/logicreviewer.md');
    expect(filePaths).toContain('.claude/agents/performancereviewer.md');
    expect(filePaths).toContain('.claude/agents/seniorreviewer.md');
    expect(filePaths).toContain('.claude/hooks/securityreviewer-to-seniorreviewer.js');
    expect(filePaths).toContain('.claude/hooks/logicreviewer-to-seniorreviewer.js');
    expect(filePaths).toContain('.claude/hooks/performancereviewer-to-seniorreviewer.js');

    // CLAUDE.md should have parallel dispatch + edge transforms
    const claudeMd = result.files!.find(f => f.path === '.claude/orchestration.md');
    expect(claudeMd!.content).toContain('Dispatch all 3 agents concurrently');
    expect(claudeMd!.content).toContain('Agent tool');
    expect(claudeMd!.content).toContain('securityreviewer_to_seniorreviewer.json');
    expect(claudeMd!.content).toContain('Edge transform');

    // SeniorReviewer agent should have exact transformed input paths
    const senior = result.files!.find(f => f.path === '.claude/agents/seniorreviewer.md');
    expect(senior!.content).toContain('securityreviewer_to_seniorreviewer.json');
    expect(senior!.content).toContain('logicreviewer_to_seniorreviewer.json');
    expect(senior!.content).toContain('performancereviewer_to_seniorreviewer.json');
    expect(senior!.content).toContain('model: claude-opus-4-20250514');

    // Hooks should use graceful no-op
    const hook = result.files!.find(f => f.path === '.claude/hooks/securityreviewer-to-seniorreviewer.js');
    expect(hook!.content).toContain('process.exit(0)');
    expect(hook!.content).not.toContain('process.exit(1)');
  });

  it('compiles examples/chatbot.gft from disk', () => {
    const chatbotPath = path.resolve(__dirname, '../examples/chatbot.gft');
    const source = fs.readFileSync(chatbotPath, 'utf-8');
    const result = compile(source, chatbotPath);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.report).toBeDefined();
    expect(result.program!.memories).toHaveLength(1);
    expect(result.program!.contexts.length).toBeGreaterThanOrEqual(2);
    // Should have memory scaffold
    const filePaths = result.files!.map(f => f.path);
    expect(filePaths).toContain('.graft/memory/.gitkeep');
  });

  it('resolves imports when sourceFile is a subdirectory path (regression)', () => {
    // Bug: CLI used path.basename(file) which stripped directory info,
    // causing import resolution to fail when CWD != source file directory.
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'lib.gft'), `
context Ctx(max_tokens: 100) { data: String }
`);
    fs.writeFileSync(path.join(subDir, 'main.gft'), `
import { Ctx } from "./lib.gft"
node Worker(model: haiku, budget: 1k/500) {
  reads: [Ctx]
  produces Out { result: String }
}
graph G(input: Ctx, output: Out, budget: 2k) { Worker -> done }
`);

    const mainPath = path.join(subDir, 'main.gft');
    const source = fs.readFileSync(mainPath, 'utf-8');

    // With full path: should succeed
    const resultFull = compile(source, mainPath);
    expect(resultFull.success).toBe(true);
    expect(resultFull.program!.contexts.map(c => c.name)).toContain('Ctx');

    // With basename only: would fail if CWD doesn't contain lib.gft
    // (This is the pattern the old CLI used — now fixed)
    const resultBasename = compile(source, 'main.gft');
    expect(resultBasename.success).toBe(false);
    expect(resultBasename.errors.some(e => e.message.includes('not found'))).toBe(true);
  });
});
