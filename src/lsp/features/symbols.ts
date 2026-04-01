import type { DocumentSymbol } from 'vscode-languageserver/node';
import { SymbolKind } from 'vscode-languageserver/node';
import type { SourceLocation } from '../../errors/diagnostics.js';
import type { Program } from '../../parser/ast.js';
import type { ProgramIndex } from '../../program-index.js';

export function getDocumentSymbols(program: Program, index: ProgramIndex): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  for (const ctx of program.contexts) {
    symbols.push(makeSymbol(ctx.name, SymbolKind.Class, ctx.location));
  }
  for (const node of program.nodes) {
    symbols.push(makeSymbol(node.name, SymbolKind.Function, node.location));
  }
  for (const mem of program.memories) {
    symbols.push(makeSymbol(mem.name, SymbolKind.Variable, mem.location));
  }
  for (const graph of program.graphs) {
    symbols.push(makeSymbol(graph.name, SymbolKind.Module, graph.location));
  }
  for (const edge of program.edges) {
    const targetName = edge.target.kind === 'direct' ? edge.target.node : 'conditional';
    symbols.push(makeSymbol(`${edge.source} -> ${targetName}`, SymbolKind.Event, edge.location));
  }

  return symbols;
}

export function makeSymbol(name: string, kind: SymbolKind, loc: SourceLocation): DocumentSymbol {
  const line = Math.max(0, loc.line - 1);
  const character = Math.max(0, loc.column - 1);
  const range = {
    start: { line, character },
    end: { line, character: character + name.length },
  };
  return { name, kind, range, selectionRange: range };
}
