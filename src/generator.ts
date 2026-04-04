/**
 * graft generate — natural language to .gft pipeline generation via Anthropic API.
 */
import Anthropic from '@anthropic-ai/sdk';
import { compileToProgram, ProgramResult } from './compiler.js';
import { GraftError } from './errors/diagnostics.js';

/** Function that calls the LLM API. Injectable for testing. */
export type LLMCaller = (params: {
  model: string;
  system: string;
  userMessage: string;
}) => Promise<string>;

export interface GenerateOptions {
  model?: string;
  output?: string;
  /** Override the LLM caller (for testing). */
  llmCaller?: LLMCaller;
}

export interface GenerateResult {
  source: string;
  errors: GraftError[];
}

const SYSTEM_PROMPT = `You are a Graft (.gft) pipeline generator. Generate valid .gft source code based on the user's description.

## .gft Syntax Reference

### Context Declaration
\`\`\`
context <Name>(max_tokens: <N>) {
  <fieldName>: <Type>
  ...
}
\`\`\`
Types: String, Int, Float, Bool, List<T>, Map<K,V>, Optional<T>

### Memory Declaration
\`\`\`
memory <Name>(max_tokens: <N>, storage: file) {
  <fieldName>: <Type>
  ...
}
\`\`\`

### Node Declaration
\`\`\`
node <Name>(model: <model>, budget: <in>/<out>) {
  reads: [<ContextOrProducesName>, ...]

  produces <OutputName> {
    <fieldName>: <Type>
    ...
  }
}
\`\`\`
Models: haiku, sonnet, opus. Budget format: input/output in token shorthand (e.g., 4k/2k, 8k/4k, 12k/6k).

### Edge Declaration
\`\`\`
// Direct edge with transforms
edge <Source> -> <Target>
  | select(<field1>, <field2>)
  | compact
  | filter(<field> <op> <value>)
  | truncate(<N>)
  | drop(<field>)

// Conditional edge
edge <Source> -> {
  when <condition> -> <Target>
  when <condition> -> <Target>
  otherwise -> <Target>
}
\`\`\`

### Graph Declaration
\`\`\`
graph <Name>(input: <Context>, output: <Produces>, budget: <N>) {
  // Sequential
  <Node1> -> <Node2> -> done

  // Parallel
  parallel {
    <Node1>
    <Node2>
  }
  -> <Node3> -> done

  // Foreach
  foreach(<Source>.<field> as <var>, max_iterations: <N>) {
    <Node> -> done
  }
}
\`\`\`

## Rules
- Output ONLY valid .gft code inside a \`\`\`gft fenced block
- Do NOT use import statements
- Every node must have model, budget (in/out), reads, and produces with typed fields
- Every graph must declare input, output, and budget
- Use realistic token budgets: haiku 4k/2k, sonnet 8k/4k, opus 12k/6k
- Add edge transforms (select, compact) to reduce token flow between nodes
- Add comments to explain the pipeline

## Complete Example

\`\`\`gft
// Adversarial Code Review Pipeline
// Security + Performance + Logic reviewers challenge each other,
// then a senior reviewer makes the final call.

context PullRequest(max_tokens: 3k) {
  diff: String
  description: String
  files_changed: List<String>
}

node SecurityReviewer(model: sonnet, budget: 6k/3k) {
  reads: [PullRequest]

  produces SecurityAnalysis {
    vulnerabilities: List<String>
    severity: String
    recommendation: String
  }
}

node LogicReviewer(model: sonnet, budget: 6k/3k) {
  reads: [PullRequest]

  produces LogicAnalysis {
    bugs: List<String>
    edge_cases: List<String>
    correctness: String
  }
}

node PerformanceReviewer(model: haiku, budget: 4k/2k) {
  reads: [PullRequest]

  produces PerfAnalysis {
    hotspots: List<String>
    complexity_concerns: List<String>
    impact: String
  }
}

node SeniorReviewer(model: opus, budget: 10k/5k) {
  reads: [PullRequest, SecurityAnalysis, LogicAnalysis, PerfAnalysis]

  produces FinalReview {
    approved: Bool
    blocking_issues: List<String>
    suggestions: List<String>
    summary: String
  }
}

edge SecurityReviewer -> SeniorReviewer
  | select(vulnerabilities, severity)
  | compact

edge LogicReviewer -> SeniorReviewer
  | select(bugs, edge_cases)
  | compact

edge PerformanceReviewer -> SeniorReviewer
  | select(hotspots, complexity_concerns)
  | compact

graph AdversarialReview(input: PullRequest, output: FinalReview, budget: 40k) {
  parallel {
    SecurityReviewer
    LogicReviewer
    PerformanceReviewer
  }
  -> SeniorReviewer -> done
}
\`\`\`
`;

const MAX_RETRIES = 2;

/**
 * Extract .gft source from an LLM response.
 * Multi-strategy: (1) ```gft fence, (2) any fence, (3) bare response.
 */
export function extractGftSource(response: string): string {
  // Strategy 1: ```gft ... ```
  const gftFence = response.match(/```gft\s*\n([\s\S]*?)```/);
  if (gftFence) return gftFence[1].trim();

  // Strategy 2: any ``` ... ```
  const anyFence = response.match(/```\s*\n([\s\S]*?)```/);
  if (anyFence) return anyFence[1].trim();

  // Strategy 3: bare response (strip obvious markdown)
  return response.replace(/^#+\s.*$/gm, '').trim();
}

/**
 * Build the system prompt for .gft generation.
 */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Validate generated .gft source using the Graft compiler.
 * Returns errors or empty array on success.
 */
function validateSource(source: string): GraftError[] {
  try {
    const result: ProgramResult = compileToProgram(source, 'generated.gft');
    if (!result.success) return result.errors;
    return [];
  } catch (e) {
    // Unexpected internal error — treat as validation failure
    const msg = e instanceof Error ? e.message : String(e);
    return [new GraftError(msg, { line: 0, column: 0, offset: 0 }, 'error')];
  }
}

/**
 * Generate a .gft file from a natural language description.
 */
/**
 * Default LLM caller using the Anthropic SDK.
 */
function createDefaultCaller(): LLMCaller {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
      'Set it with: export ANTHROPIC_API_KEY=your-key-here',
    );
  }

  const client = new Anthropic({ apiKey });

  return async ({ model, system, userMessage }) => {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  };
}

/**
 * Generate a .gft file from a natural language description.
 */
export async function generateGft(
  description: string,
  options?: GenerateOptions,
): Promise<GenerateResult> {
  const model = options?.model ?? 'claude-sonnet-4-20250514';

  if (!description.trim()) {
    throw new Error('Description cannot be empty.');
  }

  const callLLM = options?.llmCaller ?? createDefaultCaller();

  let bestSource = '';
  let bestErrors: GraftError[] = [];
  let userMessage = description;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const text = await callLLM({ model, system: SYSTEM_PROMPT, userMessage });

    const source = extractGftSource(text);
    const errors = validateSource(source);

    if (errors.length === 0) {
      return { source, errors: [] };
    }

    // Track best attempt (fewest errors)
    if (bestSource === '' || errors.length < bestErrors.length) {
      bestSource = source;
      bestErrors = errors;
    }

    // Build retry prompt with error feedback
    if (attempt < MAX_RETRIES) {
      const errorMessages = errors
        .map(e => e.format(source, 'generated.gft'))
        .join('\n');
      userMessage =
        `${description}\n\n` +
        `Your previous attempt had these compilation errors. Fix them:\n\n${errorMessages}`;
    }
  }

  return { source: bestSource, errors: bestErrors };
}
