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

/**
 * Find the declaration name's 0-based position from ProgramIndex.
 * Declaration locations point to the keyword token (e.g., "context" in "context Foo").
 * The name starts at keyword column + keyword length + 1 (for the space).
 * Uses location.length from SourceLocation rather than hardcoded keyword lengths.
 */
function findDeclNamePosition(
  name: string,
  index: ProgramIndex,
): { line: number; character: number } | null {
  const decl = index.contextMap.get(name) ?? index.nodeMap.get(name) ??
    index.memoryMap.get(name) ?? index.graphMap.get(name);
  if (decl && decl.location.length != null) {
    return {
      line: decl.location.line - 1,
      character: decl.location.column - 1 + decl.location.length + 1,
    };
  }

  const prodNode = index.producesNodeMap.get(name);
  if (prodNode && prodNode.produces.location.length != null) {
    return {
      line: prodNode.produces.location.line - 1,
      character: prodNode.produces.location.column - 1 + prodNode.produces.location.length + 1,
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
