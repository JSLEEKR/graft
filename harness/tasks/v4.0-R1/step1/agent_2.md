# A2-Pragmatist Independent Analysis -- v4.0-R1

## Convergence Score: 8

## Core Principles
- YAGNI: only parsing + AST in R1, no runtime/analyzer for new constructs
- conditionFieldName() bridge for minimal migration pain
- No file splits (~1026 lines post-change)
- FlowNode switch stubs, not implementations

## Proposed Implementation
- Tokens: Plus, Minus, Bang, Equals, Let (5 new enum + SINGLE_CHAR + KEYWORDS)
- AST: Expr union, GraphParam, GraphArg, FlowNode +let/graph_call, GraphDecl +params, Condition.left
- Parser: expression chain with / at same level as +/-
- parseLetStep: Let keyword -> expectIdentifierOrKeyword -> Equals -> parseExpr
- parseGraphCallArgs: identifier + LParen -> named args. Error on zero args.
- parseGraph: params parsed as comma-separated after budget
- parseCondition: calls parseExpr() for LHS
- parsePrimary: accepts keywords for field access (needed for output.score)
- foreach body: allow let, reject parallel/foreach/graph_call
- conditionFieldName() exported from ast.ts
- mkCond() test helper for 142 test occurrences

## Issues Found
1. Equals token needed (plan gap)
2. Division vs budget safe (different parser contexts)
3. let keyword collision: verified no existing usage
4. Graph call zero args should error
5. Node as param type reuses TokenType.Node (works contextually)
