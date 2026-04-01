# Agent 1 — Architect: v2.0-R5 Integration Tests + Examples

## Proposed Test List

### New integration tests (in `tests/integration.test.ts`)

1. **compile with memory** — inline source with memory decl, verify success + memory in program
2. **run with memory (dry run)** — compile + execute with mock spawner, verify memory scaffold
3. **import + compile** — temp files on disk: `shared.gft` exports context+node, `main.gft` imports them
4. **import + memory combined** — temp files: imported context + local memory + node that reads both
5. **circular import error** — temp files: A imports B, B imports A; verify error message
6. **missing import file error** — inline source importing nonexistent file; verify clean error
7. **backward compat** — existing 10 tests remain unchanged (implicit, no new test needed)

### Example files

1. `examples/shared.gft` — reusable context + node (no graph, no memory — importable)
2. `examples/chatbot.gft` — imports shared, declares memory, full pipeline

## Example File Contents

### `examples/shared.gft`
```gft
context UserMessage(max_tokens: 300) {
  message: String
  role: String
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

memory ConversationHistory(max_tokens: 2000, storage: file) {
  turns: List<String>
  summary: String
}

node Responder(model: sonnet, budget: 2k/1k) {
  reads: [Classification, ConversationHistory]
  writes: [ConversationHistory]
  produces Response {
    reply: String
    sentiment: String
  }
}

edge Classifier -> Responder
  | select(intent, confidence)

graph Chatbot(input: UserMessage, output: Response, budget: 5k) {
  Classifier -> Responder -> done
}
```

## Test Organization

Group new tests in a nested `describe('v2.0 features')` block within the existing `describe('end-to-end compilation')` suite. Import tests use `beforeAll`/`afterAll` with `fs.mkdtempSync` for temp directory management.

## Trade-off Analysis
- Temp file approach is unavoidable for imports (resolver reads from disk)
- Keeping examples minimal reduces maintenance burden
- Nested describe keeps backward compat obvious

## Potential Issues
- Windows path separators in temp dirs — use `path.join` throughout
- Cleanup of temp files if test crashes — `afterAll` with try-catch

## Convergence Score: 8/10
Straightforward verification task. Main design question is temp file management.
