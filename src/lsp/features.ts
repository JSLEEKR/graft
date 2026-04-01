import type { Diagnostic, Hover, Location } from 'vscode-languageserver/node';
import { DiagnosticSeverity, MarkupKind } from 'vscode-languageserver/node';
import { pathToFileURL } from 'node:url';
import type { GraftError, SourceLocation } from '../errors/diagnostics.js';
import type { TypeExpr } from '../parser/ast.js';
import type { ProgramIndex } from '../program-index.js';

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

export function getHoverInfo(word: string, index: ProgramIndex): Hover | null {
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
