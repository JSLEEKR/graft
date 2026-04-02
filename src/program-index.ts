import { Program, ContextDecl, NodeDecl, MemoryDecl, EdgeDecl, GraphDecl, TypeExpr, FlowNode, Expr } from './parser/ast.js';
import type { SourceLocation } from './errors/diagnostics.js';

export interface LetBinding {
  name: string;
  value: Expr;
  graphName: string;
  location?: SourceLocation;
}

export class ProgramIndex {
  readonly contextMap: Map<string, ContextDecl>;
  readonly nodeMap: Map<string, NodeDecl>;
  readonly memoryMap: Map<string, MemoryDecl>;
  readonly edgesBySource: Map<string, EdgeDecl[]>;
  readonly producesNodeMap: Map<string, NodeDecl>;
  readonly graphMap: Map<string, GraphDecl>;
  readonly producesFieldsMap: Map<string, Map<string, TypeExpr>>;
  readonly memoryFieldsMap: Map<string, Map<string, TypeExpr>>;
  readonly letBindingMap: Map<string, LetBinding>;

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

    this.graphMap = new Map();
    for (const g of program.graphs) {
      this.graphMap.set(g.name, g);
    }

    this.producesFieldsMap = new Map();
    for (const n of program.nodes) {
      const fields = new Map<string, TypeExpr>();
      for (const f of n.produces.fields) {
        fields.set(f.name, f.type);
      }
      // Keyed by both node name AND produces name for different lookup patterns
      this.producesFieldsMap.set(n.name, fields);
      this.producesFieldsMap.set(n.produces.name, fields);
    }

    this.memoryFieldsMap = new Map();
    for (const m of program.memories) {
      const fields = new Map<string, TypeExpr>();
      for (const f of m.fields) {
        fields.set(f.name, f.type);
      }
      this.memoryFieldsMap.set(m.name, fields);
    }

    this.letBindingMap = new Map();
    for (const g of program.graphs) {
      this.collectLetBindings(g.flow, g.name);
    }
  }

  private collectLetBindings(nodes: FlowNode[], graphName: string): void {
    for (const step of nodes) {
      if (step.kind === 'let') {
        this.letBindingMap.set(step.name, {
          name: step.name,
          value: step.value,
          graphName,
          location: step.location,
        });
      } else if (step.kind === 'foreach') {
        this.collectLetBindings(step.body, graphName);
      }
    }
  }
}
