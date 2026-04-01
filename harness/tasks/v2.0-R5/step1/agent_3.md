# Agent 3 — Skeptic: v2.0-R5 Integration Tests + Examples

## Edge Cases That Must Be Tested

### Import path resolution gotchas
1. **Relative path from temp dir** — `compile(source, '/tmp/xxx/main.gft')` must resolve `./shared.gft` to `/tmp/xxx/shared.gft`. If sourceFile is wrong, resolver silently reads wrong path.
2. **Missing `.gft` extension in import path** — per v2.0-R17, import path must end with `.gft`. Test that `import { X } from "./shared"` produces a parser error, not a file-not-found.
3. **Circular import error message** — must include file paths so user can diagnose. Verify error message content, not just error existence.

### Memory integration gotchas
4. **Memory reads without writes** — a node can read memory without writing it. Must compile cleanly.
5. **Memory name collision with context** — per v2.0-R19, this should error. Integration test should verify the pipeline catches it.

### Combined import + memory
6. **Imported node cannot declare writes to local memory** — imported nodes have their writes baked in. If an imported node writes to a memory not declared in the importing file, scope checker should catch it.

## Proposed Test List

1. **compile with memory (inline)** — basic success path
2. **import from disk (temp files)** — shared context + node imported into main
3. **import + memory combined (temp files)** — imported context, local memory, local node reads both
4. **circular import error** — verify error message contains both file paths
5. **missing import file error** — verify error mentions the missing path
6. **missing .gft extension in import** — parser-level error (no file I/O)
7. **memory name collision with context** — inline, verify scope error
8. **run with memory dry run** — mock spawner, verify execution completes

## Example File Contents

### `examples/shared.gft`
```gft
context UserMessage(max_tokens: 300) {
  message: String
}

node Classifier(model: haiku, budget: 500/200) {
  reads: [UserMessage]
  produces Classification {
    intent: String
    confidence: Float(0..1)
  }
}
```

### `examples/chatbot.gft`
```gft
import { UserMessage, Classifier } from "./shared.gft"

memory ConversationLog(max_tokens: 2000, storage: file) {
  turns: List<String>
  summary: String
}

node Responder(model: sonnet, budget: 2k/1k) {
  reads: [Classification, ConversationLog]
  writes: [ConversationLog]
  produces Response {
    reply: String
  }
}

edge Classifier -> Responder
  | select(intent, confidence)

graph Chatbot(input: UserMessage, output: Response, budget: 5k) {
  Classifier -> Responder -> done
}
```

## Trade-off Analysis
- Tests 6 and 7 are cheap (inline source, no temp files) and catch real bugs
- Test 4's error message verification prevents silent regression
- Don't over-test: resolver and analyzer have their own unit tests

## Potential Issues
- Temp dir cleanup on Windows: `fs.rmSync` with `force: true` needed
- `path.resolve()` behaves differently on Windows vs Unix for temp paths — use `os.tmpdir()` + `path.join`
- If examples have syntax errors, they become a maintenance trap — keep them minimal

## Convergence Score: 7/10
Mostly straightforward, but the edge cases in tests 6-7 need debate.
