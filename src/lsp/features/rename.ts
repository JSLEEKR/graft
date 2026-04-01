import type { Range } from 'vscode-languageserver/node';
import type { ProgramIndex } from '../../program-index.js';

export function isRenameable(word: string, index: ProgramIndex): boolean {
  return (
    index.contextMap.has(word) ||
    index.nodeMap.has(word) ||
    index.memoryMap.has(word) ||
    index.graphMap.has(word)
  );
}

export function collectRenameLocations(docText: string, name: string): Range[] {
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
    ranges.push({
      start: { line, character },
      end: { line, character: character + name.length },
    });
  }

  return ranges;
}
