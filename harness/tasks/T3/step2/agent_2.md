# T3 Step 2: Cross-Critique — A2-Pragmatist

## Critiques of Each Agent's Step 1

### Agent 1 (A1-Architect)

**Convergence score: 92/100. Thorough and well-structured analysis.**

A1's proposal to add `location` to `Condition` and `Transform` variants (Changes 1-2) is the most substantive suggestion across all agents. My assessment:

- **Against adding `location` to `Transform`**: This is premature. The parser (T4) does not yet exist. We do not know how granular its position tracking will be for transform chains parsed from `| select(findings) | compact`. Adding location fields now means every T4 parser path must populate them, increasing T4's implementation surface before we know if the error messages actually need sub-edge granularity. If they do, adding location later is a non-breaking, additive change. YAGNI applies here.

- **Against adding `location` to `Condition`**: Same argument. Conditions appear in two contexts (filter transforms, conditional edges). The parent edge's location is sufficient for v1 error reporting. The analyzer (T5) can include the field name and operator in the error message text without needing a separate SourceLocation.

- **A1's downstream compatibility analysis (Section 3) is excellent.** Walking through T4/T5/T6 usage of each type is exactly the right validation approach. The analysis confirms the types serve all consumers. No disagreements.

- **A1's final recommended `ast.ts` (Section 6)**: Matches the plan verbatim (without the location additions A1 recommended). This is the right code to ship.

**Verdict: Agree on the types. Disagree on adding location to Condition/Transform for v1.**

---

### Agent 3 (A3-Skeptic)

**Convergence score: 7/10. Useful stress-testing but two recommendations overstep.**

**Issue 1 (narrow `primitive.name` to literal union) -- I disagree for v1:**

A3 proposes `name: 'String' | 'Int' | 'Float' | 'Bool'` instead of `name: string`. The reasoning (prevent bogus primitives) is sound in isolation, but pragmatically wrong for v1:

1. **The parser is the gatekeeper.** The parser will only construct a `primitive` TypeExpr when it encounters a known type keyword. An invalid identifier like `Banana` would fail at the parser level, never reaching the AST. The type-level constraint is redundant with parser logic.

2. **Forward compatibility cost.** If the language adds a new primitive (e.g., `Bytes` in v2), every switch on `name` must be updated, and the type definition must change. With `string`, only the parser and analyzer need updating. The AST file remains untouched.

3. **Domain types are even worse.** A3 proposes `'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef'` for domain names. Domain types are explicitly designed to be extensible (spec 3.7 says "future milestones may add more"). Locking them into a literal union contradicts the spec's intent.

**Issue 2 (narrow `primitive_range.name` to `'Float'`) -- I partially agree:**

The spec only shows `Float(min..max)`. Constraining to `'Float'` is defensible and zero-cost. However, the same forward-compatibility argument applies: if `Int` ranges are added later, we must change the type. Since the parser only constructs `primitive_range` for `Float` anyway, the constraint is redundant. **Keep as `string` for consistency with `primitive.name`.**

**Issue 6 (multiple else branches) -- correctly deferred to analyzer.** Agree.

**Issue 7 (SourceLocation lacks end position) -- correctly identified as T2-owned.** Agree.

**A3's hello.gft walkthrough (Section "Can the AST represent hello.gft?") is valuable.** Concrete verification that every construct is representable. Good engineering.

**Verdict: Disagree on Issues 1-2 (narrowing names). Agree on all other assessments.**

---

### Agent 4 (A4-Compiler Domain Specialist)

**Convergence score: 4.5/5. Most aligned with my position.**

A4's grammar-to-AST faithfulness table (Section 1) systematically validates every grammar production has an AST node. This is the right verification approach and confirms completeness.

A4's Section 6 (semantic invariants the AST should enforce) makes the critical distinction I agree with: the type system should encode structural constraints (like `op` being one of 6 operators), while semantic constraints (non-empty arrays, valid ranges, valid model names) belong in the analyzer. This is the correct boundary.

A4's observation about documenting `ConditionalBranch.condition?: Condition` meaning "else branch when absent" is a good, low-cost improvement. A JSDoc comment on that field would prevent confusion for T4/T5 implementers.

**One minor disagreement:** A4 says "when v2 adds foreach/parallel, string[] becomes a discriminated union" and calls this "a clean, planned evolution -- not a refactor." I would call it what it is: a breaking change for every consumer of `GraphDecl.flow`. It is still the right YAGNI call for v1, but we should not pretend the migration is free.

**Verdict: Strong agreement. A4 is the most pragmatic of the other agents.**

---

### My Own Step 1 (A2-Pragmatist)

**Self-assessment: My Step 1 was correct but too brief on cross-cutting concerns.**

I concluded "use the plan's types verbatim" which remains my position. However, I did not:
- Walk through downstream T4/T5/T6 compatibility (A1 did this well)
- Stress-test with concrete examples like hello.gft (A3 did this well)
- Systematically check grammar-to-AST coverage (A4 did this well)

My analysis of whether all 9 TypeExpr variants are needed was the right question to ask and the answer (yes, they are all v1 spec scope) was correct. My assessment of ProducesDecl as separate (not inlined) was also correct.

---

## Revised Position After Cross-Critique

### What changes from my Step 1: Nothing structural.

The cross-critique reinforces my original position. The plan's types are correct and complete. The main contested points are:

| Point | A1 | A2 (me) | A3 | A4 |
|---|---|---|---|---|
| Add location to Condition/Transform | Recommend | Reject (YAGNI) | Not raised | Not raised |
| Narrow primitive.name to literal union | Not raised | Reject (forward compat) | Recommend | Not raised (agrees string is fine for model) |
| Narrow domain.name to literal union | Not raised | Reject (spec says extensible) | Recommend | Not raised |
| Narrow primitive_range.name to 'Float' | Not raised | Reject (consistency) | Recommend | Not raised |
| Document else semantics on ConditionalBranch | Not raised | Adopt | Not raised | Recommend |

### What I adopt from other agents:

1. **From A4**: Add a JSDoc comment on `ConditionalBranch.condition` to clarify that `undefined` means the else branch. Zero cost, prevents confusion.

2. **From A1**: The downstream compatibility analysis approach. My revised proposal includes confidence that the types serve T4/T5/T6 because A1 verified this systematically.

3. **From A3**: The hello.gft walkthrough validates representability concretely. This should be noted in the implementation as a verification step.

### What I reject:

1. **Location on Condition/Transform (A1)**: YAGNI. The parser does not exist yet. Adding fields we might not need increases T4's implementation burden. Additive later if needed.

2. **Literal union narrowing for primitive/domain names (A3)**: The parser is the gatekeeper, not the type system. Forward compatibility is more valuable than redundant type-level constraints. The analyzer validates semantic correctness.

### Final recommendation:

Ship the plan's types verbatim, with one addition: a JSDoc comment on `ConditionalBranch.condition` documenting the else-branch semantics. No structural changes. No field additions. No type narrowing.

## Convergence Score: 9/10

Near-full agreement with the plan. The 1-point deduction reflects that the `ConditionalBranch` comment is worth adding (trivial but not in the original plan). All four agents agree the core structure is correct. The disagreements are about refinements that can be added later without breaking changes.
