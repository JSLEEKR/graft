# A3-Skeptic: Step 2 Cross-Critique

## Critiques of Each Agent

### Agent 1 (Architect) — Score: 92/100

**What A1 gets right:**
- Thorough downstream compatibility analysis (T4/T5/T6) is valuable and well-reasoned.
- Correct identification that `Condition.location` and `Transform` location are quality-of-life improvements, not blockers.
- Good judgment on hierarchy depth assessment -- the AST is neither too flat nor too deep.
- Correct that `type` vs `kind` discriminant split is defensible at this scale.

**Where I disagree:**
- A1 labels `Condition.location` and `Transform` location as "RECOMMEND, not REQUIRE" and then only deducts 8 points total for these. I think the distinction is more consequential than A1 suggests. Without location on Condition, the analyzer (T5) reporting "invalid field in condition" can only point at the entire edge declaration. For a conditional edge with 3+ branches, each with its own condition, this produces genuinely confusing error output. However, I acknowledge A1's framing is correct that these are additive and non-breaking, so deferring them is not a structural mistake.
- A1's convergence score of 92/100 is too high given that A1 is recommending two concrete changes. If the changes are worth recommending, the delta should be larger. But this is a scoring quibble, not a substance disagreement.

**Net assessment:** A1's analysis is solid and thorough. The proposed final `ast.ts` is identical to the plan (A1's recommendations are explicitly marked as optional). No structural concerns.

### Agent 2 (Pragmatist) — Score: 9/10

**What A2 gets right:**
- Correct that all 9 TypeExpr variants belong in v1 -- they are all in the spec, not speculative.
- Good analysis of why ProducesDecl must remain a separate interface (own location, own name, analyzer references it independently).
- Correct that no test file is needed for a types-only module.
- Clean walkthrough of each YAGNI challenge with correct conclusions.

**Where I disagree:**
- A2 says "nothing structural" would change and proposes using "the plan's types verbatim." This is too uncritical. A2 does not engage with my Issue 1 (primitive name looseness) or Issue 2 (primitive_range name looseness) at all. These are zero-cost type-level constraints that prevent a class of parser bugs. A2's analysis would be stronger if it addressed why `name: string` is acceptable on primitive/domain variants rather than simply not mentioning it.
- A2's convergence score of 9/10 with zero proposed changes effectively means "ship as-is." While I mostly agree the types are correct, the role of a pragmatist should include identifying low-cost improvements, and narrowing `primitive.name` to `'String' | 'Int' | 'Float' | 'Bool'` is exactly such an improvement.

**Net assessment:** A2's analysis is correct but too accepting. The conclusion is not wrong -- the plan types work -- but the analysis misses opportunities for zero-cost hardening.

### Agent 4 (Compiler Domain Specialist) — Score: 4.5/5

**What A4 gets right:**
- Grammar-to-AST faithfulness table is the most rigorous verification across all agents. Every grammar production mapped and checked.
- Correct analysis of why `Condition` as flat field/op/value is sufficient for v1 (the grammar literally cannot produce nested conditions).
- Good observation about `ContextRef.field` evolving to `path?: string[]` for v2 multi-level reads.
- Correct that semantic invariants (non-empty arrays, positive retry counts) belong in the analyzer, not the type system.

**Where I disagree:**
- A4 does not address my Issue 1 or Issue 2 either. The compiler domain specialist role is precisely where I would expect engagement with the question of whether AST types should narrow string fields to literal unions where the grammar has a closed set of valid values. Compiler ASTs commonly use enums or literal unions for keyword-derived values. The silence on this point is a gap.
- A4's comment suggestion (documenting that absent `condition` means `else` branch) is correct and valuable. But it is presented as the only actionable item, when the primitive/domain name narrowing is a more impactful improvement.

**Net assessment:** A4's analysis is rigorous on grammar faithfulness but does not engage with type-level constraint tightening. The documentation suggestion is good and should be adopted.

---

## Revised Position

After reading all four agents, I am adjusting my position on my original 10 issues:

### Issues I maintain:

**Issue 1 (primitive.name narrowing) -- MAINTAIN, but downgrade from MEDIUM to LOW-MEDIUM.**

No other agent addressed this. The argument for narrowing is: the v1 grammar has exactly 4 primitive type names. Using `'String' | 'Int' | 'Float' | 'Bool'` instead of `string` is a zero-cost compile-time constraint that prevents the parser from constructing `{ kind: 'primitive', name: 'Banana' }`. The argument against: if v2 adds new primitives, the literal union must be extended. But extending a literal union is a one-line change, and adding a new primitive to a language is a major decision that should require touching the AST definition.

I still recommend this change, but I acknowledge it is not blocking. The analyzer can catch invalid primitive names. The type-level constraint is defense-in-depth, not the only line of defense.

**Issue 2 (primitive_range.name narrowing) -- MAINTAIN, downgrade to LOW.**

Same logic as Issue 1 but narrower scope. Only `Float` supports ranges in v1. Constraining `primitive_range.name` to `'Float'` is a one-character change that documents a real invariant. But again, the analyzer catches `Int(0..100)` as invalid regardless.

### Issues I drop or confirm as non-issues:

- **Issue 3 (model as string):** All agents agree -- keep as string, analyzer validates. I concur.
- **Issue 4 (flow as string[]):** All agents agree -- correct YAGNI. I concur.
- **Issue 5 (Condition.value k-expansion):** I already flagged this as a parser responsibility, not a type issue. Confirmed.
- **Issue 6 (multiple else branches):** All agents agree -- analyzer responsibility. I concur.
- **Issues 7-10:** Observations, not issues. Confirmed as non-actionable for T3.

### New items from other agents that I endorse:

- **A1's recommendation for `Condition.location` and `Transform` location:** I support this as a recommended improvement. A1 is right that error quality improves meaningfully. But I also agree with A1 that deferring is acceptable.
- **A4's documentation suggestion for `ConditionalBranch.condition` else semantics:** Yes, a JSDoc comment on the `condition?` field clarifying that absence means "else branch" is worthwhile. Low cost, high clarity.

---

## Final Position

**Convergence Score: 8/10**

The plan's types are structurally correct and cover all v1 grammar constructs. My original score of 7/10 was slightly too harsh -- the other agents convinced me that Issues 1 and 2, while valid, are refinements rather than gaps that meaningfully affect downstream tasks.

**What I would ship:** The plan's types as-is, with two optional improvements if the group agrees:

1. Narrow `primitive.name` to `'String' | 'Int' | 'Float' | 'Bool'` and `domain.name` to `'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef'` (zero-cost type safety).
2. Add a JSDoc comment on `ConditionalBranch.condition?` noting that `undefined` represents the else branch.

**What I would not block on:** Condition/Transform location fields (A1's recommendation). These are good but genuinely deferrable.

**What I oppose:** No changes proposed by any agent that I oppose. The group is well-aligned on the fundamental design.
