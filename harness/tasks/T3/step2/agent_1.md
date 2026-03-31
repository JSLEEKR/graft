# A1-Architect: Step 2 Cross-Critique — AST Type Definitions

## Critiques of Each Agent's Step 1 Proposal

### Agent 1 (Self — Architect)

My Step 1 proposal scored convergence at 92/100 and recommended two optional additions: `location` on `Condition` and `location` on `Transform` variants. After reviewing the other agents, I maintain these recommendations but acknowledge they are non-blocking refinements. My proposal was correct in identifying no structural changes to the plan.

**Self-correction:** I spent too much analysis space on things I concluded "no change needed" for (Changes 3, 4). Step 2 should be sharper.

---

### Agent 2 (Pragmatist) — Score: 9/10

**Strengths:**
- Rigorous YAGNI analysis of all TypeExpr variants, concluding all 9 are needed because they are in v1 spec scope. This is the right call and well-argued.
- Correct defense of ProducesDecl as a separate interface (own location, own name, analyzer needs it independently).
- Good confirmation that no test file is needed for a types-only module.
- "Use the plan's types verbatim" is a defensible position.

**Weaknesses:**
- The proposal is essentially "change nothing." While the plan is indeed well-designed, Agent 2 missed the opportunity to evaluate whether any type-level tightening would be beneficial. Agent 3's observations about `primitive.name` and `primitive_range.name` looseness are valid refinements that Agent 2 did not consider.
- No analysis of error location granularity. Dismissing `Condition.location` and `Transform` location without even mentioning them is an oversight — these affect T5 error message quality.

**Impact on my position:** Agent 2 reinforces that the plan's structure is correct. I agree. But "verbatim" is slightly too conservative.

---

### Agent 3 (Skeptic) — Score: 7/10

**Strengths:**
- Issue 1 (primitive.name too loose) and Issue 2 (primitive_range.name too loose) are the most substantive type-safety observations across all agents. Narrowing `primitive.name` to `'String' | 'Int' | 'Float' | 'Bool'` and `primitive_range.name` to `'Float'` are zero-cost improvements that prevent an entire class of parser bugs. These are genuine catches.
- Issue 6 (multiple else branches possible) correctly identifies a semantic gap, then correctly concludes it belongs to the analyzer. Good judgment on the boundary.
- The hello.gft walkthrough and complex-example walkthrough are valuable validation that the AST can represent all spec constructs.
- Issue 9 (anonymous structs) is a good "did we miss this?" check even though the answer is no.

**Weaknesses:**
- Issue 3 (model as string) — Agent 3 correctly self-resolves this as "keep string, analyzer validates." But the analysis is the same reasoning Agent 4 gives more concisely.
- Issue 7 (SourceLocation lacks end position) — correctly identifies this is T2-owned, but including it inflates the issue count without actionable consequence for T3.
- Several issues (5, 7, 8, 10) are observations rather than issues. The 7/10 convergence score underweights the actual agreement — the proposal only disagrees on two points (Issues 1 and 2), both of which are refinements rather than structural changes. A more calibrated score would be 8.5/10.

**Impact on my position:** Agent 3's Issues 1 and 2 are the strongest new observations I did not raise. I adopt them.

---

### Agent 4 (Compiler Domain Specialist) — Score: 4.5/5

**Strengths:**
- Grammar-to-AST faithfulness table is the most rigorous verification across all agents. Every grammar production mapped to its AST node with a yes/no assessment. This is the kind of systematic check that catches gaps.
- Section 6 (semantic invariants the AST should enforce) provides a clear, principled framework for what belongs in types vs. the analyzer. The table is reusable guidance for T4/T5 implementers.
- Observation about `done` exclusion from `flow` and the `else` semantics of `condition?: Condition` — both are documentation-level improvements that reduce future confusion.

**Weaknesses:**
- Like Agent 2, Agent 4 does not recommend any changes. The proposal says "no changes recommended" but does not engage with Agent 3's observation about type-level tightening of primitive names. Either this was not considered, or it was implicitly dismissed without justification.
- The "future note" on Condition becoming recursive in v2 is informative but low-signal for T3 scope.

**Impact on my position:** Agent 4's systematic grammar-to-AST mapping gives me higher confidence that no structural gaps exist. I agree with the documentation suggestions for `condition?` and `flow`.

---

## Points of Agreement (All 4 Agents)

1. **Plan structure is correct.** All agents agree the plan's AST types are well-designed and faithful to the v1 spec. No structural rework needed.
2. **All 9 TypeExpr variants needed.** Unanimous that all variants map to v1 spec scope and should stay.
3. **ProducesDecl separate from NodeDecl.** All agents agree the separation is correct (own location, own name).
4. **EdgeTarget as discriminated union.** All agents agree this is superior to the spec's `string | ConditionalTarget[]`.
5. **`flow: string[]` is correct YAGNI.** All agents accept this for v1 sequential-only.
6. **No test file for types-only module.** Compile check (`tsc --noEmit`) is sufficient.
7. **Mutable interfaces, no `readonly`.** Correct for v1 parser-builds-incrementally pattern.
8. **`kind` vs `type` discriminant split is intentional and acceptable.**
9. **`model` stays as `string`.** Analyzer validates, not the type system.

## Points of Disagreement

| Point | Agents For | Agents Against | My Position |
|---|---|---|---|
| Narrow `primitive.name` to literal union | A3 | A1 (silent), A2, A4 (silent) | **Adopt.** Zero cost, prevents parser bugs. |
| Narrow `primitive_range.name` to `'Float'` | A3 | A1 (silent), A2, A4 (silent) | **Adopt.** Zero cost, matches spec constraint. |
| Add `location` to `Condition` | A1 | A2 (silent), A3 (silent), A4 (silent) | **Recommend but defer.** Additive, non-blocking. |
| Add `location` to `Transform` variants | A1 | A2 (silent), A3 (silent), A4 (silent) | **Recommend but defer.** Same reasoning. |
| Add comment documenting `else` semantics on `condition?` | A4 | None | **Adopt.** Zero cost documentation improvement. |

---

## Revised Position

After cross-critique, I revise my approach:

### Adopted from Agent 3:
- **Narrow `primitive.name`** to `'String' | 'Int' | 'Float' | 'Bool'`. This is a zero-cost type-level constraint that prevents the parser from constructing bogus primitives. The parser already identifies these as specific token types, so the literal union maps cleanly.
- **Narrow `primitive_range.name`** to `'Float'`. The v1 spec only defines Float ranges. If Int ranges are added later, the type can be widened (additive change).

### Adopted from Agent 4:
- **Add JSDoc comment on `ConditionalBranch.condition`** documenting that `undefined` means the `else` branch.

### Maintained from my Step 1:
- **`Condition.location` and `Transform` location**: Still recommended but explicitly marked as deferrable. The plan works without them; error messages are slightly less precise.

### Dropped:
- Nothing dropped. My Step 1 had no incorrect positions; the changes are purely additive from other agents.

## Revised Convergence Score: 93/100

Up from 92. The primitive name narrowing from Agent 3 is a genuine improvement I missed. The plan's structure remains correct. The 7 points deducted are:
- -3: `Condition.location` and `Transform` location still recommended (quality-of-life)
- -2: Primitive name narrowing is a refinement I now advocate for
- -2: Minor documentation improvements (comments on `condition?`, `flow` semantics)

## Final Recommended Type Changes

```typescript
// CHANGE 1: Narrow primitive.name (from Agent 3)
| { kind: 'primitive'; name: 'String' | 'Int' | 'Float' | 'Bool' }

// CHANGE 2: Narrow primitive_range.name (from Agent 3)  
| { kind: 'primitive_range'; name: 'Float'; min: number; max: number }

// CHANGE 3: Narrow domain.name (from Agent 3, extended)
| { kind: 'domain'; name: 'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef' }

// CHANGE 4: Document else semantics (from Agent 4)
export interface ConditionalBranch {
  /** When undefined, this is the else branch */
  condition?: Condition;
  target: string;
}

// RECOMMENDED (deferrable): Add location to Condition and Transform
// See Step 1 analysis for rationale
```

Everything else from the plan remains unchanged.
