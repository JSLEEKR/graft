# Graft

**A graph-native language for AI agent harness engineering.**

Graft는 멀티 에이전트 시스템에서 컨텍스트 흐름을 선언적으로 정의하고, 토큰 소비를 정적 분석하며, Claude Code 에이전트 팀으로 컴파일하는 독립 언어입니다.

```
graph CodeReview {
  budget: 25000 tokens

  node Analyzer {
    model: sonnet
    reads: [ProjectSpec, CodebaseMap]
    produces: AnalysisResult
    budget { input: 5000, output: 2000 }
  }

  edge Analyzer -> Reviewer {
    transform: select(issues, severity >= medium)
  }
}
```

```
$ graft compile review.gft

✓ Token flow analysis complete
  Best path:  18,200 tokens ✓ within budget
  Worst path: 31,400 tokens ⚠ exceeds budget
  Suggestion: add max_iterations: 3 to Fixer loop
```

## Why Graft?

현재 멀티 에이전트 시스템의 근본 문제:

| 문제 | 현재 방식 | Graft |
|------|----------|-------|
| 컨텍스트 전달 | 전체 텍스트를 그대로 전달 | 엣지에서 선언적 transform으로 필요한 것만 추출 |
| 토큰 예산 | 런타임에 초과해야 알 수 있음 | 컴파일 타임에 정적 분석으로 사전 검증 |
| 에이전트 간 통신 | 자연어 문자열 | 스키마가 있는 구조화된 IR |
| 컨텍스트 스코프 | 암묵적, 누수 발생 | 명시적 `reads` 선언, 컴파일러가 스코프 검증 |
| 메모리 관리 | 수동 프롬프트 엔지니어링 | Hot/Warm/Cold 메모리 계층 자동 관리 |

## Core Abstractions

Graft는 5개의 핵심 추상화 위에 세워집니다.

### 1. Context — 일급 시민으로서의 컨텍스트

```graft
context ProjectSpec : Structured {
  schema {
    name: String
    stack: TechStack
    requirements: List<Requirement>
  }
  max_tokens: 2000
  lifetime: graph
}

context DomainKnowledge : Indexed {
  source: knowledge_graph("product_domain")
  retrieval: semantic_search(top_k: 5)
  max_tokens: 3000
  lifetime: persistent
}
```

세 가지 컨텍스트 타입:
- **Structured** — 스키마가 있는 구조화된 데이터. 토큰 효율 최고.
- **Sequential** — 대화 히스토리. 윈도우/압축 정책 적용.
- **Indexed** — 외부 지식 저장소에서 온디맨드 쿼리.

### 2. Node — 에이전트 단위

```graft
node Analyzer {
  model: sonnet
  reads: [ProjectSpec, DomainKnowledge]
  
  produces: AnalysisResult {
    schema {
      issues: List<Issue>
      architecture_pattern: Pattern
      risk_score: Float(0..1)
    }
  }
  
  tools: [file_read, ast_parse, test_run]
  budget { input: 4000, output: 2000 }
  on_failure: retry(max: 2, then: fallback(SimpleAnalyzer))
}
```

`reads` 선언이 핵심 — 컴파일러가 각 노드의 토큰 주입량을 사전에 계산합니다.

### 3. Edge — 변환 파이프라인

```graft
edge Analyzer -> Reviewer {
  transform {
    select: issues where severity >= "medium"
    drop: architecture_pattern
    format: compact
  }
  condition: Analyzer.output.risk_score > 0.7
}

// 조건 분기
edge Analyzer -> {
  when risk_score > 0.7 -> DetailedReviewer
  when risk_score > 0.3 -> StandardReviewer
  otherwise -> AutoApprove
}
```

엣지는 단순 연결이 아니라 **토큰 절약의 핵심 메커니즘**입니다.

### 4. Graph — 실행 단위

```graft
graph FeatureImpl {
  input: TaskSpec
  output: CompletedFeature
  budget: 30000 tokens

  flow {
    Planner
    -> foreach(Planner.output.steps as step) {
      Implementer(current: step)
      -> Verifier
      -> when(!passed) { Implementer(retry: 1) }
    }
    -> done
  }

  shared_context: [ProjectSpec]
  
  on_complete {
    store Plan -> ProductKB as pattern("feature_impl")
  }
}
```

### 5. Memory — 영속 계층

```graft
memory ProductKB {
  backend: neo4j
  
  ontology {
    entities: [Feature, Bug, Decision, Convention]
    relations: [
      Feature -depends_on-> Feature,
      Bug -affects-> Feature,
      Decision -made_by-> Person
    ]
  }
  
  query {
    semantic_search(embedding_model: text-embedding-3-small)
    graph_traverse(max_hops: 3)
  }
}
```

## Type System

```graft
// 기본 타입
type String
type Int  
type Float(min..max)
type Bool
type List<T>
type Map<K, V>

// 토큰 바운드 타입 — Graft의 핵심 혁신
type TokenBounded<T, max: Int>
// 직렬화 시 max 토큰 초과 불가. 정적 검증 또는 런타임 자동 압축.

// 에이전트 출력 타입
type AgentOutput<Schema> {
  data: Schema
  confidence: Float(0..1)
  token_cost: Int
}

// 직렬화 전략
type Serialization = compact | narrative | hybrid
```

## Compilation Target: Claude Code

Graft 컴파일러는 `.gft` 소스를 **Claude Code 하네스 구조**로 변환합니다.

```
$ graft compile pipeline.gft

pipeline.gft ──→ Graft Compiler ──→ .claude/
                                     ├── CLAUDE.md          (오케스트레이션 계획)
                                     ├── agents/            (노드 → 에이전트)
                                     ├── skills/            (컨텍스트 주입 모듈)
                                     ├── hooks/             (엣지 transform)
                                     ├── settings.json      (모델 라우팅, 예산)
                                     └── .graft/
                                         ├── knowledge/     (Cold memory)
                                         ├── session/       (Warm memory, IR)
                                         └── token_log.txt  (토큰 추적)
```

### 매핑 규칙

| Graft 요소 | Claude Code 대응 | 역할 |
|-----------|-----------------|------|
| `node` | `.claude/agents/*.md` | 에이전트 정의 (모델, 도구, 출력 스키마) |
| `context` | `.claude/skills/inject-context/` | 온디맨드 컨텍스트 주입 |
| `edge transform` | `.claude/hooks/` | 노드 간 데이터 변환/필터링 |
| `graph flow` | `CLAUDE.md` 오케스트레이션 섹션 | 실행 계획, 토큰 예산, 실패 복구 |
| `memory` | `.graft/knowledge/` | 지식 그래프, 영속 저장소 |

### 실행

```bash
$ graft compile pipeline.gft    # .gft → .claude/ 구조 생성
$ graft run pipeline.gft \
    --input task.json            # Claude Code 에이전트 팀으로 실행
$ graft analyze pipeline.gft    # 토큰 흐름 정적 분석만 수행
```

## Compiler Architecture

```
.gft Source
    │
    ▼
┌──────────┐     ┌──────────┐     ┌──────────────────┐
│  Parser  │────▶│   AST    │────▶│ Token Flow       │
│          │     │          │     │ Analyzer          │
└──────────┘     └──────────┘     │                  │
                                  │ • 토큰 예산 검증   │
                                  │ • 컨텍스트 스코프  │
                                  │ • 그래프 최적화    │
                                  └────────┬─────────┘
                                           │
                                  ┌────────▼─────────┐
                                  │   Code Generator  │
                                  │                   │
                                  │ Target: Claude    │
                                  │ Code Harness      │
                                  └────────┬─────────┘
                                           │
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                      .claude/agents  .claude/skills  .claude/hooks
```

### 컴파일러의 특수 기능

**Token Flow Analysis** — 그래프의 각 실행 경로를 따라 토큰 소비량을 추정. 최선/최악/평균 경로 분석.

**Context Scope Verification** — `reads`로 선언하지 않은 컨텍스트 접근 시 컴파일 에러. 토큰 누수 방지.

**Graph Optimization** — 병렬 실행 가능 노드 자동 식별, 불필요한 컨텍스트 전달 제거, 엣지 transform 순서 최적화.

## Memory Hierarchy

하드웨어 캐시(L1/L2/L3)에서 영감을 받은 3계층 메모리:

| 계층 | 저장소 | 접근 방식 | 용량 | 용도 |
|------|--------|----------|------|------|
| **Hot** | LLM 컨텍스트 윈도우 | 직접 주입 | ~8K tokens | 현재 노드의 즉시 컨텍스트 |
| **Warm** | 세션 상태 (IR) | resolve → serialize | ~100K tokens equiv. | 같은 그래프 실행 내 이전 노드 결과 |
| **Cold** | 지식 그래프 | semantic query → extract | 무제한 | 프로젝트 지식, 학습된 패턴 |

런타임이 자동으로 `pulls_from` 선언을 기반으로 warm/cold에서 필요한 지식을 쿼리하고, 토큰 예산 내에서 최적의 직렬화 전략으로 hot에 주입합니다.

## Example: Full Pipeline

```graft
// review.gft — 코드 리뷰 파이프라인

import memory ProductKB from "./knowledge/product.mem"

context CodebaseMap : Indexed {
  source: ProductKB
  retrieval: graph_traverse(start: "current_feature", hops: 2)
  max_tokens: 3000
}

context TaskSpec : Structured {
  schema {
    description: String
    acceptance_criteria: List<String>
    related_issues: List<IssueRef>
  }
  max_tokens: 1000
}

node Planner {
  model: sonnet
  reads: [TaskSpec, CodebaseMap]
  produces: Plan {
    schema {
      steps: List<Step {
        action: enum(create, modify, delete, test)
        target: FilePath
        description: TokenBounded<String, 100>
      }>
      estimated_complexity: enum(low, medium, high)
    }
  }
  budget { input: 5000, output: 1500 }
}

node Implementer {
  model: sonnet
  reads: [Plan.steps[current], CodebaseMap]
  tools: [file_write, terminal]
  produces: Implementation {
    schema {
      files_changed: List<FileDiff>
      tests_added: List<TestFile>
    }
  }
  budget { input: 8000, output: 4000 }
}

node Verifier {
  model: haiku
  reads: [Implementation.files_changed, TaskSpec.acceptance_criteria]
  tools: [test_run, lint]
  produces: VerificationResult {
    schema {
      passed: Bool
      failures: Optional<List<Failure>>
    }
  }
  budget { input: 3000, output: 500 }
}

graph FeatureImplementation {
  input: TaskSpec
  output: CompletedFeature
  budget: 30000 tokens

  flow {
    Planner
    -> foreach(Planner.output.steps as current_step) {
      Implementer(current: current_step)
      -> Verifier
      -> when(!passed) {
        Implementer(
          additional_context: Verifier.output.failures,
          retry: 1
        )
      }
    }
    -> done
  }

  on_complete {
    store Plan -> ProductKB as pattern(
      "feature_implementation",
      complexity: Plan.estimated_complexity
    )
  }
}
```

```
$ graft compile review.gft

✓ Syntax validation passed
✓ Type checking passed
✓ Context scope verification passed

Token Flow Analysis:
  Planner:      input ~6,000  output ~1,500
  Implementer:  input ~5,200  output ~4,000  (per step)
  Verifier:     input ~2,100  output ~500    (per step)

  Best path  (3 steps, no retry):  ~28,800 tokens ✓
  Worst path (5 steps, all retry): ~51,200 tokens ✗ exceeds budget!

⚠ WARNING: Worst-case path exceeds budget (51,200 > 30,000)
  → Add max_iterations: 3 to foreach loop
  → Or increase budget to 55,000

Optimization suggestions:
  • Verifier uses Haiku — consider static analysis tools (-2,600 tokens/step)
  • Plan.steps[current] scoping prevents full Plan serialization ✓ (good)

Generated:
  .claude/CLAUDE.md                          (orchestration plan)
  .claude/agents/planner.md                  (Planner agent)
  .claude/agents/implementer.md              (Implementer agent)
  .claude/agents/verifier.md                 (Verifier agent)
  .claude/skills/inject-context/codebse-map/ (context injection)
  .claude/skills/inject-context/task-spec/   (context injection)
  .claude/hooks/edge-transform-*.sh          (edge transforms)
  .claude/settings.json                      (model routing, budget)
```

## Roadmap

- [x] Language concept & specification (v0.1)
- [ ] **Phase 1**: Formal grammar specification (BNF/PEG)
- [ ] **Phase 2**: Parser + AST generation
- [ ] **Phase 3**: Token Flow Analyzer (static analysis)
- [ ] **Phase 4**: Claude Code backend code generator
- [ ] **Phase 5**: CLI toolchain (`graft compile`, `graft run`, `graft analyze`)
- [ ] **Phase 6**: Runtime token accounting & feedback loop
- [ ] **Phase 7**: Knowledge graph integration (memory system)
- [ ] **Phase 8**: Additional backends (standalone, LangGraph, etc.)

## Design Philosophy

1. **Context is the bottleneck, not intelligence.** 더 똑똑한 모델보다 더 나은 컨텍스트 관리가 에이전트 성능을 결정합니다.

2. **Declare, don't wire.** 에이전트 간 통신을 코드로 배선하지 말고, 선언적으로 정의하면 컴파일러가 최적화합니다.

3. **Token budgets are types.** 토큰 예산이 타입 시스템의 일부입니다. 메모리 안전성처럼 토큰 안전성을 컴파일 타임에 보장합니다.

4. **Edges are not wires, they are transforms.** 엣지는 단순 연결이 아니라 데이터 변환 파이프라인입니다. 여기서 토큰 절약이 실제로 발생합니다.

5. **Memory has hierarchy.** CPU 캐시처럼 Hot/Warm/Cold 메모리 계층이 자동으로 컨텍스트를 관리합니다.

## Contributing

Graft는 초기 설계 단계입니다. 다음 영역에서 기여를 환영합니다:

- **Language Design** — 문법, 타입 시스템, 시맨틱스에 대한 RFC
- **Compiler** — Parser, AST, Token Flow Analyzer 구현
- **Claude Code Backend** — 코드 생성기 및 런타임 통합
- **Benchmarks** — 기존 방식 대비 토큰 절감률 측정
- **Documentation** — 튜토리얼, 예제, 언어 가이드

## License

MIT
