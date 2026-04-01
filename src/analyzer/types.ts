import { Program } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export class TypeChecker {
  private program: Program;
  private producesFieldsMap: Map<string, Set<string>>; // node name -> produces field names
  private memoryFieldsMap: Map<string, Set<string>>; // memory name -> field names

  constructor(program: Program) {
    this.program = program;
    this.producesFieldsMap = new Map();
    this.memoryFieldsMap = new Map();

    for (const node of program.nodes) {
      const fieldNames = new Set(node.produces.fields.map(f => f.name));
      this.producesFieldsMap.set(node.name, fieldNames);
    }
    for (const mem of program.memories) {
      this.memoryFieldsMap.set(mem.name, new Set(mem.fields.map(f => f.name)));
    }
  }

  check(): GraftError[] {
    const diagnostics: GraftError[] = [];
    this.checkEdgeTransforms(diagnostics);
    this.checkWritesSchemaOverlap(diagnostics);
    return diagnostics;
  }

  private checkWritesSchemaOverlap(diagnostics: GraftError[]): void {
    for (const node of this.program.nodes) {
      if (node.writes.length === 0) continue;
      const producesFields = this.producesFieldsMap.get(node.name);
      if (!producesFields) continue; // scope checker catches

      for (const writeName of node.writes) {
        const memoryFields = this.memoryFieldsMap.get(writeName);
        if (!memoryFields) continue; // scope checker catches undeclared

        let hasOverlap = false;
        for (const field of producesFields) {
          if (memoryFields.has(field)) { hasOverlap = true; break; }
        }

        if (!hasOverlap) {
          diagnostics.push(new GraftError(
            `Node '${node.name}' writes to memory '${writeName}' but produces no matching fields`,
            node.location,
            'warning',
          ));
        }
      }
    }
  }

  private checkEdgeTransforms(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      const sourceFields = this.producesFieldsMap.get(edge.source);
      if (!sourceFields) continue; // scope checker will catch this

      for (const transform of edge.transforms) {
        // TODO: condition type compatibility -- e.g., >= on String fields (v2)
        if (transform.type === 'select') {
          for (const f of transform.fields) {
            if (!sourceFields.has(f)) {
              errors.push(new GraftError(
                `select: field '${f}' does not exist in '${edge.source}' output`,
                edge.location,
              ));
            }
          }
        } else if (transform.type === 'filter') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `filter: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
            ));
          }
        } else if (transform.type === 'drop') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `drop: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
            ));
          }
        }
      }
    }
  }
}
