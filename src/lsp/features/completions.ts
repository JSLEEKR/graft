import type { CompletionItem } from 'vscode-languageserver/node';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import type { Program } from '../../parser/ast.js';
import type { ProgramIndex } from '../../program-index.js';
import { MODEL_MAP } from '../../constants.js';
import { formatType } from './hover.js';
import { getWordAtPosition, isInComment, isInString } from './utils.js';

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

  // After `storage:` -> storage types
  if (/storage\s*:\s*\w*$/.test(before)) {
    return [{ label: 'file', kind: CompletionItemKind.EnumMember, detail: 'File-based storage' }];
  }

  // After `model:` -> model aliases
  if (/model\s*:\s*\w*$/.test(before)) {
    return Object.entries(MODEL_MAP).map(([alias, full]) => ({
      label: alias,
      kind: CompletionItemKind.EnumMember,
      detail: full,
    }));
  }

  // After `on_failure:` -> strategy keywords
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

  // Inside `fallback(` -> node names
  if (/fallback\s*\(\s*\w*$/.test(before)) {
    if (!cache) return [];
    return [...cache.index.nodeMap.keys()].map(name => ({
      label: name,
      kind: CompletionItemKind.Class,
      detail: 'node',
    }));
  }

  // Inside `import { }` -> names from resolver
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

  // After `Name.` -> field completions (also handles multi-field brace `Name.{f1, `)
  const dotMatch = before.match(/([A-Za-z_]\w*)\.\s*(?:\{[^}]*)?\s*\w*$/);
  if (dotMatch) {
    return getFieldCompletions(dotMatch[1], cache?.index ?? null);
  }

  // Inside `reads: [` -> context + memory + produces names
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

  // Inside `writes: [` -> memory names only
  if (isInsideBracketAfter(lines, line, character, 'writes')) {
    if (!cache) return [];
    return [...cache.index.memoryMap.keys()].map(name => ({
      label: name,
      kind: CompletionItemKind.Variable,
      detail: 'memory',
    }));
  }

  // Inside graph flow -> node names + done
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

  // Top-level -> keyword completions + snippets
  if (/^\s*\w*$/.test(before)) {
    return topLevelCompletions();
  }

  return [];
}

function getFieldCompletions(name: string, index: ProgramIndex | null): CompletionItem[] {
  if (!index) return [];
  const ctx = index.contextMap.get(name);
  if (ctx) {
    return ctx.fields.map(f => ({
      label: f.name,
      kind: CompletionItemKind.Field,
      detail: formatType(f.type),
    }));
  }
  const pf = index.producesFieldsMap.get(name);
  if (pf) {
    return [...pf.entries()].map(([fieldName, type]) => ({
      label: fieldName,
      kind: CompletionItemKind.Field,
      detail: formatType(type),
    }));
  }
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
