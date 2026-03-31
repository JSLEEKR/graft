# A1-Architect Review: T5 Analyzer (Scope, Type, Token Estimation)

## Convergence Score: 4/5

The plan and research are strongly aligned. One confirmed bug, one naming correction, and a few minor structural observations -- but no architectural disagreements.

---

## 1. Three-Class Decomposition: AGREE

The ScopeChecker / TypeChecker / TokenEstimator split is the right decomposition.

- **ScopeChecker** answers "does this name exist?" -- pure set membership.
- **TypeChecker** answers "does this field exist on this produces schema?" -- structural checks on edge transforms.
- **TokenEstimator** is fundamentally different: it returns a `TokenReport` (budget math), not just errors.

Each class is under 80 lines. They share no mutable state, have no ordering dependencies between them (scope and type are independent; estimator can silently skip missing nodes). Merging would save zero lines and add cognitive load. Keep as-is.

## 2. Error Accumulation vs Throwing: AGREE WITH PLAN

The plan correctly uses `check(): GraftError[]` accumulation. This is the right call despite T4-R06 (throw-on-first-error for the parser). The key difference:

- **Parser**: recovery from a syntax error is hard; throwing is pragmatic for v1.
- **Analyzer**: the AST is already well-formed. Each check is independent. Collecting all errors provides better UX (fix multiple issues per compile cycle).

The common_memory note "no error collection (T4)" refers specifically to the *parser phase*, not to analysis. This is not a contradiction.

`GraftError` already supports `severity: 'error' | 'warning'` (diagnostics.ts line 12), and the plan correctly uses `'warning'` severity for TokenEstimator budget overruns.

## 3. TokenEstimator Heuristics: SOUND FOR V1

The heuristic multipliers are reasonable order-of-magnitude estimates:

| Transform | Multiplier | Rationale |
|-----------|-----------|-----------|
| select    | 0.3       | Keeps ~1 field out of several; conservative |
| filter    | 0.5       | Predicate filtering; 50% is safe middle ground |
| drop      | 0.85      | Removes one field; 85% retention is reasonable |
| compact   | 0.7       | Whitespace stripping; 30% reduction is modest |
| truncate  | min(current, cap) | Exact by definition |

These are applied sequentially (which the plan does correctly). For a static estimator this is fine. Exact accuracy would require runtime profiling, which is out of v1 scope.

**One observation on `select` stacking:** Multiple `select` transforms in sequence apply 0.3 multiplicatively (0.3 * 0.3 = 0.09), which could undercount. However, in practice multiple selects accumulate (keep multiple fields), so the first select doing the big reduction and subsequent ones being smaller is roughly correct. No change needed for v1.

**Retry multiplier logic is correct:** `1 + max` for retry and retry_then_fallback. Skip/abort/fallback correctly return 1. The fallback node's own cost would be counted separately if it appears in the graph flow, which is the right behavior.

## 4. ScopeChecker Coverage: COMPLETE

The ScopeChecker handles all three validation targets from the spec (Section 4.3):

1. **reads references** -- checks `ref.context` against both `contextNames` (Set) and `producesMap` (Map). Handles partial field references (`Research.findings`) by checking the field exists in the resolved schema. Correct.

2. **Edge source/target** -- checks `edge.source` against `nodeNames`. Handles both `direct` (single target) and `conditional` (branched targets) EdgeTarget kinds via the discriminated union's `kind` field. Correct.

3. **Graph flow** -- checks each string in `graph.flow` against `nodeNames`. Correct.

No nested scopes, no shadowing, no forward-reference issues. Flat namespace via Set.has() is the right structure.

**Note on graph input/output validation:** The spec says graph `input` must reference a declared context and `output` must reference a declared produces type. The plan places this in TypeChecker. The research notes this could also be scope. I agree with the plan's placement -- it is a type-level check (input/output compatibility), not just name resolution. However, the plan's TypeChecker code does NOT actually implement this check. It only checks edge transforms. This is a **gap** that should be addressed during implementation -- either add it to TypeChecker or ScopeChecker, but do not leave it unimplemented.

## 5. File Naming: AGREE WITH RENAME

Rename `analyzer/tokens.ts` to `analyzer/estimator.ts`. Reasons:

- Avoids confusion with `lexer/tokens.ts` in import paths and developer navigation.
- The export is `TokenEstimator`, not a token-related module. `estimator.ts` matches the class name.
- Common memory explicitly notes this rename (line 89).

The import in the test file should be updated accordingly:
```typescript
import { TokenEstimator, TokenReport } from '../src/analyzer/estimator.js';
```

## 6. CONFIRMED BUG: Parser Constructor Signature

The plan's test helper (line 1947) has:
```typescript
return new Parser(tokens, source).parse();
```

But T4-R01 locked the Parser constructor to `Token[]` only (confirmed: parser.ts line 18 has `constructor(private readonly tokens: Token[])`). The test helper must be:
```typescript
function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}
```

This bug appears in BOTH the analyzer test helper (line 1947) and the codegen test helper (line 2536). Both must be fixed.

## 7. Minor Observations

**7a. Location for analyzer errors:** The plan passes `ref.location`, `edge.location`, and `graph.location` to GraftError. This requires AST nodes to have `location` fields, which they do (confirmed in ast.ts -- all declaration interfaces include `location: SourceLocation`). `ContextRef` also has `location: SourceLocation` (ast.ts line 91). Correct.

**7b. `producesMap` key:** ScopeChecker uses `node.produces.name` as the key (e.g., "Research"), while TypeChecker uses `node.name` as the key (e.g., "Researcher"). This is correct because scope resolution looks up by produces type name (what `reads` references), while type checking looks up by source node name (what `edge.source` references). The two maps serve different purposes and the key choice is right for each.

**7c. Import extensions:** All imports must use `.js` extension per T1-R09. The plan's code does this correctly.

**7d. No barrel exports:** Per T1-R08, each analyzer file exports its class directly. No `analyzer/index.ts`. The plan is correct here.

## 8. Summary of Required Changes for Implementation

| Item | Action |
|------|--------|
| Parser constructor bug | Fix `new Parser(tokens, source)` to `new Parser(tokens)` in test helpers |
| File rename | `analyzer/tokens.ts` -> `analyzer/estimator.ts` |
| Graph input/output check | Add validation that graph input references a context and output references a produces type |
| Import path | Update test import from `analyzer/tokens.js` to `analyzer/estimator.js` |

## 9. Verdict

The architecture is sound. The three-class decomposition, error accumulation strategy, heuristic approach, and scope checking coverage are all correct for v1. The confirmed bug (Parser constructor signature) and the naming correction (tokens.ts -> estimator.ts) are straightforward fixes. The missing graph input/output validation is a small gap to fill during implementation.

No architectural changes needed. Proceed to implementation with the fixes noted above.
