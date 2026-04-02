# A1-Architect Independent Analysis -- v4.0-R1

## Convergence Score: 8

## Key Design Decisions
- D1: Expr as flat discriminated union with mandatory SourceLocation (every variant)
- D2: Recursive descent with precedence levels, not Pratt (3 levels: additive > unary > primary)
- D3: Condition.left: Expr replaces Condition.field atomically via type-driven migration
- D4: GraphParam.type as narrow union 'Node' | 'Int' | 'String' | 'Bool'
- D5: Add Equals token for `let x = expr` assignment (plan gap)
- D6: Add `Node` PascalCase to KEYWORDS map (plan gap)
- D7: Division reuses existing Slash token (context disambiguates)
- D8: Inline expression parser in parser.ts (defer split)

## Proposed Implementation
- Lexer: Plus, Minus, Bang, Equals to SINGLE_CHAR + Let to KEYWORDS + Node PascalCase
- AST: Expr union, GraphParam, GraphArg, FlowNode +let/graph_call, GraphDecl +params, Condition.left
- Parser: parseExpr/parseAdditive/parseUnary/parsePrimary chain, parseLetStep, parseGraphCall, parseGraphParamType
- Expression parser: / at same level as +/- in parseAdditive
- parseCondition: calls parseExpr() for LHS instead of expectIdentifierOrKeyword()
- parsePrimary: accepts Identifier OR keywords for first segment of field access
- foreach body: allow let, reject graph_call (conservative)
- conditionFieldName() bridge helper for migration

## Issues Found
1. Missing Equals token (HIGH - blocks let parsing)
2. Node PascalCase not in KEYWORDS (HIGH - blocks Node type params)
3. Foreach nesting rejects let (MEDIUM)
4. parseExpr stops at comparison operators (verified safe)
5. let fits naturally in arrow-separated flow (verified)
