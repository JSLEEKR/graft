# A4-Specialist Cross-Critique -- v4.0-R1

## WITHDRAWN: Division at multiplicative level
Spec grammar is intentionally flat. No * exists. YAGNI.

## WITHDRAWN: Type-aware parseGraphParamDefault
Parser should not do type validation. Aligns with v2.0-R10 ratchet.

## MAINTAINED: Strict Identifier for first segment
Spec grammar says FieldAccess = Identifier ('.' Identifier)*. All examples confirm.

## MAINTAINED: KIntegerLiteral in parsePrimary
5k (= 5000) is valid numeric literal. Lexer already produces the token.

## Revised Positions
- Division: flat (revised)
- Let: arrow-connected (agree with majority)
- Graph call zero args: allow (analyzer validates)
- parsePrimary: strict Identifier first segment (maintained, 3:1 minority)
- conditionFieldName() + mkCond(): support
- Node PascalCase in KEYWORDS: add it (needed for param types)
- Revised score: 9
