import type { Expr } from '../src/parser/ast.js';

const DUMMY_LOC = { line: 0, column: 0, offset: 0 };

export function mkCond(field: string, op: '<' | '>' | '<=' | '>=' | '==' | '!=', value: string | number | boolean): Expr {
  return {
    kind: 'binary',
    op,
    left: { kind: 'field_access', segments: field.split('.'), location: DUMMY_LOC },
    right: { kind: 'literal', value, location: DUMMY_LOC },
    location: DUMMY_LOC,
  };
}
