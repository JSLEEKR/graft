# Agent 4 — Specialist: v2.0-R5 Integration Tests + Examples

## Correct .gft Syntax Analysis

Per the parser (v2.0-R1 ratchets), the syntax for new features:

```
import { Name1, Name2 } from "path.gft"    // quotes required, .gft required
memory MemName(max_tokens: N, storage: file) { fields }  // storage optional, defaults to file
node X(...) { reads: [...] writes: [MemName] produces ... }  // writes is string[]
```

Key syntax rules for examples:
- Import must come before any other declarations (v2.0-R03: flag-based ordering)
- Memory fields use same Field syntax as context
- `writes: [MemName]` references memory by name (string, not context ref)
- No trailing commas in import name lists (v2.0-R06)
- Only contexts and nodes are importable (v2.0-R13)

## Example File Contents

### `examples/shared.gft`
No imports, no memory, no graph — pure reusable definitions.

```gft
// Reusable context and classifier node for import

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
Imports shared, adds memory, builds pipeline.

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

## Proposed Test List

1. **compile examples/chatbot.gft from disk** — read both files, compile chatbot.gft, verify success
2. **compile with inline memory** — memory + node with writes, verify program.memories populated
3. **import integration (temp files)** — shared exports context+node, main imports and uses them
4. **import + memory combined (temp files)** — full feature integration
5. **circular import detection** — A.gft imports B.gft imports A.gft
6. **missing import file** — import references nonexistent path
7. **dry run with memory** — compile + executor dry run, verify completion

## Verification: Examples Compile

The examples should be verified as part of integration tests — compile `examples/chatbot.gft` by reading from disk (like existing parallel_flow.gft test). This also serves as a regression test for the examples themselves.

## Trade-off Analysis
- Examples demonstrate the "happy path" of v2.0 features together
- `shared.gft` has no graph intentionally — it's a library file
- `chatbot.gft` exercises import + memory + writes + edge in one file
- Testing examples from disk (like parallel_flow test) catches syntax drift

## Potential Issues
- `examples/chatbot.gft` uses relative import `"./shared.gft"` — test must pass absolute path to compile
- Comment syntax: `//` is supported by lexer (verified in existing hello.gft)
- Classification is produced by Classifier (imported) — scope checker must see it after resolution

## Convergence Score: 8/10
Syntax is well-defined by prior ratchets. Main question is test count/scope.
