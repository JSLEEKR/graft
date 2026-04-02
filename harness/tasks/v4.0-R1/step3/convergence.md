# Convergence Report — v4.0-R1: Lexer + AST + Expression Parser

## Ratchet-Locked Items
- [v4.0-R01] Expr: 5-kind discriminated union with mandatory SourceLocation
- [v4.0-R02] Division at additive precedence (flat with +/-), no multiplicative level
- [v4.0-R03] Condition.left: Expr replaces Condition.field atomically
- [v4.0-R04] conditionFieldName() bridge exported from ast.ts
- [v4.0-R05] Let: arrow-connected FlowNode kind
- [v4.0-R06] Graph call: LL(1) disambiguation (Identifier + LParen)
- [v4.0-R07] parsePrimary: permissive first segment (accepts KEYWORD_TYPES)
- [v4.0-R08] Graph params: after budget, comma-separated, Node checked by value
- [v4.0-R09] Foreach body: allows node/let/graph_call, rejects parallel/foreach
- [v4.0-R10] Graph call zero args: allowed at parser level
- [v4.0-R11] FlowNode: 5 kinds (node, parallel, foreach, let, graph_call)
- [v4.0-R12] GraphDecl.params: GraphParam[] (required field, defaults to [])
- [v4.0-R13] New tokens: Plus, Minus, Bang, Equals, Let
- [v4.0-R14] mkCond() test helper in tests/helpers.ts
- [v4.0-R15] KIntegerLiteral included in parsePrimary

## Forced Dissent Rulings
1. Flat division: ACCEPT (spec grammar authority) 
2. conditionFieldName crutch: REJECT (bridge appropriate for R1)
3. Node in KEYWORDS: ACCEPT self-rebuttal (check value at parse site)
4. Foreach graph_call: ACCEPT self-rebuttal (allow both let+graph_call)

## Key Decisions
- Division / at same level as +/- in parseAdditive (spec grammar explicit)
- let is arrow-connected FlowNode (plan says parseFlowNode)
- Graph call zero args allowed (analyzer validates in R2)
- parsePrimary permissive (keywords + identifiers for first segment)
- Node type: check Identifier value at parse site, not KEYWORDS
- foreach allows node/let/graph_call, rejects parallel/foreach
- 22 new tests (exceeds plan target of 18)
