import type { DocumentSymbol } from 'vscode-languageserver/node';
import { SymbolKind } from 'vscode-languageserver/node';
import type { SourceLocation } from '../../errors/diagnostics.js';
import type { Program, Field, FlowNode } from '../../parser/ast.js';
import type { ProgramIndex } from '../../program-index.js';

export function getDocumentSymbols(program: Program, index: ProgramIndex): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  for (const ctx of program.contexts) {
    const sym = makeSymbol(ctx.name, SymbolKind.Class, ctx.location);
    sym.children = makeFieldChildren(ctx.fields);
    symbols.push(sym);
  }
  for (const node of program.nodes) {
    const sym = makeSymbol(node.name, SymbolKind.Function, node.location);
    sym.children = makeFieldChildren(node.produces.fields);
    symbols.push(sym);
  }
  for (const mem of program.memories) {
    const sym = makeSymbol(mem.name, SymbolKind.Variable, mem.location);
    sym.children = makeFieldChildren(mem.fields);
    symbols.push(sym);
  }
  for (const graph of program.graphs) {
    const sym = makeSymbol(graph.name, SymbolKind.Module, graph.location);
    sym.children = makeFlowNodeChildren(graph.flow, graph.location);
    symbols.push(sym);
  }
  for (const edge of program.edges) {
    const targetName = edge.target.kind === 'direct' ? edge.target.node : 'conditional';
    symbols.push(makeSymbol(`${edge.source} -> ${targetName}`, SymbolKind.Event, edge.location));
  }

  return symbols;
}

function makeFieldChildren(fields: Field[]): DocumentSymbol[] {
  return fields.map(f => makeSymbol(f.name, SymbolKind.Field, f.location));
}

function makeFlowNodeChildren(flow: FlowNode[], parentLoc: SourceLocation): DocumentSymbol[] {
  const children: DocumentSymbol[] = [];
  for (const node of flow) {
    if (node.kind === 'node') {
      children.push(makeSymbol(node.name, SymbolKind.Function, node.location ?? parentLoc));
    } else if (node.kind === 'parallel') {
      const label = `parallel(${node.branches.join(', ')})`;
      children.push(makeSymbol(label, SymbolKind.Function, node.location ?? parentLoc));
    } else if (node.kind === 'foreach') {
      const label = `foreach(${node.source}.${node.field})`;
      const sym = makeSymbol(label, SymbolKind.Function, node.location ?? parentLoc);
      sym.children = makeFlowNodeChildren(node.body, node.location ?? parentLoc);
      children.push(sym);
    }
  }
  return children;
}

export function makeSymbol(name: string, kind: SymbolKind, loc: SourceLocation): DocumentSymbol {
  const line = Math.max(0, loc.line - 1);
  const character = Math.max(0, loc.column - 1);
  // range spans from keyword start to past the name (keyword + space + name)
  const rangeEnd = loc.length != null ? loc.length + 1 + name.length : name.length;
  const range = {
    start: { line, character },
    end: { line, character: character + rangeEnd },
  };
  const nameStart = loc.length != null ? character + loc.length + 1 : character;
  const selectionRange = {
    start: { line, character: nameStart },
    end: { line, character: nameStart + name.length },
  };
  return { name, kind, range, selectionRange };
}
