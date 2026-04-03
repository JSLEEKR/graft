/**
 * M2-4: Conditional edge codegen tests
 *
 * Tests that conditional edges (when/else routing) generate:
 * - Router hooks that evaluate conditions and write routing decisions
 * - Orchestration steps describing conditional branching
 * - Settings entries registering router hooks
 * - Agent input overrides for conditional targets
 */
import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';

const CONDITIONAL_SOURCE = `
context APIProposal(max_tokens: 1500) {
  endpoint: String
  method: String
  description: String
}

node RiskAssessor(model: sonnet, budget: 3k/1k) {
  reads: [APIProposal]
  produces RiskAssessment {
    risk_score: Float(0..1)
    breaking: Bool
    concerns: List<String>
  }
}

node DetailedReviewer(model: opus, budget: 6k/3k) {
  reads: [APIProposal, RiskAssessment]
  produces DetailedReview {
    approved: Bool
    required_changes: List<String>
  }
}

node StandardReviewer(model: sonnet, budget: 3k/1500) {
  reads: [APIProposal, RiskAssessment]
  produces StandardReview {
    approved: Bool
    comments: List<String>
  }
}

node AutoApprove(model: haiku, budget: 1k/500) {
  reads: [RiskAssessment]
  produces AutoApproval {
    approved: Bool
    note: String
  }
}

edge RiskAssessor -> {
  when risk_score > 0.7 -> DetailedReviewer
  when risk_score > 0.3 -> StandardReviewer
  else -> AutoApprove
}

graph APIReview(input: APIProposal, output: DetailedReview, budget: 15k) {
  RiskAssessor -> DetailedReviewer -> done
}
`;

describe('Conditional edge codegen', () => {
  const result = compile(CONDITIONAL_SOURCE, 'conditional.gft');

  it('compiles successfully', () => {
    expect(result.success).toBe(true);
    expect(result.files).toBeDefined();
  });

  describe('router hook', () => {
    it('generates a router hook file', () => {
      const hook = result.files!.find(f => f.path === '.claude/hooks/riskassessor-router.js');
      expect(hook).toBeDefined();
    });

    it('router hook reads source output', () => {
      const hook = result.files!.find(f => f.path === '.claude/hooks/riskassessor-router.js')!;
      expect(hook.content).toContain('.graft/session/node_outputs/riskassessor.json');
    });

    it('router hook writes routing decision', () => {
      const hook = result.files!.find(f => f.path === '.claude/hooks/riskassessor-router.js')!;
      expect(hook.content).toContain('.graft/session/routing/riskassessor_route.json');
    });

    it('router hook evaluates conditions in order', () => {
      const hook = result.files!.find(f => f.path === '.claude/hooks/riskassessor-router.js')!;
      expect(hook.content).toContain('data["risk_score"] > 0.7');
      expect(hook.content).toContain('"DetailedReviewer"');
      expect(hook.content).toContain('data["risk_score"] > 0.3');
      expect(hook.content).toContain('"StandardReviewer"');
      expect(hook.content).toContain('"AutoApprove"');
    });

    it('router hook has graceful no-op when input missing', () => {
      const hook = result.files!.find(f => f.path === '.claude/hooks/riskassessor-router.js')!;
      expect(hook.content).toContain('process.exit(0)');
      expect(hook.content).toContain('existsSync');
    });

    it('router hook creates routing directory', () => {
      const hook = result.files!.find(f => f.path === '.claude/hooks/riskassessor-router.js')!;
      expect(hook.content).toContain('mkdirSync');
      expect(hook.content).toContain('recursive: true');
    });

    it('router hook uses if/else if/else chain', () => {
      const hook = result.files!.find(f => f.path === '.claude/hooks/riskassessor-router.js')!;
      // First condition
      expect(hook.content).toMatch(/if \(data\["risk_score"\] > 0\.7\)/);
      // Second condition
      expect(hook.content).toMatch(/else if \(data\["risk_score"\] > 0\.3\)/);
      // Else
      expect(hook.content).toMatch(/} else {/);
    });
  });

  describe('orchestration', () => {
    it('includes conditional routing step', () => {
      const orch = result.files!.find(f => f.path === '.claude/CLAUDE.md')!;
      expect(orch.content).toContain('Conditional routing from RiskAssessor');
    });

    it('describes each branch target', () => {
      const orch = result.files!.find(f => f.path === '.claude/CLAUDE.md')!;
      expect(orch.content).toContain('DetailedReviewer');
      expect(orch.content).toContain('StandardReviewer');
      expect(orch.content).toContain('AutoApprove');
    });

    it('describes conditions', () => {
      const orch = result.files!.find(f => f.path === '.claude/CLAUDE.md')!;
      expect(orch.content).toContain('risk_score');
      expect(orch.content).toContain('> `0.7`');
      expect(orch.content).toContain('> `0.3`');
      expect(orch.content).toContain('else');
    });

    it('references routing file path', () => {
      const orch = result.files!.find(f => f.path === '.claude/CLAUDE.md')!;
      expect(orch.content).toContain('.graft/session/routing/riskassessor_route.json');
    });
  });

  describe('settings', () => {
    it('registers router hook in PostToolUse', () => {
      const settings = result.files!.find(f => f.path === '.claude/settings.json')!;
      const json = JSON.parse(settings.content);
      const hooks = json.hooks.PostToolUse;
      expect(hooks.length).toBeGreaterThan(0);

      const writeEntry = hooks.find((h: any) => h.matcher === 'Write');
      expect(writeEntry).toBeDefined();

      const routerHook = writeEntry.hooks.find((h: any) =>
        h.command.includes('riskassessor-router.js')
      );
      expect(routerHook).toBeDefined();
      expect(routerHook.if).toBe('Write(.graft/session/node_outputs/riskassessor.json)');
    });
  });

  describe('agent input overrides', () => {
    it('conditional targets get input from source node', () => {
      const detailedAgent = result.files!.find(f => f.path === '.claude/agents/detailedreviewer.md')!;
      expect(detailedAgent.content).toContain('.graft/session/node_outputs/riskassessor.json');
    });

    it('auto-approve reads RiskAssessment from source', () => {
      const autoAgent = result.files!.find(f => f.path === '.claude/agents/autoapprove.md')!;
      expect(autoAgent.content).toContain('.graft/session/node_outputs/riskassessor.json');
    });
  });

  describe('routing scaffold', () => {
    it('creates routing directory scaffold', () => {
      const routing = result.files!.find(f => f.path === '.graft/session/routing/.gitkeep');
      expect(routing).toBeDefined();
    });
  });
});

describe('Conditional edge with done target', () => {
  const source = `
context Input(max_tokens: 500) {
  question: String
}

node Checker(model: sonnet, budget: 2k/1k) {
  reads: [Input]
  produces CheckResult {
    valid: Bool
    error: String
  }
}

node Processor(model: sonnet, budget: 3k/2k) {
  reads: [Input, CheckResult]
  produces Output {
    answer: String
  }
}

edge Checker -> {
  when valid == true -> Processor
  else -> done
}

graph Pipeline(input: Input, output: Output, budget: 8k) {
  Checker -> Processor -> done
}
`;

  const result = compile(source, 'done-target.gft');

  it('compiles successfully', () => {
    expect(result.success).toBe(true);
  });

  it('router hook handles done target', () => {
    const hook = result.files!.find(f => f.path === '.claude/hooks/checker-router.js')!;
    expect(hook.content).toContain('"done"');
    expect(hook.content).toContain('valid');
    expect(hook.content).toContain('=== true');
  });

  it('orchestration mentions pipeline complete for done', () => {
    const orch = result.files!.find(f => f.path === '.claude/CLAUDE.md')!;
    expect(orch.content).toContain('pipeline complete');
  });
});

describe('Conditional edge with equality check', () => {
  const source = `
context Task(max_tokens: 1k) {
  description: String
}

node Reviewer(model: opus, budget: 10k/5k) {
  reads: [Task]
  produces ReviewResult {
    approved: Bool
    issues: List<String>
  }
}

node Implementer(model: sonnet, budget: 8k/4k) {
  reads: [ReviewResult, Task]
  produces Implementation {
    code: String
  }
}

edge Reviewer -> {
  when approved == false -> Implementer
  else -> done
}

graph Review(input: Task, output: ReviewResult, budget: 25k) {
  Reviewer -> done
}
`;

  const result = compile(source, 'equality.gft');

  it('compiles and generates router', () => {
    expect(result.success).toBe(true);
    const hook = result.files!.find(f => f.path === '.claude/hooks/reviewer-router.js')!;
    expect(hook.content).toContain('=== false');
    expect(hook.content).toContain('"Implementer"');
  });
});
