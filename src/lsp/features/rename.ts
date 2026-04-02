import type { Range, TextEdit } from 'vscode-languageserver/node';
import { Lexer } from '../../lexer/lexer.js';
import { Parser } from '../../parser/parser.js';
import { ProgramIndex } from '../../program-index.js';
import { KEYWORDS } from '../../lexer/tokens.js';
import { isInComment, isInString } from './utils.js';

const TYPE_KEYWORDS = new Set([
  'String', 'Int', 'Float', 'Bool', 'List', 'Map', 'Optional',
  'TokenBounded', 'FilePath', 'FileDiff', 'TestFile', 'IssueRef',
]);

const CONTEXTUAL_KEYWORDS = new Set(['output']);

// Derived from lexer KEYWORDS, excluding type keywords and contextual keywords
export const GRAFT_KEYWORDS = new Set(
  Object.keys(KEYWORDS).filter(k => !TYPE_KEYWORDS.has(k) && !CONTEXTUAL_KEYWORDS.has(k))
);

/**
 * Pure function that builds rename edits for a Graft identifier.
 * Returns { changes } on success, { error } on validation/conflict failure, or null if not renameable.
 */
export function buildRenameEdits(
  oldName: string,
  newName: string,
  docText: string,
  docUri: string,
  currentFilePath: string,
  workspaceFiles: Map<string, { text: string; uri: string }>,
): { changes: Record<string, TextEdit[]> } | { error: string } | null {
  // Parse current file to check renameability
  let index: ProgramIndex;
  try {
    const tokens = new Lexer(docText).tokenize();
    const { program } = new Parser(tokens).parse();
    index = new ProgramIndex(program);
  } catch {
    return null;
  }

  // Check if the name is renameable (is a declared context/node/memory/graph)
  if (!isRenameable(oldName, index)) return null;

  // Validate newName is a legal Graft identifier
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) {
    return { error: `'${newName}' is not a valid identifier` };
  }

  // Reject Graft keywords
  if (GRAFT_KEYWORDS.has(newName)) {
    return { error: `'${newName}' is a reserved keyword` };
  }

  // Check for conflicts in current file
  if (oldName !== newName && (
    index.contextMap.has(newName) ||
    index.nodeMap.has(newName) ||
    index.memoryMap.has(newName) ||
    index.graphMap.has(newName)
  )) {
    return { error: `'${newName}' already exists in the current file` };
  }

  // Check for conflicts in importing files (parse-based)
  for (const [filePath, fileInfo] of workspaceFiles) {
    try {
      const wsTokens = new Lexer(fileInfo.text).tokenize();
      const { program: wsProgram } = new Parser(wsTokens).parse();
      const wsIndex = new ProgramIndex(wsProgram);
      if (wsIndex.contextMap.has(newName) || wsIndex.nodeMap.has(newName) ||
          wsIndex.memoryMap.has(newName) || wsIndex.graphMap.has(newName)) {
        return { error: `Name "${newName}" conflicts with declaration in ${filePath}` };
      }
    } catch {
      // Parse failure -- skip conflict check for this file
    }
  }

  const changes: Record<string, TextEdit[]> = {};

  // Collect locations in current file
  const currentLocs = collectRenameLocations(docText, oldName);
  if (currentLocs.length > 0) {
    changes[docUri] = currentLocs.map(range => ({ range, newText: newName }));
  }

  // Collect locations in importing files
  for (const [, fileInfo] of workspaceFiles) {
    const locs = collectRenameLocations(fileInfo.text, oldName);
    if (locs.length > 0) {
      changes[fileInfo.uri] = locs.map(range => ({ range, newText: newName }));
    }
  }

  return { changes };
}

export function isRenameable(word: string, index: ProgramIndex): boolean {
  return (
    index.contextMap.has(word) ||
    index.nodeMap.has(word) ||
    index.memoryMap.has(word) ||
    index.graphMap.has(word)
  );
}

export function collectRenameLocations(docText: string, name: string): Range[] {
  // Normalize CRLF to LF
  docText = docText.replace(/\r\n/g, '\n');

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'g');
  const ranges: Range[] = [];

  const lines = docText.split('\n');
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(docText)) !== null) {
    const matchOffset = match.index;
    let lo = 0;
    let hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineOffsets[mid] <= matchOffset) lo = mid;
      else hi = mid - 1;
    }
    const line = lo;
    const character = matchOffset - lineOffsets[line];

    // Skip matches inside comments
    if (isInComment(lines, line, character + 1)) continue;

    // Skip matches inside strings
    const lineText = lines[line];
    if (isInString(lineText, character)) continue;

    // Skip matches inside import path strings (from "...")
    const fromMatch = lineText.match(/from\s+"([^"]*)"/);
    if (fromMatch) {
      const pathStart = lineText.indexOf('"', lineText.indexOf('from'));
      const pathEnd = lineText.indexOf('"', pathStart + 1);
      if (character > pathStart && character < pathEnd) continue;
    }

    ranges.push({
      start: { line, character },
      end: { line, character: character + name.length },
    });
  }

  return ranges;
}
