# A4-Specialist Cross-Critique (Forced Dissenter)

## Why I Am the Forced Dissenter

I gave a convergence score of 4/5 (8/10) in Step 1, tied for highest. I declared the plan "solid and production-ready" and said "no architectural changes needed." A3 found a critical bug I explicitly dismissed. I must now account for that failure and revise.

---

## Critique of A1-Architect (Step 1 Score: 4/5)

**Strengths:** Thorough API review, correct T3 ratchet compliance verification, good extensibility analysis. The `parseProduces()` location bug catch is valid and the fix suggestion (have `parseProduces()` consume its own keyword) is the cleanest approach.

**Weakness 1: Missed the keyword-identifier collision (Bug #8).** A1 explicitly reviewed `expectIdentifier()` and wrote: "Strictly accepts TokenType.Identifier only, which means String, Int, etc. (keywords) are rejected -- this is correct because node/context/graph names must be user identifiers, not type keywords." This analysis is incomplete. A1 only considered *type* keywords but failed to consider *transform* and *parameter* keywords. A field named `input`, `compact`, `skip`, `select`, `filter`, `drop`, `model`, or `budget` will crash the parser. These are common English words likely to appear as field names in user-defined structs.

**Weakness 2: Over-confidence in test coverage assessment.** A1 identified 8 missing tests but rated none of them as blocking. The missing failure strategy tests are not just "nice to have" -- they represent untested code paths in `parseFailureStrategy()` where `skip` and `abort` are each a single branch that returns immediately. Untested branches should lower confidence more than A1's score reflects.

**Weakness 3:** The `parseInt("5k", 10)` observation is correct but the recommendation to "add a comment" is too passive. A fragile implicit behavior should be made explicit in the code, not papered over with a comment. The lexer should strip the suffix or the parser should slice the string.

---

## Critique of A2-Pragmatist (Step 1 Score: 4/5)

**Strengths:** Good pragmatic lens -- correctly identified the `source` parameter as dead code (no other agent caught this). The hello.gft line-by-line walkthrough is valuable and thorough.

**Weakness 1: Missed the keyword-identifier collision entirely.** A2 checked edge cases against hello.gft but hello.gft uses names like `UserRequest`, `Researcher`, `Writer` (PascalCase, not keywords) and field names like `question`, `findings`, `answer` (not keywords). The test inputs similarly avoid keyword-colliding names. A2's methodology of checking against existing examples will always miss bugs that existing examples do not exercise. The correct methodology is to check against the *full keyword set* and ask "can any of these appear in identifier positions?"

**Weakness 2: "No structural changes needed" is premature.** The keyword collision bug may require a structural change to `expectIdentifier()` or the introduction of a `expectIdentifierOrKeyword()` helper. A2's blanket approval of the helper API did not consider this.

**Weakness 3:** A2 says "Two error tests is the minimum... per YAGNI, two is fine for v1." This is wrong. YAGNI applies to features, not to test coverage. Missing tests for existing code paths is technical debt, not YAGNI. The `skip`, `abort`, and standalone `fallback` strategies are implemented features that deserve tests.

---

## Critique of A3-Skeptic (Step 1 Score: 4/10)

**Strengths:** A3 found the most important bug in this review cycle. Bug #8 (keyword-identifier collision) is a real, high-severity issue that three other agents missed. The analysis is thorough: A3 traced the bug through the lexer's KEYWORDS map, through `expectIdentifier()`, and identified multiple affected call sites (`parseFields`, `parseIdentifierList`, `parseContextRefList`, enum values). The concrete failing case (`input: String` in a produces block) is immediately actionable.

A3 also showed good intellectual honesty by self-correcting multiple initial findings (Bugs 2, 3, 4, 5, 6, 7, 11 were all re-evaluated and downgraded). This is better than false-alarming.

**Weakness 1: Bug #12 (graph `done` requirement) analysis is incomplete.** A3 flags this as LOW-MEDIUM but does not check the spec or grammar definition. Looking at the grammar, `done` is the flow terminator and all spec examples use it. The question of whether it is mandatory is answerable from the grammar, not speculative. This should have been resolved, not left as "depends on spec intent."

**Weakness 2: Initial score of 4/10 may be too low.** While the keyword collision is a real high-severity bug, it is a localized fix (modify `expectIdentifier()` to accept keyword tokens and return their string value). The parser architecture, method decomposition, T3 compliance, and overall structure are all sound. A score of 4/10 implies "significant rework needed," but this is closer to 6/10: "sound design with one important bug to fix."

**Weakness 3:** A3 did not analyze the *scope* of the keyword collision. How many keywords in the KEYWORDS map are realistically problematic? Looking at the full list: `input`, `output`, `model`, `budget`, `select`, `filter`, `drop`, `compact`, `skip`, `abort` are all common English words. `reads`, `produces`, `tools`, `when`, `else`, `done`, `retry`, `fallback` are less likely as field names but not impossible. `truncate`, `on_failure`, `max_tokens`, `enum` are unlikely field names. The type keywords (`String`, `Int`, etc.) are PascalCase so they would only collide if a user used PascalCase field names, which is unlikely in a language that uses lowercase field names by convention. A severity analysis by keyword would strengthen the case.

---

## Self-Rebuttal (A4-Specialist, Step 1 Score: 4/5)

### What I Got Wrong

**I explicitly dismissed the keyword-identifier collision and declared it a non-issue.** In my Step 1, Section 8 ("Issues Not Found -- Confirming Correctness"), I wrote:

> "Identifier vs keyword collision: The lexer's identifier-then-lookup strategy means sonnet, haiku, opus are Identifier tokens (not keywords). expectIdentifier() correctly accepts only TokenType.Identifier. No collision."

This is a textbook confirmation bias error. I tested my hypothesis with names I *expected* to see (`sonnet`, `haiku`, `opus` -- model names) and concluded correctness. I did not test with names that could *plausibly collide* with the keyword set. A3 correctly identified that `input`, `compact`, `skip`, `select`, `filter`, `drop`, `model`, `budget` are all in the KEYWORDS map and would all fail in identifier positions.

**My analysis was surface-level where it needed to be systematic.** A proper LL(k) analysis for a language with contextual keywords requires checking *every* identifier-accepting production against *every* keyword token. I did not do this. I verified the happy path (model names, PascalCase context names) and assumed the unhappy path was covered.

**My convergence score of 4/5 was unjustified.** I cannot rate a plan 4/5 when it contains a bug that will cause parse failures on common field names like `input` and `output`. These are names that appear *in the spec's own parameter syntax* (`input:`, `output:` in graph declarations). While those specific uses are parsed by keyword-specific `expect()` calls (not `expectIdentifier()`), the fact that the same words cannot be used as field names in user structs is a significant usability problem.

**My "no architectural changes needed" conclusion was wrong.** The `expectIdentifier()` helper needs modification, which is a change to the parser's core API. This is not a polish issue; it is a correctness issue in the token-consumption layer.

### What I Got Right

- The LL(k) analysis for the grammar itself (excluding the keyword issue) is correct.
- The method decomposition review is accurate.
- The `parseType()` vs `parseTypeOrInlineStruct()` distinction analysis is correct and was more thorough than other agents'.
- The Map value position limitation (`Map<K, V>` does not support inline struct values) is a valid finding that no other agent identified.
- The conditional-edges-without-transforms observation is a valid v1 limitation.

### Why This Happened

As the compiler domain expert, I focused on structural parser concerns (LL(k) classification, grammar ambiguity, method decomposition) and overlooked a lexer-parser interface issue. The keyword collision is not a parser architecture problem -- it is a token classification problem at the lexer-parser boundary. My expertise bias led me to analyze the parser in isolation rather than analyzing the full lexer-to-parser pipeline.

---

## Revised Assessment

### Revised Convergence Score: 3/5 (6/10)

The parser architecture is sound, but Bug #8 (keyword-identifier collision) is a real correctness issue that must be fixed before implementation.

### Revised Recommendations

**Must Fix (blocking implementation):**

1. **Keyword-identifier collision (Bug #8).** Modify `expectIdentifier()` to accept keyword tokens as identifiers in positions where they are contextually valid. The cleanest approach: `expectIdentifier()` should accept *any* token that has a string value representable as an identifier, including keyword tokens. Implementation:

```typescript
private expectIdentifier(): string {
  const token = this.current();
  if (token.type === TokenType.Identifier) {
    this.advance();
    return token.value;
  }
  // Accept keyword tokens as contextual identifiers
  if (token.value && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token.value)) {
    this.advance();
    return token.value;
  }
  throw this.error(`Expected identifier, got '${token.value}' (${token.type})`);
}
```

However, this is too permissive -- it would allow `node` as a field name, which could create ambiguity at the top level. A better approach: create `expectName()` that accepts `Identifier` plus a whitelist of keywords that are safe in name positions (transform keywords, parameter keywords, failure strategy keywords), and keep `expectIdentifier()` strict for positions where keyword overlap must be rejected (e.g., declaration names at the top level).

Alternatively, the simplest correct fix: accept ALL tokens except structural tokens (braces, parens, brackets, colon, comma, dot, pipe, slash, arrow, EOF) as valid identifiers. This treats keywords as contextual -- they are keywords only when the parser expects them as keywords.

2. **`parseProduces()` location capture (Bug #1).** Have `parseProduces()` consume its own `produces` keyword, as A1 suggested.

**Should Fix:**

3. **Add tests for `skip`, `abort`, standalone `fallback`.** Three test cases, trivial cost.
4. **Decide and enforce whether `done` is mandatory in graph flow.** If mandatory (as all examples suggest), add a check after the flow loop.
5. **Remove dead `source` parameter** from the Parser constructor (A2's finding).
6. **Make `parseInt` on k-suffix explicit** rather than relying on JS's lenient parsing behavior.

**Deferred (v1 acceptable):**

7. Map value position inline struct support.
8. Contextual error messages in `parseFields()`.
9. Transforms on conditional edges.
