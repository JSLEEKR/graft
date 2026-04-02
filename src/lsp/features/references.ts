import type { Location } from 'vscode-languageserver/node';
import type { ProgramIndex } from '../../program-index.js';
import { collectRenameLocations } from './rename.js';

export function isReferable(word: string, index: ProgramIndex): boolean {
  return (
    index.contextMap.has(word) ||
    index.nodeMap.has(word) ||
    index.memoryMap.has(word) ||
    index.graphMap.has(word) ||
    index.producesNodeMap.has(word)
  );
}

/** Keyword lengths for computing name position from declaration location. */
const KEYWORD_LENGTHS: Record<string, number> = {
  context: 7,
  node: 4,
  memory: 6,
  graph: 5,
};

/**
 * Find the declaration name's 0-based position from ProgramIndex.
 * Declaration locations point to the keyword token (e.g., "context" in "context Foo").
 * The name starts at keyword column + keyword length + 1 (for the space).
 */
function findDeclNamePosition(
  name: string,
  index: ProgramIndex,
): { line: number; character: number } | null {
  const ctx = index.contextMap.get(name);
  if (ctx) {
    return {
      line: ctx.location.line - 1,
      character: ctx.location.column - 1 + KEYWORD_LENGTHS.context + 1,
    };
  }

  const node = index.nodeMap.get(name);
  if (node) {
    return {
      line: node.location.line - 1,
      character: node.location.column - 1 + KEYWORD_LENGTHS.node + 1,
    };
  }

  const mem = index.memoryMap.get(name);
  if (mem) {
    return {
      line: mem.location.line - 1,
      character: mem.location.column - 1 + KEYWORD_LENGTHS.memory + 1,
    };
  }

  const graph = index.graphMap.get(name);
  if (graph) {
    return {
      line: graph.location.line - 1,
      character: graph.location.column - 1 + KEYWORD_LENGTHS.graph + 1,
    };
  }

  // produces names: "produces Analysis {" — keyword is "produces" (8 chars)
  const prodNode = index.producesNodeMap.get(name);
  if (prodNode) {
    return {
      line: prodNode.produces.location.line - 1,
      character: prodNode.produces.location.column - 1 + 8 + 1, // "produces" = 8
    };
  }

  return null;
}

export function findReferences(
  name: string,
  currentDocText: string,
  currentDocUri: string,
  currentIndex: ProgramIndex,
  includeDeclaration: boolean,
  workspaceFiles: Map<string, { text: string; uri: string }>,
): Location[] {
  const locations: Location[] = [];

  // Declaration position for filtering when includeDeclaration is false
  const declPos = includeDeclaration ? null : findDeclNamePosition(name, currentIndex);

  // Current file
  for (const range of collectRenameLocations(currentDocText, name)) {
    if (
      declPos &&
      range.start.line === declPos.line &&
      range.start.character === declPos.character
    ) {
      continue; // Skip declaration
    }
    locations.push({ uri: currentDocUri, range });
  }

  // Cross-file references
  for (const [, fileInfo] of workspaceFiles) {
    for (const range of collectRenameLocations(fileInfo.text, name)) {
      locations.push({ uri: fileInfo.uri, range });
    }
  }

  return locations;
}
