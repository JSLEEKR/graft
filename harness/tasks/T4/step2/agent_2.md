# A2-Pragmatist: T4 Step 2 Cross-Critique

## Revised Convergence Score: 4/5

After reading all four Step 1 evaluations, my assessment remains largely unchanged. The parser plan is solid. The agents surfaced overlapping issues with different severity assessments, so I will reconcile those here.

---

## Critique of Each Agent

### A1-Architect (Step 1 Score: 4/5)

**Assessment: Agree almost entirely.** A1's analysis is thorough and well-reasoned. Three points of note:

1. **parseProduces() location bug** -- A1, A3, and I all flagged this independently. Three-way convergence confirms it is real. A1's proposed fix (have parseProduces consume the keyword itself) is the cleanest approach. Agree.

2. **parseInt("5k", 10) fragility** -- A1 suggests a comment. I originally did not flag this because it works. A comment is cheap insurance. Agree, low priority.

3. **Test gaps for skip/abort/fallback** -- A1 and I both flagged this. Adding them is trivial. Agree.

4. **LAngle/RAngle naming** -- A1 correctly filed this under "Won't Fix." Agreed; cosmetic.

No disagreements with A1.

### A3-Skeptic (Step 1 Score: 4/10)

**Assessment: Score is too low. Most "bugs" were self-refuted during analysis.**

A3 filed 12 bugs. By A3's own analysis, bugs 2, 3, 4, 5, 6, 7, 11 were revised to "NOT A BUG" or "LOW" during the writing process. That leaves bugs 1, 8, 9, 10, 12 as genuine findings. Of these:

- **Bug 1 (parseProduces location):** Real. All agents agree. MEDIUM severity is correct.
- **Bug 9 (missing failure strategy tests):** Real gap. All agents agree. MEDIUM.
- **Bug 10 (missing produces type tests):** Valid observation but same code path. LOW.
- **Bug 12 (done not required):** Worth discussing. See below.
- **Bug 8 (keyword-identifier collision):** The critical one. See dedicated analysis below.

**On Bug 12 (done terminator):** A3 raises a valid point. If a user writes `{ A -> B }` without `done`, the parser accepts it silently. However, looking at examples/hello.gft, the grammar always uses `done`. I lean toward the parser requiring `done` -- it is a single check (`if (!sawDone) throw`) and prevents a confusing silent acceptance. But this could also be an analyzer concern. LOW-MEDIUM is the right severity. Recommend: require it in the parser; it is one line of code.

### A4-Specialist (Step 1 Score: 4/5)

**Assessment: Solid domain expertise. Well-calibrated severity.**

A4 raised four LOW-severity findings, all correctly categorized:
1. Map value position does not support inline structs -- true, acceptable v1 limitation.
2. parseFields error message lacks context -- polish, not correctness.
3. Conditional edges cannot have transforms -- spec does not show this pattern.
4. Fixed parameter order -- deliberate v1 simplification.

A4 explicitly states "No architectural changes needed." I agree.

**Notable:** A4 did NOT flag the keyword-identifier collision (Bug 8). A4's section 8 ("Issues Not Found") says: "Identifier vs keyword collision: The lexer's identifier-then-lookup strategy means sonnet, haiku, opus are Identifier tokens. expectIdentifier() correctly accepts only TokenType.Identifier. No collision." This is correct for model names but misses the field-name case that A3 raised.

---

## Dedicated Analysis: A3 Bug 8 (Keyword-Identifier Collision)

This is the most contentious finding. A3 rates it HIGH. A4 implicitly rates it non-existent. I need to determine: is this a real v1 problem or a theoretical one?

### What A3 claims

If a field name, tool name, or enum value happens to match a keyword in the KEYWORDS map, the lexer will emit a keyword token instead of Identifier, and `expectIdentifier()` will reject it. A3's concrete example: a field named `input` in a produces block.

### Checking the actual .gft files

I examined all three .gft files for field names that collide with the 33 keywords in the KEYWORDS map:

**examples/hello.gft** (v1 target):
- Field names: `question`, `findings`, `confidence`, `response` -- zero collisions.
- Tool names: none used.
- Enum values: none used.
- `input`/`output`/`budget` in `graph SimpleQA(input: ..., output: ..., budget: ...)` are parsed via `expect(TokenType.Input)` etc., not `expectIdentifier()`. No collision.

**hello.gft** (fuller example):
- Field names: `question`, `findings`, `confidence`, `response` -- zero collisions.
- `budget { input: 2000, output: 1000 }` -- here `input` and `output` appear as field-like names inside a budget block. But this uses a different syntax than the examples/hello.gft budget format. The v1 parser targets `examples/hello.gft` which uses `budget: 2k/1k` (parenthesized parameter style). The `budget { input: N, output: N }` form from `hello.gft` is a different syntax variant not targeted by the v1 parser.

**review.gft** (v2 target, not v1):
- Field names: `description`, `acceptance_criteria`, `steps`, `action`, `target`, `severity`, `file`, `passed`, `name`, `error`, `status`, `summary`, etc. -- zero collisions with keywords.
- Enum values: `create`, `modify`, `delete`, `test`, `low`, `medium`, `high`, `critical`, `safe`, `caution`, `danger`, `approved`, `needs_changes`, `rejected` -- zero collisions. None of these are in the KEYWORDS map.
- Tool names: `file_read`, `file_write`, `terminal` -- zero collisions.

### Verdict: THEORETICAL for v1, not practical

The keyword-identifier collision is a real language design tension, but it does not manifest in any v1 input. No field name, tool name, or enum value in the spec examples collides with a keyword. The collision would require a user to name a field `select`, `filter`, `drop`, `compact`, `truncate`, `input`, `output`, `model`, `budget`, `reads`, `produces`, `tools`, `skip`, `abort`, `retry`, `fallback`, `when`, `else`, or `done`. These are all domain-specific keywords that a user would be unlikely to choose as field names for their own data structures.

Furthermore, fixing this properly (contextual keywords) adds complexity to `expectIdentifier()` -- it would need to accept any keyword token and return its string value. This is not hard (~5 lines), but it changes the semantic contract of `expectIdentifier()` and could mask real errors (e.g., writing `context` when you meant a field name). The tradeoff is not clearly in favor of the fix for v1.

**Recommendation: Document as a v1 known limitation.** Add a one-line comment in `expectIdentifier()`: `// v1: field/tool names must not collide with language keywords. See v2 for contextual keyword support.` If a user actually hits this, the error message (`Expected identifier, got 'input' (Input)`) is clear enough to diagnose.

If the team disagrees and wants to fix it now, the implementation is: make `expectIdentifier()` accept any token and return `token.value`, but only when the calling context is field names, tool names, or enum values. The cleanest approach would be a separate `expectName()` helper that accepts Identifier OR any keyword token.

---

## Revised Plan (Changes from Step 1)

My Step 1 assessment was 4/5. After cross-critique, I maintain 4/5. The specific items to address before implementation:

### Must Fix (2 items)

1. **parseProduces() location capture** -- Have parseProduces() consume the `produces` keyword itself. All four agents agree this is a real bug. One-line structural fix.

2. **Add parseInt comment for k-suffix** -- Document the `parseInt("5k", 10) === 5` behavior. Prevents future confusion. One comment line.

### Should Fix (2 items)

3. **Add tests for skip, abort, standalone fallback** -- Three agents flagged this. Three simple test cases.

4. **Require `done` terminator in graph flow** -- After the arrow loop exits, check if `done` was reached. If not, throw. One conditional + throw. Prevents silent acceptance of unterminated flows.

### Accept as v1 Limitation (2 items)

5. **Keyword-identifier collision** -- Document, do not fix. No v1 input triggers it. Fix in v2 if contextual keywords become necessary.

6. **Map value position does not support inline structs** -- Accept. Spec does not show this pattern.

### No Action Needed

7. **All other A3 "bugs"** (2, 3, 4, 5, 6, 7, 11) were self-refuted. No action.
8. **All A4 LOW findings** -- Polish-level, address opportunistically during implementation.
9. **A1's LAngle/RAngle naming** -- Cosmetic. Won't fix.

---

## Agreement Matrix

| Issue | A1 | A2 (me) | A3 | A4 |
|---|---|---|---|---|
| parseProduces location | MUST FIX | MUST FIX | MUST FIX | not flagged |
| parseInt k-suffix comment | SHOULD | MUST FIX | not flagged | not flagged |
| Missing failure strategy tests | SHOULD | SHOULD | MEDIUM | not flagged |
| Keyword-identifier collision | not flagged | DEFER (v2) | HIGH / FIX NOW | not flagged |
| Require done terminator | not flagged | SHOULD FIX | LOW-MEDIUM | not flagged |
| Map inline struct in value | not flagged | ACCEPT | not flagged | LOW |
| Overall architecture | ACCEPT | ACCEPT | needs fixes | ACCEPT |

Three of four agents rate 4/5. A3 rates 4/10 but 7 of 12 bugs were self-refuted, which adjusts the effective severity significantly. The plan is ready for implementation with the two must-fix items applied.
