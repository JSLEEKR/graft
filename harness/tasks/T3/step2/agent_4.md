# A4-Specialist (Compiler Domain): Step 2 Cross-Critique

## Role: FORCED DISSENTER (convergence 9/10, tied with A2, highest slot)

---

## Critiques of Other Agents

### Critique of A1-Architect (92/100)

A1 provides a thorough, well-structured analysis and lands on the right conclusions for most points. Two concerns:

1. **The `location` recommendations are over-cautious.** A1 recommends adding `location` to `Condition` and `Transform` but hedges with "RECOMMEND, not REQUIRE" and "if rejected, functional." This is the correct instinct, but the hedging weakens the argument. If we believe better error messages matter (and they do -- compiler error quality is a primary UX surface), then these should be required additions, not optional suggestions. Half-measures on error reporting create technical debt that compounds during T5 development. I agree with the substance but think A1 should have committed harder.

2. **The "92/100" score obscures the lack of disagreement.** A1 deducted 8 points for two optional location additions and a "risk" of confusing error messages. These are not 8-point issues. A1's analysis is really 97-98/100 agreement dressed up as moderate convergence. This matters because Step 2 is about surfacing real disagreements, and an artificially depressed score can mask unanimous convergence.

**Overall:** Strong analysis. The final `ast.ts` listing is clean and correct.

### Critique of A2-Pragmatist (9/10)

A2 asks the right questions (can we trim TypeExpr variants? simplify Transform? inline ProducesDecl?) and arrives at the right answers (no, no, no). The analysis is practical and well-organized.

1. **The analysis is confirmation, not critique.** Every section follows the pattern: "Here is a question. The answer is: keep as-is." A2 examines 6 questions and recommends zero changes. This is a valid outcome, but at 9/10 convergence, the Pragmatist role should have worked harder to find something -- anything -- that could be simpler. The absence of any proposed change from the Pragmatist is suspicious. Even a well-designed system has a simplification opportunity somewhere.

2. **Missed the primitive/domain name looseness that A3 found.** A2 says "if forced to nitpick" and then nitpicks nothing. A3's observation that `primitive.name: string` should be `'String' | 'Int' | 'Float' | 'Bool'` is a legitimate zero-cost improvement that A2 should have caught. This is exactly the kind of pragmatic refinement a Pragmatist should surface.

3. **"Use the plan's types verbatim" is too strong a conclusion.** Even excellent plans benefit from refinement. The recommendation to use types verbatim signals premature closure rather than genuine analysis.

**Overall:** Solid reasoning but too deferential. The analysis validates more than it evaluates.

### Critique of A3-Skeptic (7/10)

A3 provides the most substantive critique of any agent, with 10 enumerated issues. The lower convergence score (7/10) reflects genuine engagement with potential problems.

1. **Issues 1 and 2 (primitive/domain name narrowing) are the strongest contribution.** Constraining `primitive.name` to `'String' | 'Int' | 'Float' | 'Bool'` and `primitive_range.name` to `'Float'` are zero-cost type-level improvements that prevent a real class of parser bugs. These should be adopted.

2. **Issue 7 (SourceLocation lacks end position) is correctly scoped out.** A3 identifies it, notes it belongs to T2, and moves on. Good discipline.

3. **Issue 9 (anonymous structs) is a non-issue that consumes space.** A3 raises the question of anonymous structs, investigates, concludes "not in v1 spec, no issue." This is thorough but the analysis could have been omitted entirely. The spec never mentions anonymous structs; there is no ambiguity to resolve.

4. **The hello.gft walkthrough is valuable.** Concrete validation that every construct in the example file maps to the proposed types. This is the kind of evidence-based verification that other agents skipped.

**Overall:** Best critical analysis of the four agents. The 7/10 score is honest and the two medium-severity issues are worth adopting.

---

## [If Forced Dissenter] Self-Rebuttal

In Step 1, I concluded with a 4.5/5 (9/10) convergence score and stated: "No changes recommended." I was too agreeable. Here is the case against my own position:

### Rebuttal Point 1: I failed to find anything wrong

My entire Step 1 analysis is a 9-section confirmation that everything is correct. I verified grammar-to-AST mapping (complete), EdgeTarget (agree), GraphDecl.flow (agree), Condition (agree), ContextRef (agree), semantic invariants (agree), location placement (agree), model as string (agree), budget as number (agree). Ten agreements, zero disagreements.

This is a failure of the Skeptic function that a domain specialist should perform. A compiler domain specialist should have caught at minimum:

- **A3's Issue 1 (primitive name looseness):** As a compiler specialist, I should know that AST node constructors benefit from narrow types. In mature compilers (Roslyn, rustc, swc), AST node types for literals carry the specific literal kind, not a generic string. I should have flagged `primitive.name: string` as overly permissive.

- **A3's Issue 2 (primitive_range only valid for Float):** The grammar only defines range syntax for `Float(min..max)`. I noted the grammar mapping was "faithful" without checking whether the AST permits unfaithful construction. A type `{ kind: 'primitive_range'; name: string }` allows `{ kind: 'primitive_range', name: 'Bool', min: 0, max: 1 }` which has no grammar production. I should have caught this.

### Rebuttal Point 2: My "observation" about GraphDecl.flow comments was trivial

I deducted 0.5 points for the suggestion to add a comment explaining that `condition?: Condition` with `undefined` means the `else` branch. This is documentation, not design. A compiler domain specialist should contribute design-level insights, not documentation suggestions.

### Rebuttal Point 3: I did not consider extensibility tradeoffs critically

I noted that `string[]` -> discriminated union for GraphDecl.flow in v2 is "a clean, planned evolution -- not a refactor." But this is hand-waving. Changing `flow: string[]` to `flow: FlowStep[]` where `FlowStep` is a discriminated union is a breaking change to every consumer. Every `graph.flow.forEach(name => ...)` becomes `graph.flow.forEach(step => { switch(step.kind) { ... } })`. I called this "clean" without acknowledging the migration cost that A3 correctly flagged.

### Rebuttal Point 4: My analysis was redundant with A1

Compare my sections 2, 3, 4, 5, 6 with A1's sections 1.1 and 3. We cover the same ground with the same conclusions. If my analysis adds nothing that A1 did not already say, my contribution as a "specialist" is minimal. A specialist should bring domain-specific insights that generalists miss -- I did not do that.

---

## Revised Position

After cross-critique and self-rebuttal, I revise my position:

### Changes I now support:

1. **Adopt A3's Issue 1: Narrow `primitive.name` to a string literal union.**
   ```typescript
   | { kind: 'primitive'; name: 'String' | 'Int' | 'Float' | 'Bool' }
   ```
   Zero cost. Prevents invalid AST construction. The parser already knows which primitive it parsed.

2. **Adopt A3's Issue 2: Narrow `primitive_range.name` to `'Float'`.**
   ```typescript
   | { kind: 'primitive_range'; name: 'Float'; min: number; max: number }
   ```
   The grammar only supports `Float(min..max)`. The type should reflect this.

3. **Adopt A3's corollary: Narrow `domain.name` to the known domain types.**
   ```typescript
   | { kind: 'domain'; name: 'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef' }
   ```
   Same reasoning as primitive. The spec defines a closed set of domain types for v1.

4. **Adopt A1's location additions as REQUIRED, not optional.**
   Add `location: SourceLocation` to `Condition` and all `Transform` variants. Error reporting quality in a compiler is not optional; it is a core feature. The parser has position information available when constructing these nodes. The cost is one field assignment per node.

### Changes I still reject:

- **`model` as literal union:** Keep as `string`. Model names are a configuration concern, not a grammar concern. The analyzer validates them.
- **`FlowStep[]` instead of `string[]`:** Keep YAGNI. The migration cost for v2 is real but bounded and predictable.
- **`readonly` fields, visitor patterns, base ASTNode:** Still premature for v1.

### Revised Convergence Score: 8/10

Down from 9/10. The two-point reduction reflects:
- -1 for primitive/domain name looseness (genuine type safety gap I missed)
- -1 for location on Condition/Transform (genuine error quality gap I dismissed as "non-blocking")

These are not structural problems, but they are real improvements I should have identified in Step 1.
