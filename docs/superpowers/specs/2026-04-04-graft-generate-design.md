# graft generate — Design Spec

> Natural language to .gft pipeline generation via Anthropic API.
> Decided via adversarial debate (Architect + Pragmatist + Skeptic, 2 rounds).

## CLI Interface

```bash
graft generate <description> [--output <file>] [--model <model>]
```

- `<description>`: Natural language pipeline description (required, non-empty)
- `--output <file>`: Write .gft to file (default: stdout)
- `--model <model>`: Anthropic model ID (default: `claude-sonnet-4-20250514`)

## Architecture

```
User input (natural language)
    |
    v
Build system prompt: spec sections 6-9 + 1 example (code-review.gft)
    |
    v
Anthropic Messages API call (@anthropic-ai/sdk)
    |
    v
Extract .gft from response (multi-strategy)
    |
    v
Validate with compileToProgram() (wrapped in try-catch-all)
    |-- success --> write to stdout or --output file
    |-- failure --> retry with error feedback (fresh call, max 2 retries)
    |-- 2 failures --> output best attempt + errors to stderr
```

## Files

| File | Purpose |
|------|---------|
| `src/generator.ts` | Core logic: prompt assembly, API call, extraction, validation loop (~150 lines) |
| `src/index.ts` | CLI command registration (~15 lines) |
| `tests/generator.test.ts` | Unit tests with mocked API (~80 lines) |

## Dependencies

- `@anthropic-ai/sdk` added to `dependencies` in package.json

## Design Decisions (from debate)

### 1. SDK vs fetch()
**Decision: Use `@anthropic-ai/sdk`.**
- A2 proposed raw fetch() to avoid dependency.
- A1+A3 countered: SDK handles auth headers, error typing, rate-limit retries (429/529), and SSE parsing. Reimplementing this in fetch() trades dependency risk for implementation risk.

### 2. System Prompt Strategy
**Decision: Spec sections 6-9 (syntax constructs) + 1 complete example.**
- A1 proposed full spec (~5K tokens). A2 proposed trimmed sections 1-5 + 1 example.
- A3 identified that sections 1-5 (lexer rules) are inferrable from examples, but sections 6-9 (context, node, edge, graph syntax) are essential. One complete example (code-review.gft) provides enough pattern for the LLM.
- Estimated prompt size: ~3K tokens.

### 3. Retry Strategy
**Decision: Fresh calls with error feedback, max 2 retries (3 total attempts).**
- A1 proposed multi-turn conversation continuation.
- A2 countered: fresh calls avoid cumulative token cost. Error messages alone are sufficient for the LLM to fix its output.
- A3 required a hard retry cap to prevent cost runaway.

### 4. Import Handling
**Decision: Prompt instructs "no imports" + strip import lines before validation.**
- All agents agreed: generated .gft with `import` statements will fail because referenced files don't exist. The resolver calls `fs.readFileSync` on import paths.
- Defense-in-depth: instruction in prompt + strip in code.

### 5. Validation
**Decision: `compileToProgram()` wrapped in try-catch-all.**
- A3 identified that non-GraftError exceptions (e.g., internal parser bug triggered by unusual input) would crash instead of retry.
- Wrapping in try-catch treats unexpected throws as validation failure, triggering retry.

### 6. Code Extraction
**Decision: Multi-strategy extraction.**
1. Fenced block with `gft` tag: `` ```gft ... ``` ``
2. Any fenced code block: `` ``` ... ``` ``
3. Entire response as bare .gft

### 7. Output Default
**Decision: stdout by default, `--output` for file.**
- A2+A3 agreed: stdout is safer (no accidental overwrite), composable with pipes.

### 8. Empty Input
**Decision: Reject immediately with clear error before any API call.**

## Function Signatures

```typescript
// src/generator.ts

export interface GenerateOptions {
  model?: string;       // default: 'claude-sonnet-4-20250514'
  output?: string;      // file path, or undefined for stdout
}

export interface GenerateResult {
  source: string;           // generated .gft source
  errors: GraftError[];     // validation errors (empty if success)
}

export async function generateGft(
  description: string,
  options?: GenerateOptions,
): Promise<GenerateResult>;

// Internal helpers (exported for testing)
export function buildSystemPrompt(): string;
export function extractGftSource(response: string): string;
```

## System Prompt Template

```
You are a Graft (.gft) pipeline generator. Generate valid .gft source code based on the user's description.

## .gft Syntax Reference

[Sections 6-9 of SPECIFICATION.md: context, node, edge, graph declarations]

## Rules
- Output ONLY valid .gft code in a ```gft fenced block
- Do NOT use import statements
- Every node must have model, budget (in/out), reads, and produces
- Every graph must declare input context, output produces, and budget
- Use realistic token budgets (e.g., 4k/2k for haiku, 8k/4k for sonnet, 12k/6k for opus)

## Example

[contents of examples/code-review.gft]
```

## Test Plan

1. **extractGftSource**: fenced gft block, any fence, bare response, empty response
2. **generateGft with mock API**: successful generation, validation failure + retry, max retries exceeded
3. **buildSystemPrompt**: returns non-empty string containing key syntax elements
4. **CLI integration**: empty description rejection, missing API key error
