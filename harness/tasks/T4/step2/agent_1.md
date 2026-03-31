# A1-Architect: T4 Step 2 Cross-Critique

## Agreement Summary

All four agents agree on the fundamental approach: recursive descent, one method per grammar production, LL(1) with LL(2) only for inline structs, throw-on-first-error. No structural changes needed. The disagreements are on specific bugs, their severities, and what to fix in v1.

---

## Critique of Each Agent

### A1 (Self) -- Step 1 Revisited

My Step 1 identified three issues: (1) `parseProduces()` location capture, (2) k-suffix parseInt fragility, (3) missing failure strategy tests. All three still stand. However, I missed the keyword-identifier collision bug that A3 found. This is the most important finding across all four reviews.

**Revision:** I upgrade my assessment. Bug #8 from A3 is real and must be addressed in the plan.

### A2-Pragmatist

A2's review is accurate but conservative. Key observations:

- **Dead `source` parameter**: A2 says remove it. I agree this is dead code in the parser itself, but the research docs (research_arch.md line 29) say "source kept for error context." If future error formatting needs source slicing (e.g., showing the offending line), having it on the parser is convenient. However, `GraftError` already carries `SourceLocation` with line/column, and `formatError()` in diagnostics.ts takes source separately. **Verdict: A2 is right. Remove it. If needed later, the caller has the source string.**

- **Test coverage assessment**: A2 correctly identifies the same gaps I did (skip/abort/fallback tests) and confirms no redundancy. Aligned.

- **"No structural changes needed"**: Correct for everything except the keyword-identifier collision. A2 missed Bug #8 entirely. The claim at A2 line 103-104 that the plan "correctly handles the full hello.gft grammar" is true but insufficient -- hello.gft happens to avoid keyword-named fields/tools.

### A3-Skeptic

A3's review is the most valuable. Assessment of each bug:

**Bug #1 (parseProduces location): CONFIRMED.** All agents agree. Fix as described: have `parseProduces()` consume the `produces` keyword itself rather than pre-advancing in `parseNode()`.

**Bug #2 (parseFields infinite loop): A3 self-corrected.** Not a real bug. EOF causes `expectIdentifier()` to throw. Correct.

**Bug #3 (Identifier in parseType): A3 self-corrected.** Not a bug -- the AST has no named-type reference. User-defined types are referenced only via context names in `reads`, not as field types. Correct for v1.

**Bug #4 (truncate k-suffix): A3 self-corrected.** Not a bug. `truncate(1k)` producing 1000 is correct behavior.

**Bug #5 (condition k-suffix): A3 self-corrected.** Not a bug. `count >= 2k` is a valid use case.

**Bug #6 (single-node graph): A3 self-corrected.** Not a bug. All paths terminate correctly.

**Bug #7 (inline structs at all positions): A3 self-corrected.** Not a bug in the parser; semantic concern for T5.

**Bug #8 (keyword-identifier collision): CONFIRMED. This is the critical finding.**

The KEYWORDS map in `tokens.ts` (lines 88-129) converts 32 lowercase/mixed-case strings to keyword tokens. Any of these appearing where `expectIdentifier()` is called will crash the parser. Concrete crash scenarios:

1. `tools: [compact]` -- "compact" lexes as `TokenType.Compact`, not `Identifier`. `expectIdentifier()` throws.
2. Field named `input: String` in a produces block -- "input" lexes as `TokenType.Input`. Crash.
3. Field named `skip: Bool` -- "skip" lexes as `TokenType.Skip`. Crash.
4. `enum(true, false)` -- "true" and "false" are keywords. Crash.
5. `reads: [input]` -- lowercase context name matching a keyword. Crash. (PascalCase names like `Input` are safe since the KEYWORDS map has lowercase `input`.)

Affected call sites for `expectIdentifier()`:
- `parseNode()` for node name (safe -- PascalCase convention)
- `parseContext()` for context name (safe -- PascalCase convention)
- `parseGraph()` for graph name (safe -- PascalCase convention)
- `parseFields()` for field names (VULNERABLE -- field names are lowercase by convention: `question`, `findings`, etc.)
- `parseIdentifierList()` for tool names (VULNERABLE -- tools could be named anything)
- `parseContextRefList()` for context refs (MOSTLY SAFE -- PascalCase convention, but not enforced)
- `parseGraph()` for flow node names (safe -- PascalCase convention)
- `parseEdge()` for source/target names (safe -- PascalCase convention)
- Enum values in `parseType()` (VULNERABLE -- enum values are lowercase)
- `parseTransform()` for select/drop field names (VULNERABLE -- field names are lowercase)
- `parseCondition()` for field name (VULNERABLE)

**Severity: HIGH. This is not a theoretical concern.** A field named `input`, `output`, `model`, `budget`, `filter`, `select`, `drop`, `skip`, or `compact` is entirely plausible in real Graft programs.

**Bug #9 (missing tests): CONFIRMED.** All agents agree. Minor.

**Bug #10 (types in produces): Valid observation.** The code path is the same as context fields, so the risk is low, but a test is cheap.

**Bug #12 (graph done not required): CONFIRMED as a real gap.** The spec examples always use `done`. If `done` is mandatory per the grammar, the parser should enforce it. If optional, the analyzer should validate. I lean toward enforcing in the parser since `done` is syntactically meaningful as the flow terminator. Without it, `graph G(...) { A -> B }` silently succeeds, which is likely a user error (forgot `-> done`).

### A4-Specialist

A4's convergence score (4/5) is the highest and arguably too generous given Bug #8. Specific critiques:

- **Section 3a (parseFields error message)**: Valid but low priority. Better error messages are polish, not correctness.

- **Section 3c (fixed parameter order)**: Good observation. Graph/node parameter order is fixed (`input`, `output`, `budget` / `model`, `budget`). This is fine for v1 -- the spec shows a fixed order and the error messages are clear.

- **Section 4 (Map value inline struct)**: Valid. `Map<String, Issue { ... }>` would fail because Map value calls `parseType()` not `parseTypeOrInlineStruct()`. Acceptable v1 limitation since the spec never shows this pattern.

- **Section 8 (identifier vs keyword collision -- "No risk of conflict")**: A4 explicitly says at line 130-131: "Identifier vs keyword collision: The lexer's identifier-then-lookup strategy means sonnet, haiku, opus are Identifier tokens (not keywords). expectIdentifier() correctly accepts only TokenType.Identifier. No collision." This is WRONG for the general case. A4 only checked model names (sonnet, haiku, opus) and missed that field names, tool names, and enum values CAN collide with keywords. A4's analysis is correct for the narrow case of model names but fails to consider the broader attack surface.

---

## Revised Plan: Addressing Bug #8

### The Fix: Contextual Keywords via `expectIdentifierOrKeyword()`

Add a new helper method that accepts BOTH `TokenType.Identifier` AND any keyword token, returning `token.value` as a string:

```typescript
private expectIdentifierOrKeyword(): string {
  const token = this.current();
  if (token.type === TokenType.Identifier) {
    this.advance();
    return token.value;
  }
  // Accept any keyword token as an identifier in context-sensitive positions
  if (token.type !== TokenType.EOF &&
      token.type !== TokenType.IntegerLiteral &&
      token.type !== TokenType.KIntegerLiteral &&
      token.type !== TokenType.FloatLiteral &&
      token.type !== TokenType.StringLiteral &&
      token.type !== TokenType.LBrace && token.type !== TokenType.RBrace &&
      token.type !== TokenType.LParen && token.type !== TokenType.RParen &&
      token.type !== TokenType.LBracket && token.type !== TokenType.RBracket &&
      token.type !== TokenType.Colon && token.type !== TokenType.Comma &&
      token.type !== TokenType.Dot && token.type !== TokenType.Arrow &&
      token.type !== TokenType.Pipe && token.type !== TokenType.Slash &&
      token.type !== TokenType.DotDot &&
      token.type !== TokenType.GreaterEqual && token.type !== TokenType.Greater &&
      token.type !== TokenType.LessEqual && token.type !== TokenType.Less &&
      token.type !== TokenType.EqualEqual && token.type !== TokenType.BangEqual) {
    this.advance();
    return token.value;
  }
  throw this.error(`Expected identifier, got '${token.value}' (${token.type})`);
}
```

Actually, that negative check is ugly and fragile. Better approach -- use a positive set. The KEYWORDS map values are all keyword TokenTypes. We can check if the token type is a keyword:

```typescript
private isKeywordToken(type: TokenType): boolean {
  return Object.values(KEYWORDS).includes(type);
}

private expectIdentifierOrKeyword(): string {
  const token = this.current();
  if (token.type === TokenType.Identifier || this.isKeywordToken(token.type)) {
    this.advance();
    return token.value;
  }
  throw this.error(`Expected identifier, got '${token.value}' (${token.type})`);
}
```

Or even simpler -- build a `Set<TokenType>` once from `KEYWORDS` values at module level:

```typescript
const KEYWORD_TYPES = new Set(Object.values(KEYWORDS));
```

Then `KEYWORD_TYPES.has(token.type)` is O(1).

### Where to Use It

Replace `expectIdentifier()` with `expectIdentifierOrKeyword()` at these call sites:
- `parseFields()` -- field name
- `parseIdentifierList()` -- tool names
- `parseType()` enum values -- enum value names
- `parseTransform()` select/drop -- field name argument
- `parseCondition()` -- field name

Keep `expectIdentifier()` (strict) at these call sites:
- Declaration names (`parseContext`, `parseNode`, `parseEdge`, `parseGraph`) -- PascalCase by convention, should not be keywords
- `parseProduces()` -- produces context name, PascalCase
- `parseContextRefList()` -- context names, PascalCase
- `parseGraph()` flow nodes -- node names, PascalCase
- `parseEdge()` source/target -- node names, PascalCase
- `parseConditionalTarget()` target -- node name, PascalCase

This distinction is clean: declaration-level names (types, nodes, contexts) use strict `expectIdentifier()` (PascalCase by convention). Value-level names (fields, tools, enum values) use permissive `expectIdentifierOrKeyword()`.

### Test Cases to Add for Bug #8

```typescript
it('should parse field named "input"', () => {
  const prog = parse(`context Foo(max_tokens: 500) { input: String }`);
  expect(prog.contexts[0].fields[0].name).toBe('input');
});

it('should parse enum with keyword values', () => {
  const prog = parse(`context Foo(max_tokens: 500) { mode: enum(skip, abort, compact) }`);
  const enumType = prog.contexts[0].fields[0].type;
  expect(enumType).toEqual({ kind: 'enum', values: ['skip', 'abort', 'compact'] });
});

it('should parse tool named "filter"', () => {
  // Inside a node with tools list
  // tools: [filter, compact] should work even though filter/compact are keywords
});
```

---

## Revised Plan: Addressing Bug #12 (done terminator)

After the flow loop in `parseGraph()`, check whether `done` was seen. Add a boolean flag:

```typescript
let sawDone = false;
while (this.check(TokenType.Arrow)) {
  this.advance();
  if (this.check(TokenType.Done)) {
    this.advance();
    sawDone = true;
    break;
  }
  flow.push(this.expectIdentifier());
}
if (!sawDone) {
  throw this.error("Expected '-> done' to terminate graph flow");
}
```

This is 3 lines of code and prevents silent acceptance of unterminated flows.

---

## Revised Plan: Other Fixes (Carried Forward)

1. **parseProduces() location**: Have `parseProduces()` consume the `produces` keyword itself. All agents agree.

2. **Remove `source` from constructor**: Dead parameter. A2 is right.

3. **parseInt k-suffix comment**: Add a comment noting `parseInt("5k", 10)` returns `5` per JS spec. Low cost, prevents confusion.

4. **Additional tests**: skip, abort, standalone fallback, nested generics, mixed context refs.

---

## Final Convergence Assessment

| Issue | A1 | A2 | A3 | A4 | Consensus | Action |
|-------|----|----|----|----|-----------|--------|
| parseProduces() location | Found | Missed | Found | Missed | 2/4 found, all would agree | FIX |
| Keyword-identifier collision | Missed | Missed | Found | Missed (wrongly declared safe) | 1/4 found, critical | FIX -- add `expectIdentifierOrKeyword()` |
| Dead `source` param | Noted | Found | N/A | N/A | 2/4 found | FIX -- remove |
| Graph `done` not enforced | Missed | Missed | Found | Missed | 1/4 found | FIX -- enforce |
| Missing failure strategy tests | Found | Found | Found | N/A | 3/4 found | FIX -- add tests |
| parseInt k-suffix | Found | N/A | N/A | N/A | 1/4 found | ADD COMMENT |
| Map inline struct value | N/A | N/A | N/A | Found | 1/4, spec never shows it | DEFER -- v1 limitation |
| Fixed param order | N/A | N/A | N/A | Found | 1/4, spec uses fixed order | DEFER -- v1 limitation |

The keyword-identifier collision is the only finding that changes the parser's API surface (adding a new helper method). Everything else is a localized fix within existing methods. The plan remains structurally sound.

**Revised convergence score: 4/5** (was 4/5 in Step 1 -- the score holds but the must-fix list grew by two items: Bug #8 and Bug #12).
