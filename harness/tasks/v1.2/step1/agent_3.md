# A3-Skeptic Independent Analysis — v1.2

## Convergence Score: 6

## Top Issues by Severity (HIGH)

1. **Windows spawn ENOENT**: spawn('claude') fails without shell:true on Windows
2. **Claude CLI stdout not valid JSON**: May contain progress text before JSON payload
3. **Stale session data**: .graft/session/ may have files from previous run → silent data corruption
4. **stdin not closed**: Claude process hangs indefinitely if stdin.end() not called
5. **No subprocess timeout**: API outage = pipeline hangs forever
6. **Parallel partial failure**: Promise.all abandons successful branches on first rejection
7. **Command injection**: shell:true + user input in prompt = arbitrary command execution
8. **Double JSON.parse needed**: --output-format json wraps result in { result: "stringified json" }
9. **Fallback node not in graph flow**: fallback node exists in Program.nodes but not in FlowNode[]

## Medium Severity
10. foreach with 0 items → downstream nodes find no output
11. Conditional edge routing unimplemented
12. LLM output may not be valid JSON (markdown fences, trailing text)
13. Token budget enforcement (Graft=tokens, Claude CLI=dollars)
14. Claude CLI not installed → cryptic ENOENT

## Proposed Architecture
```
src/runner/
  executor.ts       — Executor class, walks FlowNode[]
  transforms.ts     — pure TS edge transforms
  claude-cli.ts     — subprocess wrapper with timeout, JSON extraction
  validator.ts      — input JSON validation
  types.ts          — RunResult, NodeResult, etc.
```

## Defensive Measures Required
1. Pre-flight check for claude CLI (checkClaudeCli())
2. Session cleanup before each run (cleanSession())
3. Subprocess timeout (default 5 minutes) with SIGTERM + SIGKILL fallback
4. Robust JSON extraction: direct parse → first brace → last brace → code fence
5. Promise.allSettled() for parallel (not Promise.all)
6. Input validation with clear error messages
7. parseNodeOutput() handles markdown fences, trailing text
8. stdin.end() immediately after spawn

## Edge Cases Enumerated (20 total)
- Empty/missing/wrong-type input JSON
- foreach with 0 items, maxIterations=1
- Parallel with single branch, all branches failing
- Node output exceeds budget, not valid JSON
- Very long prompt (>100KB shell argument limit)
- Concurrent graft run on same directory
- Windows reserved filenames (CON, PRN, NUL)

## Security Concerns
1. Command injection via shell:true (use temp file for prompt instead)
2. Path traversal in node names
3. Prototype pollution from parsed JSON
