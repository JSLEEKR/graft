import type { Condition, Expr } from '../src/parser/ast.js';

const DUMMY_LOC = { line: 0, column: 0, offset: 0 };

export function mkCond(field: string, op: Condition['op'], value: string | number | boolean): Condition {
  return {
    left: { kind: 'field_access', segments: field.split('.'), location: DUMMY_LOC },
    op,
    value,
  };
}
