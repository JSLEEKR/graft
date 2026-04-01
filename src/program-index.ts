import { Program, ContextDecl, NodeDecl, MemoryDecl, EdgeDecl } from './parser/ast.js';

export class ProgramIndex {
  readonly contextMap: Map<string, ContextDecl>;
  readonly nodeMap: Map<string, NodeDecl>;
  readonly memoryMap: Map<string, MemoryDecl>;
  readonly edgesBySource: Map<string, EdgeDecl[]>;
  readonly producesNodeMap: Map<string, NodeDecl>;

  constructor(program: Program) {
    this.contextMap = new Map();
    for (const c of program.contexts) {
      this.contextMap.set(c.name, c);
    }

    this.nodeMap = new Map();
    this.producesNodeMap = new Map();
    for (const n of program.nodes) {
      this.nodeMap.set(n.name, n);
      this.producesNodeMap.set(n.produces.name, n);
    }

    this.memoryMap = new Map();
    for (const m of program.memories) {
      this.memoryMap.set(m.name, m);
    }

    this.edgesBySource = new Map();
    for (const e of program.edges) {
      const existing = this.edgesBySource.get(e.source) ?? [];
      existing.push(e);
      this.edgesBySource.set(e.source, existing);
    }
  }
}
