# Convergence Report — v2.1-R3: Token Tracking Core

## Summary

4 agents, scores 6-8. High consensus on architecture (TokenTracker as standalone, switch to `--output-format json`, advisory enforcement). Key disagreements resolved below. Step 2 cross-critique skipped — strong alignment makes formal forced dissenter low value.

## Disagreement Resolutions

### 1. CLI Envelope Detection (A1 vs A2 vs A3)

**Adopted: A2's heuristic approach.**

Only treat stdout as a CLI JSON envelope if BOTH `result` AND at least one metadata field (`usage`, `model`, `cost_usd`) are present. This prevents false positives from node outputs that happen to have a `result` field.

```typescript
if (typeof parsed === 'object' && parsed !== null && 'result' in parsed &&
    ('usage' in parsed || 'model' in parsed || 'cost_usd' in parsed)) {
  // Structured CLI output
}
```

A3's concern about mock spawner backward compat is valid — without this heuristic, existing mocks returning `{ result: "..." }` would be incorrectly unwrapped.

### 2. Estimate Source (A1/A2 vs A4)

**Adopted: A1/A2 — use `nodeDecl.budgetIn/budgetOut` directly.**

Reasoning: Running TokenEstimator inside executor adds coupling between runtime and analyzer. budgetIn/budgetOut are declared on each node and available without computation. The divergence from estimator's refined calculation (edge transforms, partial reads) is acceptable for advisory mode. R4 can bridge compile-time estimates to runtime if calibration shows significant divergence.

### 3. Token Log Clearing

**Adopted: Clear in `execute()` after cleanSession(), before flow execution.** Write empty string to token_log.txt path (create if missing).

### 4. Function Naming

**Adopted: `parseCLIOutput`** (A2's convention). Returns `{ content: unknown; tokenUsage?: TokenUsage }`.

### 5. Graceful Degradation (A3's concerns)

A3 correctly notes the CLI may not return `usage` data. The design handles this:
- `parseCLIOutput` returns `tokenUsage: undefined` when usage field is missing
- `TokenTracker.record()` uses estimate when actual is undefined (`actual ?? est`)
- Token log shows "N/A" for actual when unavailable
- No crash paths — all token tracking is advisory

## Implementation Spec

### 1. subprocess.ts — Additions

Keep all existing code unchanged. Add:

```typescript
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// SpawnResult unchanged (no tokenUsage field on SpawnResult itself)
// Token parsing happens in parseCLIOutput, not in spawnClaude

export function parseCLIOutput(stdout: string): { content: unknown; tokenUsage?: TokenUsage } {
  const trimmed = stdout.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null && 'result' in parsed &&
        ('usage' in parsed || 'model' in parsed || 'cost_usd' in parsed)) {
      // Structured CLI output
      let tokenUsage: TokenUsage | undefined;
      if (parsed.usage && typeof parsed.usage === 'object' &&
          typeof parsed.usage.input_tokens === 'number' &&
          typeof parsed.usage.output_tokens === 'number') {
        tokenUsage = {
          inputTokens: parsed.usage.input_tokens,
          outputTokens: parsed.usage.output_tokens,
        };
      }
      // Unwrap result
      let content: unknown;
      if (typeof parsed.result === 'string') {
        try { content = JSON.parse(parsed.result); } catch { content = parsed.result; }
      } else {
        content = parsed.result;
      }
      return { content, tokenUsage };
    }
  } catch { /* not JSON — fall through */ }

  // Fallback: raw output (--print mode or non-envelope JSON)
  const content = extractJson(stdout);
  return { content, tokenUsage: undefined };
}
```

### 2. src/runtime/token-tracker.ts — NEW

```typescript
import * as fs from 'node:fs';
import { BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD } from '../constants.js';

export interface TokenLogEntry {
  nodeName: string;
  estimated: number;
  actual: number | undefined;
  cumulative: number;
  timestamp: string;
}

export class TokenTracker {
  private budget: number;
  private consumed: number = 0;
  private entries: TokenLogEntry[] = [];
  private logPath: string | null;

  constructor(budget: number, logPath: string | null = null) {
    this.budget = budget;
    this.logPath = logPath;
  }

  record(
    nodeName: string,
    usage: { inputTokens: number; outputTokens: number } | undefined,
    estimated: { in: number; out: number },
  ): void {
    const actual = usage ? usage.inputTokens + usage.outputTokens : undefined;
    const est = estimated.in + estimated.out;
    this.consumed += actual ?? est;
    const timestamp = new Date().toISOString();
    const entry: TokenLogEntry = {
      nodeName, estimated: est, actual, cumulative: this.consumed, timestamp,
    };
    this.entries.push(entry);

    if (this.logPath) {
      const actualStr = actual !== undefined ? String(actual) : 'N/A';
      const pct = this.budget > 0 ? Math.round((this.consumed / this.budget) * 100) : 0;
      const line = `[${timestamp}] Node ${nodeName} | estimated: ${est} | actual: ${actualStr} | cumulative: ${this.consumed}/${this.budget} (${pct}%)\n`;
      try { fs.appendFileSync(this.logPath, line); } catch { /* silent */ }
    }
  }

  get fraction(): number {
    return this.budget > 0 ? this.consumed / this.budget : 0;
  }

  get isWarning(): boolean {
    return this.fraction >= BUDGET_WARNING_THRESHOLD;
  }

  get isCritical(): boolean {
    return this.fraction >= BUDGET_CRITICAL_THRESHOLD;
  }

  get totalConsumed(): number {
    return this.consumed;
  }

  getEntries(): TokenLogEntry[] {
    return [...this.entries];
  }

  getSummary(): {
    budget: number; consumed: number; fraction: number;
    perNode: Array<{ node: string; actual?: number; estimated: number }>;
  } {
    return {
      budget: this.budget,
      consumed: this.consumed,
      fraction: this.fraction,
      perNode: this.entries.map(e => ({
        node: e.nodeName,
        actual: e.actual,
        estimated: e.estimated,
      })),
    };
  }
}
```

### 3. executor.ts — Changes

**New imports:**
```typescript
import { parseCLIOutput, TokenUsage } from './subprocess.js';
import { TokenTracker } from './token-tracker.js';
```

**Remove:** the separate `import { extractJson } from './subprocess.js'` line (parseCLIOutput handles it).

**Extended interfaces:**
```typescript
export interface NodeResult {
  node: string;
  output: unknown;
  durationMs: number;
  success: boolean;
  error?: string;
  tokenUsage?: TokenUsage;  // NEW
}

export interface RunResult {
  success: boolean;
  graph: string;
  nodeResults: NodeResult[];
  finalOutput: unknown;
  totalDurationMs: number;
  errors: string[];
  tokenUsage?: {  // NEW
    budget: number;
    consumed: number;
    fraction: number;
    perNode: Array<{ node: string; actual?: number; estimated: number }>;
  };
}
```

**New class field:**
```typescript
private tracker!: TokenTracker;
```

**In execute(), after cleanSession() and mkdirSync:**
```typescript
// Token tracking
const tokenLogPath = path.join(this.options.workDir, '.graft', 'token_log.txt');
fs.mkdirSync(path.dirname(tokenLogPath), { recursive: true });
fs.writeFileSync(tokenLogPath, '');  // Clear on session start
this.tracker = new TokenTracker(graph.budget, tokenLogPath);
```

**In execute() return:**
```typescript
return {
  success: errors.length === 0,
  graph: graph.name,
  nodeResults,
  finalOutput,
  totalDurationMs: Date.now() - startTime,
  errors,
  tokenUsage: this.tracker.getSummary(),
};
```

**In executeNode() — switch args:**
```typescript
const args = [
  '--output-format', 'json',   // CHANGED from '--print'
  '--model', resolvedModel,
  '--max-tokens', String(nodeDecl.budgetOut),
  '-p', prompt,
];
```

**In executeNode() — replace extractJson calls with parseCLIOutput:**
```typescript
// Where currently: const output = extractJson(result.stdout);
const cliOutput = parseCLIOutput(result.stdout);
const output = cliOutput.content;
const tokenUsage = cliOutput.tokenUsage;
```

There are TWO places in executeNode that call extractJson — the success path and the non-zero exit recovery path. Both must switch to parseCLIOutput.

**After storeOutput, add token recording:**
```typescript
const estimated = { in: nodeDecl.budgetIn, out: nodeDecl.budgetOut };
this.tracker.record(name, tokenUsage, estimated);

if (this.options.verbose) {
  if (this.tracker.isCritical) {
    console.log(`[BUDGET] Critical: ${Math.round(this.tracker.fraction * 100)}% of budget consumed`);
  } else if (this.tracker.isWarning) {
    console.log(`[BUDGET] Warning: ${Math.round(this.tracker.fraction * 100)}% of budget consumed`);
  }
}
```

**NodeResult return includes tokenUsage:**
```typescript
return { node: name, output, durationMs: Date.now() - startTime, success: true, tokenUsage };
```

**Dry-run path — record estimate-only:**
After mock output generation and storeOutput:
```typescript
const estimated = { in: nodeDecl.budgetIn, out: nodeDecl.budgetOut };
this.tracker.record(name, undefined, estimated);
return { node: name, output: mockOutput, durationMs: Date.now() - startTime, success: true };
```

### 4. runner.ts — NO changes needed

Runner passes Program to Executor. Executor reads graph.budget directly. RunResult now includes tokenUsage automatically.

## Test Targets

### TokenTracker (unit tests)
- record with actual: uses actual (inputTokens + outputTokens), not estimate
- record without actual: uses estimate (in + out)
- cumulative across multiple records
- isWarning at exactly 80%
- isCritical at exactly 90%
- not warning at 79.9%
- fraction is 0 when budget is 0
- getSummary returns correct structure

### parseCLIOutput (unit tests)
- Structured CLI output with usage: returns content + tokenUsage
- Structured CLI output without usage: returns content, tokenUsage undefined
- Raw JSON (no result/usage/model): falls through to extractJson
- Non-JSON text: falls through to extractJson
- result field is string containing JSON: unwraps correctly
- result field is object: returns directly

### Token log writing (integration)
- Log file created and entries appended
- Multiple entries on separate lines
- Format matches spec: `[timestamp] Node ... | estimated: ... | actual: ... | cumulative: .../...`
- N/A for actual when tokenUsage undefined

### Executor integration
- RunResult includes tokenUsage after execution
- Dry run: tokenUsage populated with estimates only
- Budget warnings in verbose mode at thresholds

### Existing test updates
- Update args assertion from `--print` to `--output-format json` (runner.test.ts)
- Verify existing mock spawners still work (backward compat via heuristic)

## Ratchet Items

### New Ratchets
- [v2.1-R11] TokenUsage and parseCLIOutput in subprocess.ts with heuristic envelope detection — LOCKED
- [v2.1-R12] TokenTracker as standalone class in src/runtime/token-tracker.ts — LOCKED
- [v2.1-R13] Token log cleared on session start, appended per node — LOCKED
- [v2.1-R14] RunResult.tokenUsage with budget/consumed/fraction/perNode — LOCKED
- [v2.1-R15] Budget enforcement advisory only; no hard abort — LOCKED
- [v2.1-R16] Estimates from nodeDecl.budgetIn/budgetOut, not TokenEstimator — LOCKED
- [v2.1-R17] Switch from --print to --output-format json in executor — LOCKED
