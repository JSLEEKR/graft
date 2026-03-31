# Graft Language Specification v0.1

## 1. Overview

Graft는 AI 에이전트 멀티에이전트 시스템을 위한 그래프 네이티브 언어입니다.
컨텍스트 흐름을 선언적으로 정의하고, 토큰 소비를 정적 분석하며,
Claude Code 에이전트 팀으로 컴파일합니다.

파일 확장자: `.gft`
CLI 명령어: `graft`

## 2. Lexical Structure

### 2.1 Keywords

```
node, edge, graph, context, memory, type,
reads, produces, tools, budget, flow,
transform, select, drop, format,
when, otherwise, foreach, done,
parallel, sequential,
import, from, as,
schema, enum, struct,
on_complete, on_failure,
retry, fallback,
input, output,
shared_context, lifetime,
condition, constraint
```

### 2.2 Identifiers

```
identifier := [A-Z][a-zA-Z0-9_]*    // PascalCase: 타입, 노드, 그래프
            | [a-z][a-zA-Z0-9_]*    // camelCase: 필드, 변수
```

### 2.3 Literals

```
integer     := [0-9]+
float       := [0-9]+ '.' [0-9]+
string      := '"' [^"]* '"'
bool        := 'true' | 'false'
token_unit  := integer 'tokens'
```

### 2.4 Comments

```
// 한 줄 주석
/* 여러 줄 주석 */
```

## 3. Type System

### 3.1 Primitive Types

```
String                    // UTF-8 문자열
Int                       // 정수
Float                     // 부동소수점
Float(min..max)          // 범위 제약 부동소수점
Bool                      // 불리언
```

### 3.2 Collection Types

```
List<T>                   // 순서가 있는 리스트
Map<K, V>                 // 키-값 맵
Optional<T>               // null 가능 타입
```

### 3.3 Token-Aware Types (Graft 고유)

```
TokenBounded<T, max: Int>
// T 타입의 값을 직렬화했을 때 max 토큰을 초과할 수 없음
// 초과 시: 컴파일 경고 (정적) 또는 자동 압축 (런타임)

// 예시
description: TokenBounded<String, 100>    // 최대 100 토큰 문자열
summary: TokenBounded<AnalysisResult, 500> // 직렬화 시 500 토큰 이내
```

### 3.4 Agent Output Type

```
AgentOutput<Schema> {
  data: Schema              // 구조화된 출력 데이터
  confidence: Float(0..1)   // 에이전트 확신도
  reasoning_trace: Optional<String>  // 디버깅용 추론 과정
  token_cost: Int           // 실제 소비 토큰 (런타임 기록)
}
```

### 3.5 Enum Types

```
enum Severity { low, medium, high, critical }
enum Action { create, modify, delete, test }
enum Serialization { compact, narrative, hybrid }
```

### 3.6 Struct Types (인라인 스키마)

```
schema {
  field_name: Type
  field_name: Type
  ...
}

// 중첩 가능
schema {
  steps: List<Step {
    action: enum(create, modify, delete)
    target: FilePath
    description: TokenBounded<String, 100>
  }>
}
```

### 3.7 Built-in Domain Types

```
FilePath                  // 파일 경로
FileDiff                  // 파일 변경사항
TestFile                  // 테스트 파일
IssueRef                  // 이슈 참조
CodePatch                 // 코드 패치
```

## 4. Context Declaration

### 4.1 Syntax

```
context <Name> : <ContextType> {
  <properties>
}
```

### 4.2 Context Types

#### Structured
스키마가 있는 구조화된 데이터. 토큰 효율이 가장 높음.

```
context TaskSpec : Structured {
  schema {
    description: String
    acceptance_criteria: List<String>
    related_issues: List<IssueRef>
  }
  max_tokens: 1000
  lifetime: graph          // graph | session | persistent
}
```

#### Sequential
순차적 데이터 (대화 히스토리 등). 윈도우와 압축 정책을 가짐.

```
context ConversationHistory : Sequential {
  window: sliding(last: 5 turns)
  compression: summarize_after(3 turns)
  max_tokens: 4000
  lifetime: session
}
```

#### Indexed
외부 저장소에서 온디맨드로 쿼리하는 데이터.

```
context DomainKnowledge : Indexed {
  source: knowledge_graph("product_domain")
  retrieval: semantic_search(top_k: 5)
  max_tokens: 3000
  lifetime: persistent
}
```

### 4.3 Lifetime

| Lifetime | 범위 | 설명 |
|----------|------|------|
| `graph` | 단일 그래프 실행 | 실행 완료 시 폐기 |
| `session` | 세션 동안 유지 | 세션 종료 시 폐기 |
| `persistent` | 영구 저장 | 지식 그래프에 저장 |

### 4.4 Retrieval Strategies

```
semantic_search(top_k: Int)                    // 시맨틱 유사도 검색
graph_traverse(start: String, hops: Int)       // 그래프 탐색
pattern_match(query: String)                   // 패턴 매칭
keyword_search(fields: List<String>)           // 키워드 검색
```

## 5. Node Declaration

### 5.1 Syntax

```
node <Name> {
  model: <ModelSpec>
  reads: [<ContextRef>, ...]
  produces: <OutputType> { schema { ... } }
  tools: [<ToolName>, ...]
  budget { input: <Int>, output: <Int> }
  on_failure: <FailureStrategy>
}
```

### 5.2 Model Specification

```
model: sonnet                    // 최신 Sonnet
model: opus                      // 최신 Opus
model: haiku                     // 최신 Haiku
model: claude-sonnet-4-20250514  // 특정 버전
model: gpt-4o                    // 다른 프로바이더 (향후 지원)
model: local(ollama, "llama3")   // 로컬 모델 (향후 지원)
```

### 5.3 Context Reference (reads)

```
reads: [TaskSpec]                          // 전체 컨텍스트
reads: [Plan.steps[current]]               // 특정 필드만 (partial read)
reads: [Implementation.files_changed]      // 하위 필드
reads: [TaskSpec.acceptance_criteria]       // 스키마 내 특정 필드
```

Partial read는 토큰 절약의 핵심 메커니즘. 컴파일러가 실제 필요한 부분만 직렬화.

### 5.4 Output Schema (produces)

```
produces: AnalysisResult {
  schema {
    issues: List<Issue>
    architecture_pattern: Pattern
    risk_score: Float(0..1)
  }
}
```

에이전트 출력은 반드시 스키마를 따라야 함. 자연어 대신 구조화된 IR로 다음 노드에 전달.

### 5.5 Tools

```
tools: [file_read, file_write, terminal, ast_parse, test_run, lint, browser]
```

사용 가능한 도구를 명시적으로 선언. 선언되지 않은 도구 사용 시 컴파일 에러.

### 5.6 Budget

```
budget { input: 4000, output: 2000 }
// input: 이 노드에 주입되는 총 토큰 상한
// output: 이 노드가 생성하는 토큰 상한
```

### 5.7 Failure Strategy

```
on_failure: retry(max: 2)                          // 재시도
on_failure: fallback(SimpleAnalyzer)                // 대체 노드
on_failure: retry(max: 2, then: fallback(Simple))   // 재시도 후 대체
on_failure: abort("Analysis failed")                // 중단
on_failure: skip                                    // 건너뛰기
```

## 6. Edge Declaration

### 6.1 Basic Edge

```
edge <SourceNode> -> <TargetNode> {
  transform { ... }
  condition: <Expression>
}
```

### 6.2 Transform Operations

```
transform {
  // 필터링
  select: <field> where <condition>
  
  // 제거
  drop: <field>
  
  // 직렬화 전략
  format: compact | narrative | hybrid
  
  // 커스텀 변환
  map: <Expression>
  
  // 토큰 제한
  truncate: <Int> tokens
}
```

예시:
```
edge Analyzer -> Reviewer {
  transform {
    select: issues where severity >= "medium"
    drop: architecture_pattern
    drop: reasoning_trace
    format: compact
  }
}
```

### 6.3 Conditional Routing

```
// 단일 조건
edge Analyzer -> Reviewer {
  condition: Analyzer.output.risk_score > 0.5
}

// 다중 조건 분기
edge Analyzer -> {
  when risk_score > 0.7 -> DetailedReviewer
  when risk_score > 0.3 -> StandardReviewer
  otherwise -> AutoApprove
}
```

### 6.4 Token Estimation

컴파일러가 각 엣지의 변환 후 토큰을 자동 추정:

```
// 컴파일러 출력 (코드에 작성하지 않음)
edge Analyzer -> Reviewer {
  // input: ~2000 tokens (Analyzer full output)
  // after transform: ~800 tokens (60% reduction)
  // estimated_tokens: 800
}
```

## 7. Graph Declaration

### 7.1 Syntax

```
graph <Name> {
  input: <Type>
  output: <Type>
  budget: <Int> tokens
  
  flow { ... }
  
  shared_context: [<ContextRef>, ...]
  on_complete { ... }
}
```

### 7.2 Flow Control

#### Sequential
```
flow {
  Analyzer -> Reviewer -> Fixer -> done
}
```

#### Parallel
```
flow {
  Analyzer
  -> parallel {
    SecurityReviewer
    PerformanceReviewer
    StyleReviewer
  }
  -> Aggregator -> done
}
```

#### Foreach (반복)
```
flow {
  Planner
  -> foreach(Planner.output.steps as step) {
    Implementer(current: step)
    -> Verifier
  }
  -> done
}
```

#### Conditional
```
flow {
  Analyzer
  -> when(risk_score > 0.7) {
    DetailedReview -> Fixer
  }
  -> done
}
```

#### Loop (재시도 루프)
```
flow {
  Implementer
  -> Verifier
  -> when(!passed) {
    Implementer(retry: 1, max_retries: 3)
  }
  -> done
}
```

#### 복합 흐름
```
flow {
  Planner
  -> foreach(Planner.output.steps as step, max_iterations: 5) {
    Implementer(current: step)
    -> parallel {
      UnitTester
      Linter
    }
    -> Verifier
    -> when(!passed) {
      Implementer(
        additional_context: Verifier.output.failures,
        retry: 1
      )
    }
  }
  -> IntegrationTester
  -> done
}
```

### 7.3 Budget Constraint

```
graph Pipeline {
  budget: 25000 tokens
  
  // 컴파일러가 정적 분석:
  // - 최선 경로 토큰 합산
  // - 최악 경로 토큰 합산 (루프, 재시도 포함)
  // - 예산 초과 시 경고
  
  constraint total_budget <= 25000 tokens  // 명시적 제약
}
```

### 7.4 Post-Execution Hooks

```
on_complete {
  // 결과를 메모리에 저장
  store <NodeOutput> -> <Memory> as pattern(<label>)
  
  // 토큰 리포트 생성
  emit token_report
  
  // 커스텀 스크립트 실행
  run "scripts/post_process.sh"
}
```

## 8. Memory Declaration

### 8.1 Syntax

```
memory <Name> {
  backend: <BackendType>
  ontology { ... }
  learn_from { ... }
  query { ... }
}
```

### 8.2 Backend Types

```
backend: neo4j                    // Neo4j 그래프 DB
backend: sqlite                   // SQLite (경량)
backend: in_memory                // 인메모리 (테스트용)
backend: json_file                // JSON 파일 (프로토타입)
```

### 8.3 Ontology

```
ontology {
  entities: [Feature, Bug, Decision, Convention, Person]
  relations: [
    Feature -depends_on-> Feature,
    Bug -affects-> Feature,
    Decision -made_by-> Person,
    Convention -applies_to-> Feature
  ]
}
```

### 8.4 Learning Rules

```
learn_from {
  graph CodeReviewPipeline {
    on_complete: extract_entities(ReviewDecision) -> store
    on_failure: store_episode(error_context, resolution)
  }
}
```

### 8.5 Query Interface

```
query {
  semantic_search(embedding_model: text-embedding-3-small)
  graph_traverse(max_hops: 3)
  pattern_match(cypher_compatible: true)
}
```

## 9. Import System

```
// 메모리 임포트
import memory ProductKB from "./knowledge/product.mem"

// 노드 임포트 (재사용 가능한 에이전트 정의)
import node StandardReviewer from "./agents/reviewer.gft"

// 컨텍스트 임포트
import context TechStackSpec from "./schemas/tech_stack.gft"

// 그래프 임포트 (서브 그래프로 사용)
import graph TestSuite from "./pipelines/test.gft"
```

## 10. Compilation Semantics

### 10.1 Token Flow Analysis

컴파일러는 그래프의 모든 가능한 실행 경로를 분석합니다:

1. 각 노드의 `reads` 선언에서 주입될 토큰 상한을 계산
2. 각 엣지의 `transform`에서 변환 후 토큰을 추정
3. 경로별 총 토큰을 합산 (최선/최악/평균)
4. `budget` 제약 조건과 비교
5. 위반 시 경고 또는 에러 + 최적화 제안

### 10.2 Context Scope Verification

- 노드는 `reads`에 선언된 컨텍스트만 접근 가능
- 선언하지 않은 컨텍스트 접근 → 컴파일 에러
- 순환 참조 감지 (A reads B.output, B reads A.output)
- shared_context는 모든 노드에서 접근 가능 (명시적 공유)

### 10.3 Graph Optimization

- 의존성 없는 노드의 병렬 실행 자동 식별
- 불필요한 컨텍스트 전달 제거 (dead context elimination)
- 엣지 transform 체이닝 최적화
- 모델 라우팅 최적화 (간단한 태스크 → 경량 모델)

### 10.4 Compilation Output Structure

```
.claude/
├── CLAUDE.md                          // 오케스트레이션 마스터 계획
├── agents/
│   ├── planner.md                     // 각 노드 → 에이전트 정의
│   ├── implementer.md
│   └── verifier.md
├── skills/
│   └── inject-context/
│       ├── task-spec/SKILL.md         // 각 컨텍스트 → 스킬
│       └── codebase-map/SKILL.md
├── hooks/
│   ├── edge-transform-analyzer-reviewer.sh
│   └── edge-transform-reviewer-fixer.sh
└── settings.json                      // 모델 라우팅, 권한, 예산

.graft/
├── knowledge/                         // Cold memory
│   └── product_domain.json
├── session/                           // Warm memory
│   ├── current_state.json
│   └── node_outputs/                  // 노드 간 IR
├── token_log.txt                      // 실시간 토큰 추적
└── graph_execution.json               // 실행 계획 + 상태
```

## 11. Runtime Semantics

### 11.1 Execution Model

1. `graft run`이 컴파일된 `.claude/` 구조를 로드
2. Claude Code 에이전트 팀을 스폰
3. `CLAUDE.md`의 실행 계획에 따라 에이전트 실행
4. 각 에이전트는 자신의 스킬(컨텍스트 주입 모듈)을 온디맨드 로드
5. 노드 완료 시 Hook이 엣지 transform 실행
6. IR을 `.graft/session/`에 저장
7. 다음 노드에 변환된 IR 전달
8. 모든 노드 완료 시 `on_complete` 실행

### 11.2 Token Accounting

런타임은 실시간으로 토큰 사용량을 추적:

```
[2024-03-15 10:23:01] Planner      | input: 4,823 | output: 1,245 | total: 6,068
[2024-03-15 10:23:15] Edge transform: Planner->Implementer | 1,245 → 387 (69% reduction)
[2024-03-15 10:23:45] Implementer  | input: 5,102 | output: 3,891 | total: 8,993
[2024-03-15 10:24:02] Verifier     | input: 1,823 | output: 312  | total: 2,135
─────────────────────────────────────────────────────────────
TOTAL: 17,196 / 30,000 budget (57.3% used)
```

### 11.3 Failure Recovery

```
on_failure: retry(max: 2, then: fallback(SimpleAnalyzer))

// 실행 흐름:
// 1차 시도 실패 → 2차 재시도 → 3차 재시도 → SimpleAnalyzer로 대체
// 각 재시도마다 토큰 회계에 기록
// fallback 에이전트는 보통 더 적은 budget을 가짐
```

## 12. Future Extensions (Planned)

### 12.1 Multi-Provider Support
```
node Analyzer {
  model: provider(anthropic, "claude-sonnet") 
       | provider(openai, "gpt-4o")            // 폴백
       | provider(local, "llama3")             // 로컬 폴백
}
```

### 12.2 Streaming Edges
```
edge Analyzer ->stream-> Reviewer {
  // 실시간 스트리밍 전달
  chunk_size: 500 tokens
}
```

### 12.3 Graph Composition
```
graph MainPipeline {
  flow {
    Planner
    -> subgraph(TestSuite, input: Plan.output)  // 서브 그래프 호출
    -> Deployer
    -> done
  }
}
```

### 12.4 Dynamic Budget Reallocation
```
graph AdaptivePipeline {
  budget: 30000 tokens
  budget_strategy: adaptive  // 이전 노드가 예산을 적게 쓰면 다음 노드에 재분배
}
```

### 12.5 Eval Integration
```
eval CodeReviewQuality {
  graph: CodeReviewPipeline
  dataset: "./evals/review_cases.json"
  metrics: [accuracy, token_efficiency, latency]
  compare: [flat_prompt, langgraph_baseline]
}
```
