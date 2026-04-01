# Agent 2 — Pragmatist: v2.0-R5 Integration Tests + Examples

## Proposed Test List

Minimal set that covers real integration gaps (not re-testing unit-level behavior):

1. **compiles source with memory declaration** — inline, no files needed
2. **compiles source with import (temp files)** — shared.gft + main.gft on disk
3. **import + memory combined (temp files)** — full v2.0 feature set in one compile
4. **run with memory dry run** — mock spawner, verify memory appears in prompt context
5. **circular import produces error** — two temp files importing each other
6. **missing import file produces error** — reference nonexistent path

That's 6 new tests. No need for more — the 241 existing tests cover unit behavior.

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

memory ChatHistory(max_tokens: 1500, storage: file) {
  turns: List<String>
  topic: String
}

node Responder(model: sonnet, budget: 2k/1k) {
  reads: [Classification, ChatHistory]
  writes: [ChatHistory]
  produces Reply {
    text: String
  }
}

edge Classifier -> Responder
  | select(intent)

graph Chatbot(input: UserMessage, output: Reply, budget: 4k) {
  Classifier -> Responder -> done
}
```

## Temp File Strategy

```typescript
import * as os from 'node:os';

let tmpDir: string;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-test-'));
  // Write shared.gft and main.gft
});
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

One `beforeAll`/`afterAll` pair. Write all needed temp files there. Simple.

## Trade-off Analysis
- 6 tests is enough — we're testing integration, not re-testing analyzer/resolver
- Examples should be small enough to read in 10 seconds
- No need for a separate test file — extend existing integration.test.ts

## Potential Issues
- `resolve()` uses `path.resolve(sourceFile)` so temp file paths must be absolute
- Keep examples syntactically simple to avoid becoming a maintenance burden

## Convergence Score: 9/10
This is verification work. The design space is tiny.
