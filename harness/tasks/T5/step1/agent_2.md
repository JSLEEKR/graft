# T5 Agent 2 (A2-Pragmatist) Analysis

## Convergence Score: 4/5

Research agents agree on fundamentals. One open question (merge vs split) and one simplification opportunity (TokenEstimator) prevent a 5.

---

## Q1: Can the 3 analyzers be combined into fewer? Is the split justified?

**Verdict: Keep the split. It is justified.**

ScopeChecker and TypeChecker are conceptually close (both do name resolution against sets), but they answer different questions:
- ScopeChecker: "Does this name exist anywhere in the program?"
- TypeChecker: "Does this field exist on *this specific* produces output?"

Merging them saves maybe 10 lines (one constructor, one `check()` entry point) but conflates two failure modes that users need to distinguish. When a user sees `select: field 'foo' does not exist in 'A' output`, they need to know this is a type/schema error, not a missing-declaration error.

TokenEstimator is a completely different concern -- it returns `TokenReport`, not `GraftError[]`. Merging it with the others would be nonsensical.

Each class is under 80 lines. The overhead of three files is negligible. Research agent A1 is correct here.

## Q2: Are all test cases necessary?

**Verdict: Yes, with one addition recommended.**

The plan has 8 tests across 3 describe blocks:
- ScopeChecker (5): valid program, undeclared context, invalid partial field, undeclared edge target, undeclared flow node
- TypeChecker (2): valid transforms, select on nonexistent field, drop on nonexistent field
- TokenEstimator (2): simple estimate, budget warning

Each test targets a distinct code path. None are redundant. However:

**Recommended addition:** A test for multiple error accumulation. The plan tests `errors.length > 0` but never verifies that two distinct errors produce `errors.length === 2`. This is the defining behavior difference from the parser (which throws on first error per T4-R06). One test like "two undeclared nodes in edges produce two errors" would lock this in. Research_impl.md section 3 also flags this.

**No test cuts recommended.**

## Q3: Is TokenEstimator over-designed for v1?

**Verdict: Slightly, but the excess is harmless.**

What is justified:
- Per-node input estimation from reads (core purpose)
- Transform reduction heuristics (core purpose)
- Retry multiplier (simple, 5 lines, catches real budget blowups)
- Budget warning (the whole point of estimation)

What is borderline:
- `edgeMap` with `"source->target"` string keys: This is a minor smell. For v1 with a single graph and linear flow, the edge lookup could just iterate `program.edges` with a find(). The Map adds 4 lines of setup for O(1) that will never matter at v1 scale (programs have <20 edges). Not worth changing though -- it works and is not incorrect.
- `bestCase` vs `worstCase` split: Justified. Without both, the budget warning is meaningless (you need worstCase to compare against budget, and bestCase to show the optimistic number).

**TokenEstimator is appropriately scoped.** It does one thing (estimate tokens), returns one result type, and the heuristics are hardcoded constants (no configuration surface). This is not over-designed.

## Q4: Can heuristics be simpler?

**Verdict: The heuristics are already simple. No changes needed.**

The five transform multipliers are:
- `select = 0.3` (keep ~1 field)
- `filter = 0.5` (remove ~half the rows)
- `drop = 0.85` (remove 1 field, keep rest)
- `compact = 0.7` (summarize, ~30% reduction)
- `truncate = min(current, cap)` (exact by definition)

These are single `Math.floor(result * constant)` calls. You cannot make this simpler without removing heuristics entirely (which would make the estimator useless). The constants are reasonable order-of-magnitude guesses for v1. Real accuracy requires runtime profiling, which is out of scope.

One thing to note: multiple `select` transforms compound multiplicatively (0.3 * 0.3 = 0.09), which may under-estimate. But for v1 this is fine -- programs rarely chain multiple selects on the same edge.

## Known Bug Confirmation

**CONFIRMED:** Plan line 1946 has `new Parser(tokens, source)` but T4-R01 locks the parser constructor to `Token[]` only. The test helper must be:

```typescript
function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}
```

This is a straightforward fix. Research_impl.md section 6 documents the same finding.

## File Naming

Agree with research and common_memory: rename `analyzer/tokens.ts` to `analyzer/estimator.ts` to avoid confusion with `lexer/tokens.ts`. The export is `TokenEstimator`, so `estimator.ts` is the natural filename.

## Additional Observations

1. **TypeChecker has duplicate logic for select/filter/drop:** The three branches in `checkEdgeTransforms` are identical except for the transform type name in the error message. Could be a single `if ('field' in transform)` check. Minor, but worth noting -- the plan's version is clearer for reading, so this is a style call, not a bug.

2. **Graph input/output validation placement:** Research_arch.md notes the plan puts graph `input` (must be a context) and `output` (must be a produces) validation in TypeChecker. The plan code does NOT actually implement this -- it only checks edge transforms. This is a gap. Either ScopeChecker or TypeChecker should validate that `graph.input` resolves to a context name and `graph.output` resolves to a produces name. ScopeChecker is the natural home since it already has both `contextNames` and `producesMap`.

3. **No `filter` test in TypeChecker:** The plan tests `select` and `drop` on nonexistent fields but not `filter`. Since all three share the same code path pattern, this is acceptable for v1, but a `filter` test would be cheap to add.

## Summary

The plan is sound. The three-file split is justified. Tests cover the critical paths. TokenEstimator is right-sized. Heuristics are already minimal. Fix the parser constructor bug, rename tokens.ts to estimator.ts, and consider adding graph input/output validation to ScopeChecker.
