import type { Location } from 'vscode-languageserver/node';
import { pathToFileURL } from 'node:url';
import type { SourceLocation } from '../../errors/diagnostics.js';
import type { ProgramIndex } from '../../program-index.js';

export function getDefinitionLocation(word: string, index: ProgramIndex, currentUri: string): Location | null {
  const ctx = index.contextMap.get(word);
  if (ctx) return declLocation(ctx.location, ctx.sourceFile, word.length, currentUri);

  const node = index.nodeMap.get(word);
  if (node) return declLocation(node.location, node.sourceFile, word.length, currentUri);

  const producerNode = index.producesNodeMap.get(word);
  if (producerNode) {
    return declLocation(producerNode.produces.location, producerNode.sourceFile, word.length, currentUri);
  }

  const mem = index.memoryMap.get(word);
  if (mem) return declLocation(mem.location, undefined, word.length, currentUri);

  const letBinding = index.letBindingMap.get(word);
  if (letBinding?.location) return declLocation(letBinding.location, undefined, word.length, currentUri);

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
