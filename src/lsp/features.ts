import type { Diagnostic, Hover, Location, CompletionItem } from 'vscode-languageserver/node';
import { DiagnosticSeverity, MarkupKind, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import type { GraftError, SourceLocation } from '../errors/diagnostics.js';
import type { Program, TypeExpr } from '../parser/ast.js';
import type { ProgramIndex } from '../program-index.js';
import { MODEL_MAP } from '../constants.js';

// --- Diagnostics ---

export function toDiagnostics(errors: GraftError[], warnings: GraftError[]): Diagnostic[] {
  const result: Diagnostic[] = [];
  for (const e of errors) {
    result.push(makeDiagnostic(e, DiagnosticSeverity.Error));
  }
  for (const w of warnings) {
    result.push(makeDiagnostic(w, DiagnosticSeverity.Warning));
  }
  return result;
}

function makeDiagnostic(e: GraftError, severity: DiagnosticSeverity): Diagnostic {
  const line = Math.max(0, e.location.line - 1);
  const character = Math.max(0, e.location.column - 1);
  const endCharacter = character + (e.location.length ?? 1);
  return {
    range: {
      start: { line, character },
      end: { line, character: endCharacter },
    },
    severity,
    message: e.message,
    source: 'graft',
    ...(e.code ? { code: e.code } : {}),
  };
}

// --- Word Extraction ---

export function getWordAtPosition(text: string, line: number, character: number): string | null {
  const lines = text.split('\n');
  if (line < 0 || line >= lines.length) return null;
  const lineText = lines[line];
  if (character < 0 || character > lineText.length) return null;

  const pattern = /[A-Za-z_][A-Za-z0-9_]*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (character >= start && character < end) {
      return match[0];
    }
  }
  return null;
}

// --- Hover ---

const KEYWORD_DOCS: Record<string, string> = {
  context: 'Declares a context schema with typed fields and a max_tokens budget.\n\n```graft\ncontext Name(max_tokens: 1k) {\n  field: Type\n}\n```',
  node: 'Declares a processing node with model, budget, reads, writes, and produces.\n\n```graft\nnode Name(model: sonnet, budget: 5k/2k) {\n  reads: [ContextName]\n  produces Output { field: Type }\n}\n```',
  memory: 'Declares persistent memory with typed fields and storage backend.\n\n```graft\nmemory Name(max_tokens: 2k, storage: file) {\n  field: Type\n}\n```',
  graph: 'Declares an execution graph connecting nodes in a flow.\n\n```graft\ngraph Name(input: In, output: Out, budget: 10k) {\n  Start -> Middle -> done\n}\n```',
  edge: 'Declares a data transform between nodes.\n\n```graft\nedge Source -> Target | select(field) | compact\n```',
  import: 'Imports contexts and nodes from another .gft file.\n\n```graft\nimport { Name } from "./lib.gft"\n```',
  reads: 'Specifies which contexts, produces, or memories a node reads from.\n\n```graft\nreads: [ContextName, Produces.field]\n```',
  writes: 'Specifies which memories a node writes to.\n\n```graft\nwrites: [MemoryName.field]\n```',
  produces: 'Declares the output schema of a node.\n\n```graft\nproduces OutputName {\n  field: Type\n}\n```',
  model: 'Specifies the LLM model alias for a node.\n\nAliases: sonnet, opus, haiku',
  max_tokens: 'Sets the maximum token budget for a context or memory.',
  on_failure: 'Specifies failure handling strategy for a node.\n\nStrategies: retry(N), fallback(Node), skip, abort',
  storage: 'Specifies the storage backend for a memory declaration.\n\nCurrently supported: file',
  foreach: 'Iterates over a list field from a node\'s output.\n\n```graft\nforeach(Node.output.field as item, max_iterations: 5) {\n  Step1 -> Step2\n}\n```',
  parallel: 'Executes multiple nodes concurrently.\n\n```graft\nparallel { Node1 Node2 Node3 }\n```',
};

export function getHoverInfo(word: string, index: ProgramIndex): Hover | null {
  const keywordDoc = KEYWORD_DOCS[word];
  if (keywordDoc) {
    return mkHover(keywordDoc);
  }

  const ctx = index.contextMap.get(word);
  if (ctx) {
    const fields = ctx.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(`**context** ${ctx.name} (max_tokens: ${ctx.maxTokens})\n\`\`\`\n${fields}\n\`\`\``);
  }

  const node = index.nodeMap.get(word);
  if (node) {
    const reads = node.reads.map(r => {
      if (!r.field) return r.context;
      return r.field.length === 1 ? `${r.context}.${r.field[0]}` : `${r.context}.{${r.field.join(', ')}}`;
    }).join(', ');
    const writes = node.writes.length > 0
      ? `\nwrites: ${node.writes.map(w => w.field ? `${w.memory}.${w.field}` : w.memory).join(', ')}`
      : '';
    const producesFields = node.produces.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(
      `**node** ${node.name}\n` +
      `- model: ${node.model}\n` +
      `- budget: ${node.budgetIn}/${node.budgetOut}\n` +
      `- reads: ${reads}${writes}\n` +
      `- produces: ${node.produces.name}\n\`\`\`\n${producesFields}\n\`\`\``
    );
  }

  const mem = index.memoryMap.get(word);
  if (mem) {
    const fields = mem.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(`**memory** ${mem.name} (max_tokens: ${mem.maxTokens}, storage: ${mem.storage})\n\`\`\`\n${fields}\n\`\`\``);
  }

  const producerNode = index.producesNodeMap.get(word);
  if (producerNode) {
    const fields = producerNode.produces.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(`**produces** ${word} (from node ${producerNode.name})\n\`\`\`\n${fields}\n\`\`\``);
  }

  return null;
}

// --- Go-to-Definition ---

export function getDefinitionLocation(word: string, index: ProgramIndex, currentUri: string): Location | null {
  // Try context
  const ctx = index.contextMap.get(word);
  if (ctx) return declLocation(ctx.location, ctx.sourceFile, word.length, currentUri);

  // Try node
  const node = index.nodeMap.get(word);
  if (node) return declLocation(node.location, node.sourceFile, word.length, currentUri);

  // Try produces
  const producerNode = index.producesNodeMap.get(word);
  if (producerNode) {
    return declLocation(producerNode.produces.location, producerNode.sourceFile, word.length, currentUri);
  }

  // Try memory (no sourceFile -- memories can't be imported, v2.0-R13)
  const mem = index.memoryMap.get(word);
  if (mem) return declLocation(mem.location, undefined, word.length, currentUri);

  return null;
}

function declLocation(loc: SourceLocation, sourceFile: string | undefined, nameLength: number, currentUri: string): Location {
  const uri = sourceFile ? pathToFileURL(sourceFile).toString() : currentUri;
  const line = Math.max(0, loc.line - 1);
  const character = Math.max(0, loc.column - 1);
  return {
    uri,
    range: {
      start: { line, character },
      end: { line, character: character + nameLength },
    },
  };
}

// --- Type Formatting ---

export function formatType(type: TypeExpr): string {
  switch (type.kind) {
    case 'primitive': return type.name;
    case 'primitive_range': return `Float(${type.min}..${type.max})`;
    case 'list': return `List<${formatType(type.element)}>`;
    case 'map': return `Map<${formatType(type.key)}, ${formatType(type.value)}>`;
    case 'optional': return `${formatType(type.inner)}?`;
    case 'token_bounded': return `${formatType(type.inner)}(max: ${type.max})`;
    case 'enum': return type.values.join(' | ');
    case 'struct': return `{ ${type.fields.map(f => `${f.name}: ${formatType(f.type)}`).join(', ')} }`;
    case 'domain': return type.name;
  }
}

// --- Helpers ---

function mkHover(value: string): Hover {
  return { contents: { kind: MarkupKind.Markdown, value } };
}

// --- Completions ---

export function getCompletions(
  text: string,
  line: number,
  character: number,
  cache: { program: Program; index: ProgramIndex } | null,
  resolveImportNames?: (importPath: string) => string[],
): CompletionItem[] {
  const lines = text.split('\n');
  if (line < 0 || line >= lines.length) return [];
  const lineText = lines[line].replace(/\r$/, '');
  const before = lineText.slice(0, character);

  // Suppress completions inside comments
  if (isInComment(lines, line, character)) return [];

  // Suppress completions inside string literals
  if (isInString(lineText, character)) return [];

  // After `storage:` → storage types
  if (/storage\s*:\s*\w*$/.test(before)) {
    return [{ label: 'file', kind: CompletionItemKind.EnumMember, detail: 'File-based storage' }];
  }

  // After `model:` → model aliases
  if (/model\s*:\s*\w*$/.test(before)) {
    return Object.entries(MODEL_MAP).map(([alias, full]) => ({
      label: alias,
      kind: CompletionItemKind.EnumMember,
      detail: full,
    }));
  }

  // After `on_failure:` → strategy keywords
  if (/on_failure\s*:\s*\w*$/.test(before)) {
    return [
      { label: 'retry', kind: CompletionItemKind.Keyword,
        insertText: 'retry(${1:3})', insertTextFormat: InsertTextFormat.Snippet },
      { label: 'fallback', kind: CompletionItemKind.Keyword,
        insertText: 'fallback(${1:NodeName})', insertTextFormat: InsertTextFormat.Snippet },
      { label: 'skip', kind: CompletionItemKind.Keyword },
      { label: 'abort', kind: CompletionItemKind.Keyword },
      { label: 'retry_then_fallback', kind: CompletionItemKind.Keyword,
        insertText: 'retry(${1:3}, fallback(${2:NodeName}))',
        insertTextFormat: InsertTextFormat.Snippet,
        detail: 'Retry N times, then fallback to node' },
    ];
  }

  // Inside `fallback(` → node names
  if (/fallback\s*\(\s*\w*$/.test(before)) {
    if (!cache) return [];
    return [...cache.index.nodeMap.keys()].map(name => ({
      label: name,
      kind: CompletionItemKind.Class,
      detail: 'node',
    }));
  }

  // Inside `import { }` → names from resolver
  if (isInsideImportBraces(lines, line, character)) {
    if (!resolveImportNames) return [];
    const importPath = extractImportPath(lines, line) ?? '';
    const names = resolveImportNames(importPath);
    return names.map(name => ({
      label: name,
      kind: CompletionItemKind.Class,
      detail: 'importable',
    }));
  }

  // After `Name.` → field completions (also handles multi-field brace `Name.{f1, `)
  const dotMatch = before.match(/([A-Za-z_]\w*)\.\s*(?:\{[^}]*)?\s*\w*$/);
  if (dotMatch) {
    return getFieldCompletions(dotMatch[1], cache?.index ?? null);
  }

  // Inside `reads: [` → context + memory + produces names
  if (isInsideBracketAfter(lines, line, character, 'reads')) {
    if (!cache) return [];
    const items: CompletionItem[] = [];
    for (const name of cache.index.contextMap.keys()) {
      items.push({ label: name, kind: CompletionItemKind.Class, detail: 'context' });
    }
    for (const name of cache.index.producesNodeMap.keys()) {
      items.push({ label: name, kind: CompletionItemKind.Struct, detail: 'produces' });
    }
    for (const name of cache.index.memoryMap.keys()) {
      items.push({ label: name, kind: CompletionItemKind.Variable, detail: 'memory' });
    }
    return items;
  }

  // Inside `writes: [` → memory names only
  if (isInsideBracketAfter(lines, line, character, 'writes')) {
    if (!cache) return [];
    return [...cache.index.memoryMap.keys()].map(name => ({
      label: name,
      kind: CompletionItemKind.Variable,
      detail: 'memory',
    }));
  }

  // Inside graph flow → node names + done
  if (isInsideBlock(lines, line, 'graph')) {
    const items: CompletionItem[] = [
      { label: 'done', kind: CompletionItemKind.Keyword, detail: 'Terminal node' },
    ];
    if (cache) {
      for (const name of cache.index.nodeMap.keys()) {
        items.push({ label: name, kind: CompletionItemKind.Class, detail: 'node' });
      }
    }
    return items;
  }

  // Top-level → keyword completions + snippets
  if (/^\s*\w*$/.test(before)) {
    return topLevelCompletions();
  }

  return [];
}

function getFieldCompletions(name: string, index: ProgramIndex | null): CompletionItem[] {
  if (!index) return [];
  // Context fields
  const ctx = index.contextMap.get(name);
  if (ctx) {
    return ctx.fields.map(f => ({
      label: f.name,
      kind: CompletionItemKind.Field,
      detail: formatType(f.type),
    }));
  }
  // Produces fields (keyed by both node name and produces name)
  const pf = index.producesFieldsMap.get(name);
  if (pf) {
    return [...pf.entries()].map(([fieldName, type]) => ({
      label: fieldName,
      kind: CompletionItemKind.Field,
      detail: formatType(type),
    }));
  }
  // Memory fields
  const mf = index.memoryFieldsMap.get(name);
  if (mf) {
    return [...mf.entries()].map(([fieldName, type]) => ({
      label: fieldName,
      kind: CompletionItemKind.Field,
      detail: formatType(type),
    }));
  }
  return [];
}

function isInComment(lines: string[], line: number, character: number): boolean {
  let inBlock = false;
  for (let i = 0; i <= line; i++) {
    const l = (lines[i] ?? '').replace(/\r$/, '');
    const endCol = i === line ? character : l.length;
    let j = 0;
    while (j < endCol) {
      if (!inBlock) {
        if (l[j] === '/' && j + 1 < l.length && l[j + 1] === '/') {
          if (i === line) return true;
          break; // rest of this line is comment, move to next
        }
        if (l[j] === '/' && j + 1 < l.length && l[j + 1] === '*') {
          inBlock = true;
          j += 2;
          continue;
        }
        if (l[j] === '"') {
          j++;
          while (j < endCol && l[j] !== '"') j++;
          if (j < endCol) j++;
          continue;
        }
      } else {
        if (l[j] === '*' && j + 1 < l.length && l[j + 1] === '/') {
          inBlock = false;
          j += 2;
          continue;
        }
      }
      j++;
    }
  }
  return inBlock;
}

function isInString(lineText: string, character: number): boolean {
  let inStr = false;
  for (let i = 0; i < character && i < lineText.length; i++) {
    if (lineText[i] === '"') inStr = !inStr;
  }
  return inStr;
}

function isInsideBracketAfter(lines: string[], currentLine: number, character: number, keyword: string): boolean {
  let depth = 0;
  for (let i = currentLine; i >= 0; i--) {
    const l = (lines[i] ?? '').replace(/\r$/, '');
    const end = i === currentLine ? character : l.length;
    for (let j = end - 1; j >= 0; j--) {
      if (l[j] === ']') depth++;
      if (l[j] === '[') {
        if (depth > 0) { depth--; }
        else {
          const prefix = l.slice(0, j).trimEnd();
          return prefix.endsWith(keyword + ':') || prefix.endsWith(keyword);
        }
      }
    }
  }
  return false;
}

function isInsideImportBraces(lines: string[], currentLine: number, character: number): boolean {
  let depth = 0;
  for (let i = currentLine; i >= 0; i--) {
    const l = (lines[i] ?? '').replace(/\r$/, '');
    const end = i === currentLine ? character : l.length;
    for (let j = end - 1; j >= 0; j--) {
      if (l[j] === '}') depth++;
      if (l[j] === '{') {
        if (depth > 0) { depth--; }
        else {
          const prefix = l.slice(0, j).trimEnd();
          return /\bimport\s*$/.test(prefix);
        }
      }
    }
  }
  return false;
}

function extractImportPath(lines: string[], startLine: number): string | null {
  for (let i = startLine; i < Math.min(startLine + 3, lines.length); i++) {
    const match = lines[i].match(/from\s+"([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

function isInsideBlock(lines: string[], currentLine: number, keyword: string): boolean {
  let depth = 0;
  for (let i = currentLine; i >= 0; i--) {
    const l = (lines[i] ?? '').replace(/\r$/, '');
    for (let j = l.length - 1; j >= 0; j--) {
      if (l[j] === '}') depth++;
      if (l[j] === '{') {
        if (depth > 0) { depth--; }
        else {
          return new RegExp(`^\\s*${keyword}\\s`).test(l);
        }
      }
    }
  }
  return false;
}

function topLevelCompletions(): CompletionItem[] {
  return [
    {
      label: 'context',
      kind: CompletionItemKind.Keyword,
      detail: 'Declare a context schema',
      insertText: 'context ${1:Name}(max_tokens: ${2:1k}) {\n  ${3:field}: ${4:String}\n}',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: 'node',
      kind: CompletionItemKind.Keyword,
      detail: 'Declare a processing node',
      insertText: 'node ${1:Name}(model: ${2:sonnet}, budget: ${3:5k}/${4:2k}) {\n  reads: [${5}]\n  produces ${6:Output} {\n    ${7:field}: ${8:String}\n  }\n}',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: 'memory',
      kind: CompletionItemKind.Keyword,
      detail: 'Declare persistent memory',
      insertText: 'memory ${1:Name}(max_tokens: ${2:2k}, storage: file) {\n  ${3:field}: ${4:String}\n}',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: 'graph',
      kind: CompletionItemKind.Keyword,
      detail: 'Declare execution graph',
      insertText: 'graph ${1:Name}(input: ${2:Input}, output: ${3:Output}, budget: ${4:10k}) {\n  ${5:Start} -> done\n}',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    { label: 'edge', kind: CompletionItemKind.Keyword, detail: 'Declare edge transform' },
    {
      label: 'import',
      kind: CompletionItemKind.Keyword,
      detail: 'Import from another file',
      insertText: 'import { ${1:Name} } from "${2:./lib.gft}"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
  ];
}

// --- Auto-Import Helpers ---

export function extractUndefinedName(message: string, docText: string, line: number, character: number): string | null {
  // Primary: extract from message (all SCOPE_UNDEFINED_REF messages quote name in single quotes)
  const msgMatch = message.match(/'([^']+)'/);
  if (msgMatch) return msgMatch[1];
  // Fallback: extract word at diagnostic range
  return getWordAtPosition(docText, line, character);
}

export function buildAutoImportEdit(
  name: string, fromPath: string, docText: string,
): { insertLine: number; newText: string } {
  const lines = docText.split('\n');
  let insertLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+\{/.test(lines[i])) {
      insertLine = i + 1;
    }
  }
  return { insertLine, newText: `import { ${name} } from "${fromPath}"\n` };
}

export function computeRelativeImportPath(fromFile: string, toFile: string): string {
  let rel = path.relative(path.dirname(fromFile), toFile);
  rel = rel.replace(/\\/g, '/');  // Windows path normalization
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}
