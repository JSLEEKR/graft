# Graft v6.0 — Result Loop Design

> 결과 핸들링 + 피드백 루프: 파이프라인 실행 결과를 자동 요약하고, 
> 품질 평가 후 .gft 수정을 제안하는 폐쇄 루프.

## Problem

현재 흐름:
```
.gft → compile → run → 결과 JSON 파일 (끝)
                        ↑ 사용자가 직접 읽어야 함
```

빠진 것:
1. 결과 요약이 없음 — `node_outputs/*.json` 직접 열어봐야 함
2. 품질 판단이 없음 — 결과가 좋은지 나쁜지 모름
3. 피드백 루프가 없음 — 결과가 나쁘면 .gft 수정 → 재실행 수동

## Solution

```
.gft → compile → run → 결과 수집 → 요약 표시
                                      ↓
                              품질 평가 (자동)
                              ├── PASS → "완료" + 결과 요약
                              └── FAIL → .gft 수정 제안 → 재컴파일 → 재실행
```

## Implementation Plan

### Phase 1: Result Summary (graft run 개선)

**목표**: `graft run` 종료 시 결과를 사람이 읽기 좋게 요약

현재 `graft run` 출력:
```
Graph 'Pipeline' completed in 15234ms
Nodes executed: 4
  Classifier           OK       1200ms
  StatAnalyzer         OK       3400ms
  TrendAnalyzer        OK       3100ms  
  ReportWriter         OK       7534ms

Final output:
{"title": "...", "executive_summary": "...", ...}
```

개선 후:
```
Graph 'DataAnalysis' completed in 15.2s

  ✓ Classifier       haiku    1.2s    1,200 tok
  ✓ StatAnalyzer     sonnet   3.4s    5,420 tok  
  ✓ TrendAnalyzer    sonnet   3.1s    5,420 tok
  ✓ ReportWriter     opus     7.5s    15,520 tok

Token usage: 27,560 / 40,000 budget (69%)

── Final Output (FinalReport) ──────────────────
Title: Q3 2026 Revenue Analysis
Executive Summary: Revenue grew 12% QoQ driven by...
Findings: 3 items
Recommendations: 2 items
────────────────────────────────────────────────

Result saved to: .graft/session/result.json
```

**구현**:
- `src/runtime/result-formatter.ts` — RunResult → 사람이 읽기 좋은 문자열
- 최종 출력을 `produces` 스키마 기준으로 필드별 요약
- 토큰 사용량 바 그래프 (budget 대비)
- `--json` 플래그로 JSON 출력 모드 유지

### Phase 2: Quality Evaluation (자동 품질 판단)

**목표**: 결과가 `.gft`에 정의된 스키마와 제약을 만족하는지 자동 검증

검증 항목:
1. **스키마 준수** — produces의 모든 필드가 존재하는가?
2. **타입 검증** — String이 실제로 string인가, List가 array인가?
3. **범위 검증** — Float(0..1)이 실제로 0~1 범위인가?
4. **비어있지 않음** — List<String> 결과가 빈 배열이 아닌가?
5. **토큰 예산** — 실제 사용량이 budget의 90%를 넘었는가?

```
── Quality Check ──────────────────────────────
  ✓ Schema validation: all fields present
  ✓ Type check: all types match
  ⚠ Budget warning: 92% consumed (36,800 / 40,000)
  ✗ Empty field: ReportWriter.recommendations is []
────────────────────────────────────────────────
Quality: 75% (3/4 checks passed)
```

**구현**:
- `src/runtime/result-validator.ts` — RunResult + Program → QualityReport
- 기존 TypeChecker의 타입 정보를 런타임 검증에 재사용
- QualityReport: { score, checks: Check[], warnings, errors }

### Phase 3: Feedback Loop (자동 .gft 수정 제안)

**목표**: 품질이 낮으면 .gft 수정 방향을 제안 (또는 자동 수정)

시나리오별 제안:
| 문제 | 제안 |
|------|------|
| 빈 필드 | "Increase {node} output budget from 2k to 4k" |
| 토큰 초과 | "Add edge transform: `\| truncate(500)` on {edge}" |
| 타입 불일치 | "Node {node} produces wrong type for {field}" |
| 노드 실패 | "Add `on_failure: retry(2)` to {node}" |
| 전체 실패 | "Split into smaller sub-pipelines" |

**구현**:
- `src/runtime/feedback.ts` — QualityReport + Program → Suggestion[]
- 각 Suggestion: { type, message, location, fix? }
- `fix` 필드가 있으면 `--auto-fix` 옵션으로 자동 적용 가능

### Phase 4: CLAUDE.md Integration (Claude Code 네이티브 루프)

**목표**: 위 모든 것을 Claude Code 세션에서 자연어로 사용

`graft init`이 생성하는 CLAUDE.md에 추가:
```markdown
## After Pipeline Execution

When a pipeline finishes:
1. Run `graft run <file.gft> --input <json>` to see the result summary
2. If quality issues are found, suggest .gft modifications
3. After modifying .gft, run `graft compile` then `graft run` again
```

이렇게 하면 Claude Code가 실행 → 결과 확인 → 수정 → 재실행 루프를 자연어 대화로 진행.

## File Changes

| File | Change |
|------|--------|
| `src/runtime/result-formatter.ts` | NEW — RunResult 포맷팅 |
| `src/runtime/result-validator.ts` | NEW — 런타임 품질 검증 |
| `src/runtime/feedback.ts` | NEW — 수정 제안 생성 |
| `src/index.ts` | UPDATE — run 명령어 출력 개선, --json 플래그 |
| `src/index.ts` | UPDATE — init의 CLAUDE.md에 실행 루프 가이드 추가 |
| `tests/result-formatter.test.ts` | NEW |
| `tests/result-validator.test.ts` | NEW |
| `tests/feedback.test.ts` | NEW |

## Implementation Order

```
Phase 1 (result-formatter) → Phase 2 (result-validator) → Phase 3 (feedback)
         ↓                            ↓                           ↓
    바로 유용함              Phase 1이 있어야 의미        Phase 2가 있어야 의미
    
Phase 4 (CLAUDE.md)는 Phase 1-3과 병렬로 진행 가능
```

## Non-Goals (이번 버전에서 안 함)

- 자동 재실행 (사용자가 수동으로 결정)
- 결과 기반 자동 .gft 재작성 (제안만, 적용은 사용자/Claude Code)
- 외부 서비스 연동 (Slack 알림, webhook 등)
- 히스토리 비교 (이전 실행과 비교)
