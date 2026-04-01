# Convergence Report — v2.0-R5: Integration Tests + Examples

## Summary

4:0 consensus on structure. Minor test count disagreement (6 vs 8) resolved in favor of 8 tests — A3's edge case tests add value at near-zero cost.

## Forced Dissent Ruling
- A2 (forced dissenter, score 9) would self-rebuttal: 2 extra inline tests are trivially cheap and catch real integration-level gaps. ACCEPTED.

## Implementation

### 1. examples/shared.gft

```graft
// Shared contexts for import

context UserMessage(max_tokens: 500) {
  content: String
  user_id: String
}

context SystemConfig(max_tokens: 200) {
  persona: String
  temperature: Float(0..1)
}
```

No graph declaration (this is a library file, not an entry point).

### 2. examples/chatbot.gft

```graft
import { UserMessage, SystemConfig } from "./shared.gft"

memory ConversationLog(max_tokens: 2k, storage: file) {
  turns: List<Turn {
    role: String
    content: String
  }>
  summary: Optional<String>
}

node Responder(model: sonnet, budget: 4k/2k) {
  reads: [UserMessage, SystemConfig, ConversationLog]
  writes: [ConversationLog]

  produces Response {
    reply: String
    updated_turns: List<Turn {
      role: String
      content: String
    }>
    summary: Optional<String>
  }
}

edge Responder -> done

graph Chat(input: UserMessage, output: Response, budget: 8k) {
  Responder -> done
}
```

### 3. Integration Tests (tests/integration.test.ts)

Add a new `describe('v2.0 features')` block with:

1. **Compile with memory** — inline source with memory + writes, verify success, memory scaffold in output files
2. **Memory agent shows .graft/memory/ path** — verify agent markdown contains memory-specific instructions
3. **Orchestration includes Persistent Memory section** — verify CLAUDE.md contains memory info
4. **Compile with imports (temp files)** — write shared.gft + main.gft to tmpDir, compile main.gft, verify imported context is in program
5. **Import + memory combined (temp files)** — write shared.gft + chatbot.gft to tmpDir, compile, verify both imports and memory work
6. **Circular import error** — write two files that import each other, verify error message
7. **Missing import file error** — import from nonexistent file, verify error
8. **Compile examples/chatbot.gft from disk** — like existing parallel_flow.gft test, compile real example file

### Test Helpers

```typescript
describe('v2.0 features', () => {
  let tmpDir: string;
  
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-integration-'));
  });
  
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  
  function writeFile(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return filePath;
  }
});
```

### Run with Memory (dry run)

```typescript
it('dry run with memory node', async () => {
  // Use Executor directly with dry run + memory
  const source = `...memory + writes source...`;
  const compiled = compile(source, 'test.gft');
  expect(compiled.success).toBe(true);
  
  const { Executor } = await import('../src/runtime/executor.js');
  const executor = new Executor(compiled.program!, {
    sourceFile: 'test.gft',
    input: { content: 'hello', user_id: 'u1' },
    workDir: tmpDir,
    dryRun: true,
  });
  
  const result = await executor.execute();
  expect(result.success).toBe(true);
  // Memory dir should exist but no memory files written (dry run)
});
```

## Ratchet-Locked Items

- [v2.0-R32] examples/shared.gft is a library (no graph) — LOCKED
- [v2.0-R33] examples/chatbot.gft uses import + memory + writes — LOCKED
- [v2.0-R34] Integration tests use temp files for import tests — LOCKED
