import { Program } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';
import { ProgramIndex } from '../program-index.js';

export class TypeChecker {
  private program: Program;
  private index: ProgramIndex;

  constructor(program: Program, index?: ProgramIndex) {
    this.program = program;
    this.index = index ?? new ProgramIndex(program);
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
      const producesFields = this.index.producesFieldsMap.get(node.name);
      if (!producesFields) continue; // scope checker catches

      for (const writeRef of node.writes) {
        const memoryFields = this.index.memoryFieldsMap.get(writeRef.memory);
        if (!memoryFields) continue; // scope checker catches undeclared

        let hasOverlap = false;
        for (const field of producesFields.keys()) {
          if (memoryFields.has(field)) { hasOverlap = true; break; }
        }

        if (!hasOverlap) {
          diagnostics.push(new GraftError(
            `Node '${node.name}' writes to memory '${writeRef.memory}' but produces no matching fields`,
            node.location,
            'warning',
            'TYPE_SCHEMA_MISMATCH',
          ));
        }
      }
    }
  }

  private checkEdgeTransforms(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      const sourceFields = this.index.producesFieldsMap.get(edge.source);
      if (!sourceFields) continue; // scope checker will catch this

      for (const transform of edge.transforms) {
        // TODO: condition type compatibility -- e.g., >= on String fields (v2)
        if (transform.type === 'select') {
          for (const f of transform.fields) {
            if (!sourceFields.has(f)) {
              errors.push(new GraftError(
                `select: field '${f}' does not exist in '${edge.source}' output`,
                edge.location,
                'error',
                'TYPE_FIELD_NOT_FOUND',
              ));
            }
          }
        } else if (transform.type === 'filter') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `filter: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
              'error',
              'TYPE_FIELD_NOT_FOUND',
            ));
          }
        } else if (transform.type === 'drop') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `drop: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
              'error',
              'TYPE_FIELD_NOT_FOUND',
            ));
          }
        }
      }
    }
  }
}
