# A4-Specialist Independent Analysis -- v4.0-R1

## Convergence Score: 8

## Domain Analysis
- Recursive descent with precedence levels is correct for LL(1) with small operator set
- KEY DIFFERENCE: / should be at MULTIPLICATIVE level, not ADDITIVE
  - `a + b / c` should parse as `a + (b/c)` (standard math)
  - Cost: ~8 extra lines for parseMultiplicative()
  - Grammar: Additive -> Multiplicative (('+' | '-') Multiplicative)*, Multiplicative -> Unary ('/' Unary)*
- Expression termination is correct by construction (no semicolons needed)
- LL(1) disambiguation for graph call is standard

## Proposed Implementation
- Same token/AST changes as others (Plus, Minus, Bang, Equals, Let)
- Expression chain WITH separate Multiplicative level for /
- let as arrow-connected flow node (spec example is visual formatting)
- parsePrimary: strict Identifier for first segment (node names are PascalCase)
  - After dot, expectIdentifierOrKeyword for field names
- parseGraphCall: allows zero args
- parseGraphParamDefault: type-aware (Node defaults get expectIdentifier, Int/String/Bool get literal)
- Condition migration: inline extraction at each site

## Key Arguments
1. Division at multiplicative precedence is mathematically correct
2. First segment of field access should be strict Identifier (consistency with node naming)
3. Graph param defaults should be type-validated at parse time
4. KIntegerLiteral should be handled in parsePrimary (5k -> 5000)
