# T5 Analyzer — Implementation Research

## 1. Map/Set for Symbol Tables

The plan already uses the right patterns:
- `Set<string>` for `contextNames`, `nodeNames` — O(1) membership tests.
- `Map<string, Set<string>>` for `producesMap` — node/produces name to field names.
- Populated in constructors from `program.contexts.map(c => c.name)` etc.

These are idiomatic TypeScript. No custom SymbolTable class needed for v1.

## 2. Error Accumulation: GraftError[] vs Throwing

The plan correctly uses **error accumulation** (`check(): GraftError[]`) for the analyzer, despite the parser using throw-on-first-error (T4-R06). This is the right call: the analyzer has no recovery problem (the AST is already well-formed), so collecting all errors gives better UX. Each checker mutates a passed-in `errors` array, returning the combined list.

Note: common_memory says "no error collection (T4)" but that was about the *parser*. The analyzer is a different phase with different tradeoffs.

## 3. Testing Patterns

The plan's test structure is sound:
- **Valid programs**: parse a full program, run checker, assert `errors` is `[]`.
- **Invalid programs**: parse a program with a specific defect, assert `errors.length > 0` and check `errors[0].message` contains the relevant identifier.
- Uses a `parse()` helper that chains Lexer + Parser.

One addition worth considering: test that multiple errors accumulate (e.g., two undeclared nodes return two errors).

## 4. Decomposition: ScopeChecker / TypeChecker / TokenEstimator

This is a good decomposition:
- **ScopeChecker**: "does this name exist?" — pure name resolution.
- **TypeChecker**: "does this field exist on this output?" — structural checks on transforms.
- **TokenEstimator**: budget math — different concern entirely, produces `TokenReport` not just errors.

Each class is <80 lines. Merging them would save nothing and hurt readability. Keep as-is.

## 5. TokenEstimator Heuristics

Plan heuristics: `select=30%`, `filter=50%`, `compact=70%`, `drop=85%`, `truncate=min(current, limit)`.

These are reasonable order-of-magnitude estimates for v1:
- **select** keeps ~1 field out of several; 30% is conservative (real might be lower).
- **filter** removes rows not matching a condition; 50% is a safe middle ground.
- **compact** summarizes/compresses; 70% retention (30% reduction) is modest.
- **drop** removes one field; 85% retention is reasonable for multi-field schemas.
- **truncate** is exact by definition.

For a static estimator these are fine. Real accuracy requires runtime profiling.

## 6. Plan Bug: Parser Constructor Signature

The plan's test helper has `new Parser(tokens, source)` but the actual parser (T4-R01) takes `Token[]` only: `constructor(private readonly tokens: Token[])`. The test helper must be:
```typescript
function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}
```

## 7. DAG Position

Dependency chain: `diagnostics -> tokens -> lexer -> ast -> parser -> analyzer`.
All three analyzer files import from `parser/ast.js` and `errors/diagnostics.js`. No circular dependencies.
