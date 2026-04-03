# Graft Productization Roadmap

## Phase Shift: Compiler → Product

v1.0-v5.0은 "올바르게 동작하는 컴파일러"를 만드는 단계였다.
v6.0부터는 "사람들이 실제로 설치하고, 써보고, 가치를 느끼는 제품"을 만드는 단계다.

### 현재 자산 (v5.0 기준)
- 컴파일러: 프로덕션 수준 (1,333 tests, 5 analyzers, LSP, TextMate)
- CLI: `graft compile`, `graft check`, `graft run` 3개 명령어
- 런타임: Claude Code CLI subprocess 기반 (프로토타입)
- VS Code 확장: LSP client + TextMate grammar (미배포)
- npm: 미배포
- 문서: 개발자용 README만 존재

### 핵심 원칙

1. **"10분 안에 첫 파이프라인 실행"** — 설치부터 결과까지 10분 이내
2. **Claude Code 생태계 네이티브** — Anthropic API 직접 호출 불필요. Claude Code가 런타임
3. **점진적 가치** — compile만으로도 유용 (정적 분석), run은 보너스
4. **실제 시나리오** — hello world가 아니라 실무에서 쓸 만한 예제

---

## Milestone 1: "설치하고 돌려볼 수 있다" (v6.0)

**목표**: `npm install -g @graft-lang/graft && graft compile examples/hello.gft` 가 동작

| Task | 설명 | 우선순위 |
|------|------|----------|
| M1-1 | npm publish (`@graft-lang/graft`) | P0 |
| M1-2 | `graft compile` → Claude Code에서 즉시 사용 가능한 출력 검증 | P0 |
| M1-3 | Getting Started 가이드 (README 재작성) | P0 |
| M1-4 | 실제 e2e 데모: hello.gft → compile → Claude Code로 실행 → 결과 | P0 |
| M1-5 | VS Code 확장 배포 (marketplace) | P1 |
| M1-6 | `graft init` scaffolding 명령어 | P1 |

### M1-1: npm publish

현재 상태:
- `package.json` 이미 `@graft-lang/graft`로 설정됨
- `npm whoami` → `jsleekr` (로그인됨)
- `files: ["dist/", "README.md", "LICENSE"]` 설정됨
- `bin: { graft, graft-lsp }` 설정됨

필요한 작업:
- npm org `@graft-lang` 생성 (또는 unscoped `graft-lang`으로 변경)
- `npm publish --access public`
- CI에서 자동 publish (GitHub Actions)

### M1-2: Claude Code 출력 검증

현재 `graft compile`이 생성하는 파일:
```
.claude/CLAUDE.md          — 오케스트레이션 지시문
.claude/agents/*.md        — 에이전트 정의 (frontmatter 포함)
.claude/hooks/*.sh         — edge transform (jq)
.claude/settings.json      — 모델/도구 설정
.graft/session/            — 런타임 데이터 디렉토리
```

검증 필요:
- `.claude/agents/*.md`의 frontmatter가 Claude Code agent 스펙과 일치하는가?
- `.claude/settings.json`이 실제 Claude Code 설정 포맷인가?
- hooks의 `===NODE_COMPLETE:xxx===` 프로토콜이 실제로 동작하는가?
- `.claude/CLAUDE.md`를 Claude Code가 읽고 따르는가?

**이것이 가장 중요한 검증 — Graft의 가치가 여기서 증명됨**

### M1-3: Getting Started 가이드

현재 README는 기능 나열 중심. 다음으로 재작성:

```
1. 설치 (npm install -g)
2. 첫 .gft 파일 작성 (2-node pipeline)
3. graft compile (출력 설명)
4. Claude Code에서 실행 (실제 결과 스크린샷)
5. 다음 단계 (expressions, memory, imports)
```

### M1-4: e2e 데모

실제로 Claude Code 안에서:
1. `graft compile examples/hello.gft`
2. Claude Code가 `.claude/` 구조를 인식
3. 파이프라인이 실행되어 결과 산출
4. 이 과정을 GIF/영상으로 기록

### M1-5: VS Code 확장 배포

현재 상태:
- `editors/vscode/` 에 LSP client + TextMate grammar 완성
- publisher: `graft-lang` (marketplace publisher 등록 필요)
- LSP server는 `graft-lsp` binary로 제공

필요한 작업:
- `vsce package` → `.vsix` 생성
- marketplace publisher 등록
- `vsce publish`

### M1-6: `graft init`

```bash
$ graft init my-pipeline
Created my-pipeline/
  pipeline.gft     — starter template
  input.json       — sample input
  .vscode/         — editor settings
```

---

## Milestone 2: "실무에서 써볼 만하다" (v6.1-v6.2)

**목표**: 실제 시나리오 3개 이상에서 Graft가 수동 구성보다 낫다는 것을 증명

| Task | 설명 | 우선순위 |
|------|------|----------|
| M2-1 | 실전 예제 3종 (code review, content pipeline, data analysis) | P0 |
| M2-2 | `graft run` 결과 파싱 강화 (structured output) | P0 |
| M2-3 | 에러 메시지 사용자 친화적 개선 | P1 |
| M2-4 | `graft watch` — 파일 변경 시 자동 재컴파일 | P1 |
| M2-5 | `graft visualize` — 파이프라인 DAG 시각화 (Mermaid) | P2 |

### M2-1: 실전 예제 3종

**Code Review Pipeline** (`examples/code-review.gft`):
```graft
node Analyzer(model: sonnet, budget: 8k/4k) {
  reads: [PullRequest]
  produces Analysis { issues: List<Issue>, risk: Float(0..1) }
}
node Reviewer(model: opus, budget: 10k/5k) {
  reads: [Analysis, PullRequest]
  produces Review { comments: List<Comment>, verdict: String }
}
edge Analyzer -> {
  when risk >= 0.7 -> Reviewer
  else -> done
}
```

**Content Pipeline** (`examples/content-pipeline.gft`):
- Research → Draft → Edit → Publish
- memory로 이전 발행물 참조
- foreach로 다국어 번역

**Data Analysis** (`examples/data-analysis.gft`):
- Ingestion → Classification → parallel(StatAnalysis, TrendAnalysis) → Report

### M2-2: 결과 파싱 강화

현재 `extractJson()`이 stdout에서 JSON을 추출하는 방식은 취약함.

개선 방향:
- Claude Code의 `--output-format json` 플래그 활용
- `tool_use` 기반 structured output 강제
- fallback: 현재 방식 유지하되 에러 메시지 개선

### M2-3: 에러 메시지 개선

현재:
```
Error: 'UnknownCtx' is not declared as a context, produces output, or memory
  at test.gft:3:15
```

개선:
```
error[SCOPE_UNDEFINED_REF]: 'UnknownCtx' is not declared
  --> test.gft:3:15
   |
 3 |   reads: [UnknownCtx]
   |           ^^^^^^^^^^ not found
   |
   = help: did you mean 'InputCtx'? Or add: context UnknownCtx(max_tokens: 1k) { ... }
```

---

## Milestone 3: "다른 사람도 쓴다" (v7.0)

| Task | 설명 |
|------|------|
| M3-1 | 문서 사이트 (docs.graft-lang.dev 또는 GitHub Pages) |
| M3-2 | Playground (웹에서 .gft 작성 → 컴파일 결과 미리보기) |
| M3-3 | GitHub Action: PR에서 자동 graft check |
| M3-4 | 커뮤니티 예제 템플릿 갤러리 |
| M3-5 | 다른 codegen backend (Cursor, Windsurf, etc.) |

---

## 하네스 구조 개편

### 기존 방식의 문제

| 측면 | 기존 (v1-v5) | 문제 |
|------|-------------|------|
| 목표 | 컴파일러 정확성 | 이제 정확성은 1,333 테스트가 보장 |
| 프로세스 | 4-agent 토론 → 수렴 → TDD | 사용성 작업에는 과도한 오버헤드 |
| 산출물 | agent_1-4.md, convergence.md, review.md | 대부분 읽히지 않는 문서 |
| 라운드 | 기능 단위 (R1, R2, ...) | 사용성은 기능 단위가 아닌 시나리오 단위 |

### 새로운 방식: Ship-Verify-Iterate

```
┌─────────────────────────────┐
│  1. Ship (구현)              │  — 단일 에이전트, TDD
│     목표: 동작하는 코드      │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│  2. Verify (검증)            │  — 실제 사용 시나리오로 테스트
│     목표: 사용자 관점 확인    │  — "10분 안에 되는가?"
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│  3. Iterate (개선)           │  — 검증에서 발견된 문제 수정
│     목표: 마찰 제거          │
└─────────────────────────────┘
```

### 언제 토론이 필요한가?

| 상황 | 프로세스 |
|------|----------|
| API 설계 변경 (breaking) | 2-agent 토론 (Pragmatist + Skeptic) |
| 새 codegen backend | 2-agent 토론 (Architect + Pragmatist) |
| 버그 수정 | 직접 수정 (TDD) |
| 예제/문서/배포 | 직접 실행 (검증 기반) |
| 성능 최적화 | 벤치마크 → 수정 → 재측정 |

### 산출물 경량화

```
harness/
├── common_memory.md          — 유지 (핵심 결정 기록)
├── milestones/
│   ├── M1/
│   │   ├── checklist.md      — 작업 체크리스트 (완료 여부)
│   │   ├── verification.md   — 실제 사용 시나리오 검증 결과
│   │   └── issues.md         — 발견된 문제 + 해결 여부
│   ├── M2/
│   └── M3/
└── archived/                 — 기존 tasks/ 아카이브
```

기존 `tasks/T{N}/step{0-6}/` 구조는 더 이상 사용하지 않음.
`milestones/M{N}/` 구조로 전환.

### Ratchet 정책 변경

기존: 모든 기술적 결정을 ratchet-lock
신규: **사용자에게 영향을 주는 결정만** ratchet-lock

예시:
- LOCK: CLI 명령어 이름 (`graft compile`, `graft run`)
- LOCK: 생성 파일 경로 (`.claude/agents/*.md`)
- LOCK: package.json exports 경로
- DON'T LOCK: 내부 함수 시그니처, 테스트 헬퍼 구조

### 커밋 컨벤션 변경

기존: `feat(v5.0-R3): strict equality + exhaustive switches`
신규: `feat(M1): npm publish + CI setup` 또는 `fix: agent frontmatter format mismatch`

Milestone 기반으로, 더 이상 라운드 번호 불필요.

---

## 실행 우선순위

```
Week 1: M1-2 (Claude Code 출력 검증) + M1-4 (e2e 데모)
  → 이것이 실패하면 나머지는 의미 없음
  → Graft compile 결과가 Claude Code에서 실제로 동작하는지 먼저 확인

Week 2: M1-1 (npm publish) + M1-3 (README 재작성)
  → 동작이 확인되면 배포

Week 3: M1-5 (VS Code 확장) + M1-6 (graft init)
  → 개발자 경험 완성

Week 4+: M2 시작
  → 실전 예제로 확장
```

**가장 먼저 해야 할 일**: `graft compile examples/hello.gft`의 출력물을 실제 Claude Code 프로젝트에 넣고, Claude Code가 파이프라인을 실행하는지 확인하는 것.
