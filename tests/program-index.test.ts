import { describe, it, expect } from 'vitest';
import { ProgramIndex } from '../src/program-index.js';
import { Program } from '../src/parser/ast.js';

function makeProgram(overrides: Partial<Program> = {}): Program {
  return {
    imports: [],
    memories: [],
    contexts: [],
    nodes: [],
    edges: [],
    graphs: [],
    ...overrides,
  };
}

const loc = { line: 1, column: 1, offset: 0 };

describe('ProgramIndex', () => {
  it('builds contextMap from program.contexts', () => {
    const ctx = { name: 'Spec', maxTokens: 1000, fields: [], location: loc };
    const index = new ProgramIndex(makeProgram({ contexts: [ctx] }));
    expect(index.contextMap.get('Spec')).toBe(ctx);
    expect(index.contextMap.size).toBe(1);
  });

  it('builds nodeMap from program.nodes', () => {
    const node = {
      name: 'Worker',
      model: 'sonnet',
      budgetIn: 1000,
      budgetOut: 500,
      reads: [],
      tools: [],
      writes: [],
      produces: { name: 'WorkerOut', fields: [], location: loc },
      location: loc,
    };
    const index = new ProgramIndex(makeProgram({ nodes: [node] }));
    expect(index.nodeMap.get('Worker')).toBe(node);
    expect(index.nodeMap.size).toBe(1);
  });

  it('builds producesNodeMap keyed by produces name', () => {
    const node = {
      name: 'Worker',
      model: 'sonnet',
      budgetIn: 1000,
      budgetOut: 500,
      reads: [],
      tools: [],
      writes: [],
      produces: { name: 'WorkerOut', fields: [], location: loc },
      location: loc,
    };
    const index = new ProgramIndex(makeProgram({ nodes: [node] }));
    expect(index.producesNodeMap.get('WorkerOut')).toBe(node);
    expect(index.producesNodeMap.has('Worker')).toBe(false);
  });

  it('builds edgesBySource grouping edges by source name', () => {
    const edge1 = {
      source: 'A',
      target: { kind: 'direct' as const, node: 'B' },
      transforms: [],
      location: loc,
    };
    const edge2 = {
      source: 'A',
      target: { kind: 'direct' as const, node: 'C' },
      transforms: [],
      location: loc,
    };
    const edge3 = {
      source: 'B',
      target: { kind: 'direct' as const, node: 'C' },
      transforms: [],
      location: loc,
    };
    const index = new ProgramIndex(makeProgram({ edges: [edge1, edge2, edge3] }));
    expect(index.edgesBySource.get('A')).toEqual([edge1, edge2]);
    expect(index.edgesBySource.get('B')).toEqual([edge3]);
    expect(index.edgesBySource.has('C')).toBe(false);
  });

  it('builds memoryMap from program.memories', () => {
    const mem = {
      name: 'History',
      maxTokens: 2000,
      storage: 'file' as const,
      fields: [],
      location: loc,
    };
    const index = new ProgramIndex(makeProgram({ memories: [mem] }));
    expect(index.memoryMap.get('History')).toBe(mem);
    expect(index.memoryMap.size).toBe(1);
  });

  it('handles empty program', () => {
    const index = new ProgramIndex(makeProgram());
    expect(index.contextMap.size).toBe(0);
    expect(index.nodeMap.size).toBe(0);
    expect(index.memoryMap.size).toBe(0);
    expect(index.edgesBySource.size).toBe(0);
    expect(index.producesNodeMap.size).toBe(0);
  });
});
