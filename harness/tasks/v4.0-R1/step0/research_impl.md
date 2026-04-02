# Implementation Research -- v4.0-R1: Lexer + AST + Expression Parser

## 1. Current Token Set (src/lexer/tokens.ts)

**Already exist**: Slash, LParen/RParen, Dot, IntegerLiteral/FloatLiteral/StringLiteral, True/False, BangEqual, comparison operators.

**Must add**: Plus (+), Minus (-), Bang (!), Let keyword.

**Lexer impact**: Plus goes into SINGLE_CHAR. Minus and Bang need care with matchTwoChar (checks `->` and `!=` first), but SINGLE_CHAR is safe because matchTwoChar runs first (maximal munch).

## 2. Condition Interface Migration Scope

**Current** (ast.ts:128-132):
```ts
export interface Condition {
  field: string;
  op: '>=' | '>' | '<' | '<=' | '==' | '!=';
  value: string | number | boolean;
}
```

**Source files reading `condition.field`** (4 files):
- src/codegen/hooks.ts:99
- src/runtime/flow-runner.ts:21
- src/runtime/transforms.ts:95
- src/analyzer/types.ts:98 (destructures `{ op, field }`)

**Test files**: ~142 occurrences across 15 test files constructing Condition literals.

## 3. FlowNode Union and Exhaustive Switches

**Current** (ast.ts:78-82): 3 kinds -- `node`, `parallel`, `foreach`.

**Switch locations** (7 sites):
1. src/codegen/settings.ts:39-44
2. src/analyzer/estimator.ts:85-117
3. src/analyzer/estimator.ts:129-157
4. src/runtime/flow-runner.ts:169-202
5. src/analyzer/scope.ts:241-265
6. src/codegen/orchestration.ts:68-142
7. src/lsp/features/symbols.ts:45-50

All need `case 'let'` and `case 'graph_call'` branches.

## 4. parseFlowNode() (parser.ts:597-608)

Current: checks Parallel → Foreach → falls through to expectIdentifier() for node name.

New disambiguation order:
1. Parallel keyword -> parseParallelStep()
2. Foreach keyword -> parseForeachStep()
3. Let keyword -> parseLetStep() (new)
4. Identifier + peek `(` -> parseGraphCall() (new)
5. Identifier alone -> node reference (existing)

## 5. parseGraphDecl() (parser.ts:526-551)

Current: parses `graph Name(input: X, output: Y, budget: Nk)`. Params should be parsed after budget, before RParen, as optional comma-separated list.

**GraphDecl** (ast.ts:85-92): needs `params: GraphParam[]` field added.

## 6. Migration Strategy

Pattern: `field: 'X', op:` becomes `left: { kind: 'field_access', segments: ['X'] }, op:`.
FlowNode switch stubs added in R1 to keep build passing. Runtime/analyzer changes come in R2/R3.

## 7. Parser Size Estimate

906 + ~80 (expr) + ~40 (let/graph_call/params) = ~1026 lines. Under 1050 threshold.
