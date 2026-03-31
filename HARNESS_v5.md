# 반복 수렴 적대적 토의 하네스 v5

## 목적
어떤 프로젝트 아이디어든 입력하면, 멀티에이전트 적대적 토의와 VC 심사를 반복 수행하여 **투자 가능 수준의 설계문서**로 수렴시키는 범용 프로세스.

## v4 → v5 변경 요약 (11개 문제 해결)

| # | 문제 | 해결 |
|---|------|------|
| 1 | 무한 루프 함정 (VC CONDITIONAL + 수렴) | VC 교착 탈출: CONDITIONAL 3회 연속 시 VC_STALEMATE 종료 |
| 2 | 래칫과 VC 피드백 충돌 | VC 3/5 이상 요구 시 래칫 해제 가능 |
| 3 | VC도 합의 편향 | VC에도 강제 비관 역할 1명 (VC5 고정) |
| 4 | C1-C2 낭비 리스크 | C2에 경량 VC 사전심사 (1명) 추가 |
| 5 | 공통 메모리 오염 | 메모리 검증 에이전트 추가 |
| 6 | 강제 반대 역할 부적합 | 동적 배정 (Step 1 최고 수렴도 에이전트) |
| 7 | 대안 탐색자(R2) 소멸 | 재설계에 R2 복원 (별도 서브에이전트) |
| 8 | fact_sheet 품질 미보장 | 신뢰도 등급 (HIGH/MEDIUM/LOW) 추가 |
| 9 | VC PASS 기준 경계 문제 | FAIL 2명 이상 시 PASS 불가 조건 추가 |
| 10 | Step 0 병목 | 리서치를 2명 병렬 (시장+기술) 분리 |
| 11 | 에이전트 역할 고정 | C4부터 역할 1개 동적 교체 가능 |

---

## 전체 구조

```
┌────────────────────────────────────────────────────────────────────────┐
│                          대순환 (Macro Cycle)                           │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐ │
│  │ 공통메모리 │─>│  소순환   │─>│  재설계   │─>│ VC심사 │─>│ 메모리검증 │ │
│  │ +래칫    │  │ Step0-3  │  │ R1+R2    │  │ C2:1명 │  │ (오염방지) │ │
│  └──────────┘  └──────────┘  └──────────┘  │ C3+:5명│  └─────┬─────┘ │
│       ^                                     └────────┘        │       │
│       └───────────────────────────────────────────────────────┘       │
│                                                                         │
│  종료: (수렴 + VC PASS) 또는 VC_STALEMATE 또는 DIVERGING               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 에이전트 격리 원칙

모든 에이전트는 **격리된 서브에이전트**.

```
오케스트레이터 (메인)
  │
  ├─ 서브에이전트 생성 → 입력 전달 → 결과 수신 → 종료
  │
  ├─ 서브에이전트 간 직접 통신: ❌
  ├─ 서브에이전트 메모리 공유: ❌
  ├─ 서브에이전트 수명: 태스크 완료 시 즉시 종료
  │
  └─ 유일한 공유 경로:
       1. common_memory.md — 읽기 전용
       2. 이전 단계 산출물 — 읽기 전용
       3. 자기 산출물 — 쓰기
```

### 에이전트 입력 구조

```yaml
agent_input:
  role_prompt: "[역할 설명]"                # 역할별 고유 프롬프트
  common_memory: "[common_memory.md 전체]"  # 별도 컨텍스트로 주입 (프롬프트 아님)
  task_files: ["design_v{N}.md", ...]       # 필요 파일 목록
  output_path: "[결과 파일 경로]"
```

---

## 공통 메모리 (Common Memory)

### 파일: `common_memory.md`

```markdown
# 공통 메모리 — {프로젝트명}
## 마지막 업데이트: C{N} 완료 후

## 래칫 잠금 합의 (변경 조건: VC 3/5 이상 요구 시에만 해제)
- [C1-U1] 제품: ... — 잠금 상태: LOCKED / UNLOCKED(VC-C{N})
- [C1-U2] 기술 스택: ...

## 반복 출현 패턴 (2회 이상)
- [패턴] "..." — 등장: C1-S2, C2-S5

## VC 피드백 누적 (C2 사전심사 + C3부터 전체)
- [VC-C2-PRE] "..." — 상태: 미해소 / 해소(C{N})
- [VC-C3-001] "..." — 상태: 미해소 / 해소(C{N})

## 핵심 숫자 (신뢰도 등급 포함)
- TAM: $XX — 신뢰도: HIGH — 출처: [URL]
- 경쟁자 가격: $XX — 신뢰도: MEDIUM — 출처: [URL]

## 실패한 접근 (다시 시도하지 말 것)
- [C1] "..." — 이유: ...
```

### 업데이트 흐름

```
① 오케스트레이터가 수렴 보고서 + VC 피드백에서 추출하여 common_memory 초안 작성
      ↓
② 메모리 검증 에이전트 (서브에이전트, 1명) ← v5 신규
   - 원본 산출물과 대조하여 오해/왜곡/누락 탐지
   - 검증 완료 후 종료
      ↓
③ 검증된 common_memory가 다음 순환에 주입
```

### 래칫 해제 조건 (v5 신규)

```yaml
ratchet_unlock:
  normal_agents: "해제 불가"
  vc_agents: "3/5 이상의 VC가 동일 래칫 항목의 변경을 요구하면 해제"
  process:
    - 해당 래칫에 "[래칫해제-VC-C{N}]" 태그
    - 다음 순환에서 해당 항목 재논의 허용
    - 소순환 에이전트에게 "이 항목은 VC에 의해 재논의가 열렸다" 고지
  limit: "한 순환에 최대 2개 래칫만 해제 가능 (발산 방지)"
```

---

## Phase 0: 초기화

1. 사용자 시드 수집
2. 에이전트 역할 생성 (role_generator.md 참조)
3. 초기 설계문서 v0 생성
4. common_memory.md 초기화 (빈 파일, 섹션 헤더만)

---

## Phase 1: 소순환 (Minor Cycle) — 4 스텝

```
Step 0: 리서치 (2명 병렬) ← v5: 1명→2명
    ↓
Step 1: 독립 분석 (5명 병렬)
    ↓
Step 2: 교차 비판 (5명 병렬, 강제 반대 1명 동적 배정)
    ↓
Step 3: 수렴 (1명)
```

### Step 0: 리서치 (v5: 2명 병렬)

| 에이전트 | 초점 | 출력 |
|---------|------|------|
| R-시장 | 경쟁자 가격, TAM, 고객 사례, 시장 트렌드 | `step0/fact_sheet_market.md` |
| R-기술 | 기술 스택 현황, API 가격, 규제, 특허 | `step0/fact_sheet_tech.md` |

합산: 오케스트레이터가 두 파일을 `step0/fact_sheet.md`로 머지.

**신뢰도 등급 필수 (v5)**:
```markdown
- [사실] — 신뢰도: HIGH (공식 문서/1차 출처)
- [사실] — 신뢰도: MEDIUM (뉴스 기사/2차 출처)
- [사실] — 신뢰도: LOW (단일 블로그/미확인)
```
Step 1 에이전트는 LOW 신뢰도 사실을 근거로 사용할 때 **명시적 경고** 필수.

### Step 1: 독립 분석

- 5명 병렬 서브에이전트, 각각 완료 후 종료
- 입력: design_v{N} + fact_sheet + common_memory
- 출력: `step1/agent_{1-5}.md`

### Step 2: 교차 비판 (v5: 동적 강제 반대)

**강제 반대 배정 방식 변경 (v5)**:

```yaml
forced_dissent_selection: "dynamic"
rule: |
  Step 1에서 가장 높은 수렴도를 자기평가한 에이전트가
  Step 2에서 강제 반대(Forced Dissenter)를 수행한다.
  이유: 가장 동의하는 사람이 반대를 맡아야 자기 확신의 사각지대를 노출한다.
  동점 시: 슬롯 번호가 높은 에이전트 (S5 > S4 > ...)
```

강제 반대자 출력:
```markdown
# [에이전트명] 교차 비판 — C{N} [★ 강제 반대: 수렴도 {X}/10 최고 → 자기반박]

## 강제 반박
### 내가 Step 1에서 동의한 "[합의]"에 대한 자기반박
- 반론: [...]
- 근거: [...]
- 반론 강도: [1-10]
```

나머지 4명 + 강제 반대자의 반론에 대한 응답 필수.

### Step 3: 수렴

- 1명 서브에이전트, 완료 후 종료
- 입력: step0 + step1 + step2 + common_memory
- **강제 반론은 개별 채택/기각 판정 필수**
- 출력: `step3/convergence.md`

---

## Phase 2: 재설계 (v5: R2 복원)

```
┌──────────────────┐  ┌──────────────────┐
│ R1: 변경 적용자   │  │ R2: 대안 탐색자   │  ← v5 복원
│ (합의 변경 반영)  │  │ (새로운 접근 제안) │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         └──────────┬──────────┘
                    v
         ┌──────────────────────┐
         │  합성 에이전트         │
         │  R1 + R2 → v(N+1)    │
         └──────────────────────┘
```

- **R1** (서브에이전트): 변경 명세를 기계적으로 적용. 자의적 추가 금지.
- **R2** (서브에이전트): 미해결 쟁점 + VC 피드백에서 **에이전트가 제안하지 않은 새 접근** 탐색. 모든 대안에 `[대안]` 태그.
- **합성** (서브에이전트): R1 + R2를 통합하여 v(N+1) 생성.
- 입력: design_v{N} + convergence + common_memory + (있으면) VC 피드백
- 출력: `output_doc.md`

---

## Phase 2.5: VC 심사

### C2: 경량 사전심사 (v5 신규)

```
C1: VC 심사 없음
C2: ★ 경량 사전심사 (1명, YC 파트너만)
    → PASS/FAIL이 아닌 "방향성 피드백"만 제공
    → common_memory에 [VC-PRE] 태그로 추가
    → 다음 순환 에이전트가 조기에 방향 보정 가능
C3+: 전체 VC 심사 (5명)
```

경량 사전심사 출력:
```markdown
# VC 사전심사 — YC 파트너
# C2, design v2

## 방향성 평가 (PASS/FAIL 아님)
- 이 방향으로 계속 가도 되는가? [YES/PIVOT/RETHINK]
- 가장 큰 우려 3가지:
  1. [...]
  2. [...]
  3. [...]
- "이것만 보완하면 C3 심사에서 유리하다":
  1. [...]
  2. [...]
```

### C3+: 전체 VC 심사 (5명)

| 슬롯 | 역할 | 관점 |
|------|------|------|
| VC1 | YC 파트너 | "YC에 뽑겠는가?" |
| VC2 | 시드 VC | "$2M 체크를 쓰겠는가?" |
| VC3 | 그로스 VC | "Series A까지 가는가?" |
| VC4 | 기술 DD 전문가 | "기술적 해자가 있는가?" |
| VC5 | **시니어 엔젤 [상시 비관]** | "왜 이건 안 되는가?" ← v5: 강제 비관 고정 |

**VC5 강제 비관 역할 (v5 신규)**:
```yaml
vc5_forced_pessimist:
  rule: |
    VC5는 항상 가장 비관적 관점에서 심사한다.
    다른 4명이 전부 PASS해도 VC5는 독립적으로 최악의 시나리오를 제시해야 한다.
    VC5의 비관적 피드백은 common_memory에 별도 섹션으로 기록된다.
  purpose: "5명이 같은 LLM이므로 구조적으로 비관 관점을 보장"
```

### 각 VC 출력 형식

```markdown
# VC 심사서 — [역할명]

## 심사 항목별 점수 (각 1-10)
- 시장 규모: [점수] — [근거]
- 경쟁 우위: [점수] — [근거]
- 비즈니스 모델: [점수] — [근거]
- 성장 전략: [점수] — [근거]
- 팀/실행력: [점수] — [근거]
- 재무 계획: [점수] — [근거]
- 리스크: [점수] — [근거]
- 타이밍: [점수] — [근거]

## 종합 점수: [1-10]
## 판정: PASS / CONDITIONAL / FAIL

## 핵심 피드백 (다음 순환 반영)
1. [...]

## 래칫 해제 요구 (해당 시)
- "[래칫 항목]"을 재논의해야 하는 이유: [...]
```

### 종합 판정 로직 (v5 개정)

```python
def vc_review_verdict(vc_scores: list[int]) -> str:
    avg = sum(vc_scores) / len(vc_scores)
    passes = sum(1 for s in vc_scores if s >= 7)
    fails = sum(1 for s in vc_scores if s <= 4)

    # v5 추가: FAIL 2명 이상이면 PASS 불가
    if fails >= 2:
        return "FAIL"

    # 과반 PASS + 평균 6.0+
    if passes >= 3 and avg >= 6.0:
        return "PASS"

    # 과반 FAIL
    if fails >= 3:
        return "FAIL"

    return "CONDITIONAL"
```

### 래칫 해제 집계

```python
def check_ratchet_unlock(vc_reviews: list, locked_items: list) -> list:
    """VC 3/5 이상이 동일 래칫 해제를 요구하면 해제"""
    unlock_requests = {}
    for review in vc_reviews:
        for item in review.ratchet_unlock_requests:
            unlock_requests[item] = unlock_requests.get(item, 0) + 1

    unlocked = []
    for item, count in unlock_requests.items():
        if count >= 3 and len(unlocked) < 2:  # 한 순환 최대 2개
            unlocked.append(item)
    return unlocked
```

---

## Phase 2.75: 메모리 검증 (v5 신규)

VC 심사 후, common_memory 업데이트 전에 검증 에이전트가 오염을 방지.

```
오케스트레이터: common_memory 초안 작성
      ↓
메모리 검증 에이전트 (서브에이전트 1명, 완료 후 종료)
  입력: common_memory 초안 + 원본 산출물 (convergence + vc_reviews)
  검증:
    - 원본에 없는 주장이 추가되지 않았는가?
    - 래칫 잠금/해제가 정확한가?
    - VC 피드백이 왜곡 없이 기록되었는가?
    - 신뢰도 등급이 적절한가?
  출력: 검증 보고서 + 수정된 common_memory
      ↓
오케스트레이터: 검증된 common_memory 확정
```

---

## Phase 3: 수렴 판정 (v5 개정)

```python
def should_terminate(metrics, cycle_num, vc_verdict=None,
                     vc_conditional_streak=0):

    # v5: VC 교착 탈출 — CONDITIONAL 3회 연속 시 강제 종료
    if vc_conditional_streak >= 3:
        return True, "VC_STALEMATE"

    # 발산 감지: 3회 연속 delta 증가
    if cycle_num >= 4 and metrics.delta_trend_3consecutive == "increasing":
        return True, "DIVERGING"

    # C1: 항상 CONTINUE
    if cycle_num < 2:
        return False, "CONTINUE"

    # C2: 사전심사 피드백 반영 후 CONTINUE
    if cycle_num == 2:
        return False, "CONTINUE"

    # C3+: 수렴 AND VC PASS 필요
    convergence_ok = (
        metrics.delta < 0.20 and
        metrics.critical_remaining == 0 and
        metrics.convergence_avg >= 7.0
    )
    vc_ok = (vc_verdict == "PASS")

    if convergence_ok and vc_ok:
        return True, "CONVERGED"
    if metrics.delta < 0.05 and vc_ok:
        return True, "EARLY_CONVERGED"

    return False, "CONTINUE"
```

### 종료 유형

| 종료 유형 | 조건 | 출력 |
|----------|------|------|
| **CONVERGED** | 수렴 + VC PASS | 최종 설계문서 (신뢰도 HIGH) |
| **EARLY_CONVERGED** | delta<5% + VC PASS | 최종 설계문서 (신뢰도 HIGH) |
| **VC_STALEMATE** | VC CONDITIONAL 3회 연속 | 최신 문서 + 미해소 VC 피드백 (신뢰도 MEDIUM) |
| **DIVERGING** | 3회 연속 delta 증가 | 최고 수렴 버전 + 발산 분석 (신뢰도 LOW) |

---

## 에이전트 역할 동적 교체 (v5 신규)

### Phase 0: 5개 역할 생성 (기존과 동일)

### C4부터: 1개 슬롯 동적 교체 가능

```yaml
role_swap:
  trigger: "C4 이후, 특정 도메인의 논점이 3회 이상 미해결"
  max_swaps: 1  # 한 순환에 1개만
  process:
    1. Step 3 수렴 보고서에서 미해결 논점의 도메인 식별
    2. 해당 도메인 전문가로 가장 기여도가 낮은 슬롯을 교체
    3. 교체 이력을 common_memory에 기록
  examples:
    - "법률 이슈 3회 미해결 → S3(수익 엔지니어)를 법률 전문가로 교체"
    - "인프라 이슈 3회 미해결 → S1(시장 탐색자)를 DevOps 전문가로 교체"
  revert: "교체 후 2순환 내 해소되면 원래 역할로 복귀 가능"
```

---

## 전체 실행 흐름 (v5)

```
사용자 입력 (시드)
    │
    v
[Phase 0] 초기화
    ├── v0 + agents.yaml + common_memory 초기화
    │
    v
┌───────── C1 (구조 확정) ────────────────┐
│ common_memory 주입                       │
│ Phase 1: 소순환                          │
│   Step 0: 리서치 2명 병렬 (시장+기술)    │
│   Step 1: 분석 5명 병렬                  │
│   Step 2: 비판 5명 (동적 강제 반대 1명)  │
│   Step 3: 수렴                           │
│ Phase 2: 재설계 (R1 + R2 + 합성)        │
│ Phase 2.75: 메모리 검증                  │
│ Phase 3: → CONTINUE                      │
└──────────────────────────────────────────┘
    │
    v
┌───────── C2 (현실화 + 사전심사) ─────────┐
│ common_memory 주입 (C1 래칫 포함)        │
│ Phase 1: 소순환                          │
│ Phase 2: 재설계 → v2                     │
│ Phase 2.5: ★경량 VC 사전심사 (1명)      │
│   → 방향성 피드백 → common_memory        │
│ Phase 2.75: 메모리 검증                  │
│ Phase 3: → CONTINUE                      │
└──────────────────────────────────────────┘
    │
    v
┌───────── C3 (★전체 VC 심사 시작) ────────┐
│ common_memory 주입 (VC 사전피드백 포함)   │
│ Phase 1: 소순환                          │
│ Phase 2: 재설계 → v3                     │
│ Phase 2.5: ★전체 VC 심사 (5명)          │
│   VC5는 상시 비관 역할                    │
│   → CONDITIONAL                          │
│   → 피드백 + 래칫 해제 검토              │
│ Phase 2.75: 메모리 검증                  │
│ Phase 3: → CONTINUE                      │
└──────────────────────────────────────────┘
    │
    v
┌───────── C4+ (VC 피드백 반영) ───────────┐
│ common_memory 주입 (VC 피드백 전체 포함)  │
│ 해제된 래칫이 있으면 재논의               │
│ 역할 동적 교체 가능 (1슬롯)              │
│ Phase 1 → 2 → 2.5 → 2.75 → 3           │
│   → PASS → CONVERGED ✓                   │
│   또는 CONDITIONAL streak 3 → VC_STALEMATE│
└──────────────────────────────────────────┘
    │
    v
[Phase 4] 최종 출력
    ├── design_final.md
    ├── evolution_log.md
    ├── common_memory.md (최종)
    └── vc_review_history.md
```

---

## 파일 구조 (v5)

```
ideas/{idea-slug}/
├── seed.yaml
├── agents.yaml
├── common_memory.md                     ← 순환 간 누적, 검증됨
├── design_v0.md
│
├── cycle_1/
│   ├── minor/
│   │   ├── step0/
│   │   │   ├── fact_sheet_market.md     ← v5: 시장 리서치
│   │   │   ├── fact_sheet_tech.md       ← v5: 기술 리서치
│   │   │   └── fact_sheet.md            ← 머지본
│   │   ├── step1/agent_{1-5}.md
│   │   ├── step2/agent_{1-5}.md
│   │   └── step3/convergence.md
│   ├── redesign/
│   │   ├── draft_r1.md                  ← R1 변경 적용
│   │   ├── draft_r2.md                  ← v5 복원: R2 대안 탐색
│   │   └── synthesis.md                 ← 합성 기록
│   ├── memory_verification.md           ← v5: 메모리 검증 보고서
│   ├── output_doc.md
│   └── metrics.yaml
│
├── cycle_2/
│   ├── minor/ ...
│   ├── redesign/ ...
│   ├── vc_review/
│   │   └── vc_pre_screening.md          ← v5: 경량 사전심사
│   ├── memory_verification.md
│   ├── output_doc.md
│   └── metrics.yaml
│
├── cycle_3+/
│   ├── minor/ ...
│   ├── redesign/ ...
│   ├── vc_review/
│   │   ├── vc1_yc_partner.md
│   │   ├── vc2_seed_vc.md
│   │   ├── vc3_growth_vc.md
│   │   ├── vc4_tech_dd.md
│   │   ├── vc5_angel_pessimist.md       ← v5: 상시 비관
│   │   └── verdict.md
│   ├── memory_verification.md
│   ├── output_doc.md
│   └── metrics.yaml
│
├── design_final.md
├── evolution_log.md
└── vc_review_history.md
```

---

## 오케스트레이터 실행 절차 (v5)

```
1. seed.yaml 읽기
2. Phase 0: v0 + agents.yaml + common_memory 초기화
3. cycle = 1, vc_conditional_streak = 0
4. WHILE not terminated:

   a. common_memory.md 읽기

   b. Phase 1: 소순환
      - Step 0: 리서치 2명 병렬 (시장+기술) → fact_sheet 머지
      - Step 1: 분석 5명 병렬
      - Step 2: 비판 5명 (Step 1 최고 수렴도 에이전트가 강제 반대)
      - Step 3: 수렴

   c. Phase 2: 재설계
      - R1(변경 적용) + R2(대안 탐색) 병렬 → 합성 → v(N+1)

   d. Phase 2.5: VC 심사
      - if cycle == 2: 경량 사전심사 (1명)
      - if cycle >= 3: 전체 심사 (5명, VC5 상시 비관)
        - 종합 판정
        - 래칫 해제 검토
        - if CONDITIONAL: vc_conditional_streak += 1
        - if PASS or FAIL: vc_conditional_streak = 0

   e. Phase 2.75: 메모리 검증
      - 오케스트레이터 common_memory 초안 → 검증 에이전트 → 확정

   f. Phase 3: 수렴 판정
      - should_terminate(metrics, cycle, vc_verdict, vc_conditional_streak)

   g. if cycle >= 4: 역할 동적 교체 검토

   h. cycle += 1

5. Phase 4: 최종 중간 산출물
   - design_final.md (원본, source of truth)
   - evolution_log.md
   - common_memory.md
   - vc_review_history.md

6. Phase 5: 문서 분화 (가이드북 생성)
   - 4명 분화 에이전트 병렬:
     a. 내부 운영 에이전트 → ops_guide + roadmap + runbook + kpi_dashboard
     b. 외부 설명 에이전트 → pitch_deck + one_pager + partner_proposal + faq
     c. 재무 보정 에이전트 → financial_model (숫자 일관성 검증+보정+출처)
     d. 법무/데이터 에이전트 → legal_checklist + data_dictionary + risk_register
   - 1명 검증 에이전트:
     → 문서 간 숫자 일치, 용어 통일, 상호 참조 확인
   - 하네스 메타(사이클, 래칫, 수렴도, VC 점수 등) 전부 제거

7. Phase 6: PDF 변환
   - 모든 .md → .pdf 일괄 변환
   - 도구: pandoc + LaTeX 또는 md-to-pdf
   - 브랜딩: 프로젝트명 헤더, 작성일, 페이지 번호
   - 외부 문서(pitch_deck, one_pager, partner_proposal)는 추가 스타일링
```

---

## Phase 5: 문서 분화 레이어 (v6 신규)

### 목적
design_final.md(하나의 거대 문서)를 **용도별 12개 실행 문서**로 분화한다.
하네스 메타를 제거하고, 각 독자(창업자/팀/투자자/파트너)에 최적화된 형태로 재구성한다.

### 분화 구조

```
design_final.md (Phase 4 산출물, source of truth)
       │
  [4명 분화 에이전트 병렬] ← 모두 격리 서브에이전트
  │
  ├── 내부 운영 에이전트
  │   ├── guidebook/ops_guide.md        ← 일상 운영 매뉴얼
  │   ├── guidebook/roadmap.md          ← 주차/월별 실행 로드맵
  │   ├── guidebook/runbook.md          ← 기술 운영 (배포/모니터링/장애대응)
  │   └── guidebook/kpi_dashboard.md    ← 핵심 지표 정의 + 목표 + 리뷰 주기
  │
  ├── 외부 설명 에이전트
  │   ├── guidebook/pitch_deck.md       ← 투자자 피칭 (10-15 슬라이드 구조)
  │   ├── guidebook/one_pager.md        ← 1페이지 요약 (30초에 읽히는)
  │   ├── guidebook/partner_proposal.md ← B2B 파트너/고객 제안서
  │   └── guidebook/faq.md             ← 투자자/고객/파트너별 예상 Q&A
  │
  ├── 재무 보정 에이전트
  │   └── guidebook/financial_model.md  ← 보정된 숫자, 민감도, P&L, 출처
  │       - MRR→ARR 일관 계산
  │       - 시나리오 간 숫자 동기화
  │       - 모든 가정에 출처 또는 [추정: 근거] 태그
  │
  └── 법무/데이터 에이전트
      ├── guidebook/legal_checklist.md  ← 법인, 이용약관, 개인정보, DSAR, 계약
      ├── guidebook/data_dictionary.md  ← DB 스키마, API 스펙, 데이터 품질 KPI
      └── guidebook/risk_register.md    ← 리스크 대장 (확률×영향, 완화, 소유자)

       │
  [1명 검증 에이전트]
  └── 12개 문서 간 교차 검증
      - 숫자 일치 (financial_model ↔ roadmap ↔ one_pager)
      - 용어 통일 (제품명, 가격, 타겟 고객)
      - 상호 참조 (ops_guide의 KPI ↔ kpi_dashboard 정의)
      - 하네스 메타 잔존 최종 검수
```

### 각 문서 상세 스펙

#### 내부 운영 문서 (창업자/팀용)

**ops_guide.md — 운영 매뉴얼**
```
대상 독자: 창업자, 공동 창업자, 초기 팀원
내용:
  - Day 0 체크리스트 (법인, 계정, 도구 설정)
  - Day 1-7 시간별 실행 계획
  - 주간 루틴 (월: 계획, 수: 실행 검토, 금: 회고)
  - 월간 리뷰 템플릿
  - 의사결정 기준표 (계속/감속/피봇/중단)
  - 번아웃 방지 가이드 (주간 시간 캡, 의무 휴식)
톤: 실용적, 체크리스트 중심, 즉시 실행 가능
```

**roadmap.md — 실행 로드맵**
```
대상 독자: 창업자, 팀, 어드바이저
내용:
  - 12개월 마일스톤 (월별)
  - 주차별 상세 (M1-M3)
  - 의존성 매트릭스 (A를 해야 B 가능)
  - 각 마일스톤의 완료 기준 (체크 가능한 조건)
  - 담당자 (1인일 때는 우선순위)
톤: 간트차트 느낌, 명확한 기한과 기준
하네스 메타 금지: 사이클/래칫/수렴도 등 전부 제거
```

**runbook.md — 기술 운영 매뉴얼**
```
대상 독자: 개발자 (창업자 본인 + 미래 팀원)
내용:
  - 로컬 개발 환경 설정 (1페이지)
  - 배포 프로세스 (CI/CD, 환경별)
  - 모니터링 + 알림 설정
  - 장애 대응 플레이북 (장애 유형별)
  - 데이터 파이프라인 운영 (수집/정규화/매칭)
  - 백업/복구 절차
  - API 관리 (키, 레이트 리밋, 버전)
톤: 기술 문서, 복붙 가능한 명령어
```

**kpi_dashboard.md — 핵심 지표**
```
대상 독자: 창업자, 어드바이저, 투자자
내용:
  - 핵심 지표 5-10개 (정의, 측정 방법, 목표값)
  - 리뷰 주기 (주간/월간/분기)
  - 대시보드 구성 (어떤 도구로 어디서 보는가)
  - 알림 기준 (이 숫자가 이 아래로 가면 경고)
톤: 간결, 테이블 중심
```

#### 외부 설명 문서 (투자자/파트너/고객용)

**pitch_deck.md — 투자자 피칭**
```
대상 독자: VC, 엔젤, 그랜트 심사관
구조 (10-15 슬라이드):
  1. 한 줄 피치
  2. 문제
  3. 솔루션
  4. 데모 / 스크린샷
  5. 시장 규모 (TAM→SAM→SOM)
  6. 비즈니스 모델
  7. 트랙션 / 마일스톤
  8. 경쟁 환경
  9. 팀
  10. 재무 전망
  11. Ask (필요 자금 + 용도)
톤: 간결, 임팩트, 숫자 중심
```

**one_pager.md — 1페이지 요약**
```
대상 독자: 콜드 이메일 첨부, 네트워킹 이벤트
내용: 피치 덱의 핵심을 A4 1장에 압축
구조: 문제 → 솔루션 → 시장 → 모델 → 팀 → Ask
톤: 30초에 읽히는, 임팩트 최대화
```

**partner_proposal.md — 파트너십 제안서**
```
대상 독자: B2B 고객, 대회사, 미디어 파트너
내용:
  - 상대방에게 주는 가치 (노출, 데이터, 트래픽)
  - 우리가 필요한 것 (데이터, 로고 사용, API)
  - 협력 구조 (수수료, 공동 마케팅, 통합)
  - 성공 사례 (있으면)
톤: 상대방 중심, "당신에게 이득입니다"
```

**faq.md — 자주 묻는 질문**
```
대상 독자: 모든 외부 이해관계자
구조:
  - 투자자 FAQ (10개): 시장, 경쟁, 매출, 팀
  - 고객 FAQ (10개): 가격, 기능, 보안, 지원
  - 파트너 FAQ (5개): 통합, 데이터, 계약
톤: 명확한 Q&A, 1-3문장 답변
```

#### 보조 문서 (숫자/법무/기술)

**financial_model.md — 재무 모델**
```
내용:
  - 월별 P&L (18개월, 3 시나리오)
  - MRR → ARR(×12) 일관 계산
  - 유닛 이코노미 (CAC, LTV, LTV:CAC, 회수 기간)
  - 민감도 분석 (토네이도 차트)
  - 비용 상세 (월별, 카테고리별)
  - 자금 소진율 (burn rate) + 런웨이
  - 모든 가정에 출처 또는 [추정: 근거]
특수 규칙: 이 에이전트만 design_final의 숫자를 보정할 수 있음
```

**legal_checklist.md — 법무 체크리스트**
```
내용:
  - 법인 설립 (유형, 관할, 비용, 일정)
  - 이용약관 / 개인정보처리방침 (항목 체크리스트)
  - DSAR 처리 프로세스 (접수→분류→확인→처리→응답, SLA)
  - 데이터 수집 법적 근거 (국가별)
  - 계약 템플릿 목록 (고객, 파트너, 직원, NDA)
  - 규제 모니터링 일정
```

**data_dictionary.md — 데이터 사전**
```
내용:
  - DB 스키마 (테이블, 컬럼, 타입, 설명)
  - API 엔드포인트 목록 (메서드, 경로, 파라미터, 응답)
  - 데이터 품질 KPI (match precision, freshness, provenance)
  - 수집 정책 (소스별 주기, 방법, 법적 근거)
  - 데이터 흐름 다이어그램
```

**risk_register.md — 리스크 대장**
```
내용:
  - 리스크 목록 (ID, 설명, 카테고리)
  - 확률 × 영향 매트릭스 (히트맵)
  - 완화 전략 (각 리스크별)
  - 소유자 (누가 모니터링하는가)
  - 리뷰 주기 (월간)
  - 트리거 이벤트 (이 일이 발생하면 이 리스크 재평가)
```

### 분화 규칙

1. **design_final = 원본(Source of Truth)**: 분화 문서는 추출+재구성이지 새 내용 추가가 아님
2. **예외: financial_model**: 숫자 불일치를 발견하면 보정 가능. 보정 시 `[보정: 이유]` 태그
3. **하네스 메타 완전 제거**: 사이클, 래칫, 수렴도, 에이전트 ID, VC 점수, 버전 비교 — 모두 삭제
4. **상호 참조**: 문서 간 같은 숫자는 반드시 일치. 검증 에이전트가 확인

---

## Phase 6: PDF 변환 (v6 신규)

### 목적
모든 .md 파일을 전문적인 .pdf로 변환하여 외부 공유 가능한 형태로 제작한다.

### 변환 도구

```bash
# 옵션 1: pandoc + LaTeX (고품질, 커스텀 스타일링)
pandoc input.md -o output.pdf \
  --pdf-engine=xelatex \
  --template=template.tex \
  -V mainfont="Pretendard" \
  -V geometry:margin=2.5cm \
  --toc --toc-depth=3

# 옵션 2: md-to-pdf (간편, Node.js)
npx md-to-pdf input.md --stylesheet style.css

# 옵션 3: prince (웹 렌더링 기반, 가장 예쁨)
prince input.html -o output.pdf
```

### PDF 스타일링

| 문서 유형 | 스타일 | 헤더 | 특수 처리 |
|----------|--------|------|----------|
| 내부 운영 | 심플, 모노스페이스 | 프로젝트명 + INTERNAL | 코드 블록 하이라이팅 |
| pitch_deck | 임팩트, 큰 글씨 | 로고 + 태그라인 | 슬라이드 레이아웃 |
| one_pager | 2컬럼, 컴팩트 | 로고 + 연락처 | A4 1장 강제 |
| partner_proposal | 포멀, 서한 형식 | 양사 로고 | 서명란 |
| financial_model | 테이블 최적화 | 기밀 워터마크 | 차트 렌더링 |
| legal | 법률 문서 스타일 | 법인명 + 날짜 | 조항 번호 매김 |

### 변환 프로세스

```
guidebook/*.md
      │
  [스타일 적용]
  ├── 내부 문서: internal_style.css
  ├── 외부 문서: external_style.css
  └── 법무 문서: legal_style.css
      │
  [PDF 변환] (pandoc / md-to-pdf)
      │
  guidebook/pdf/
  ├── ops_guide.pdf
  ├── roadmap.pdf
  ├── runbook.pdf
  ├── kpi_dashboard.pdf
  ├── pitch_deck.pdf
  ├── one_pager.pdf
  ├── partner_proposal.pdf
  ├── faq.pdf
  ├── financial_model.pdf
  ├── legal_checklist.pdf
  ├── data_dictionary.pdf
  └── risk_register.pdf
```

### 필수 설치

```bash
# pandoc + xelatex
# Windows:
choco install pandoc miktex

# 또는 md-to-pdf (더 간편):
npm install -g md-to-pdf

# 한글 폰트 (Pretendard 추천)
# https://github.com/orioncactus/pretendard
```

---

## 최종 파일 구조 (v6, Phase 5+6 포함)

```
ideas/{idea-slug}/
├── seed.yaml
├── agents.yaml
├── common_memory.md
├── design_v0.md
├── cycle_1/ ... cycle_N/
├── design_final.md                      ← Phase 4: 원본 (source of truth)
├── evolution_log.md
├── vc_review_history.md
│
└── guidebook/                           ← Phase 5: 분화된 가이드북
    ├── ops_guide.md                     ← 내부: 운영 매뉴얼
    ├── roadmap.md                       ← 내부: 실행 로드맵
    ├── runbook.md                       ← 내부: 기술 운영
    ├── kpi_dashboard.md                 ← 내부: 핵심 지표
    ├── pitch_deck.md                    ← 외부: 투자자 피칭
    ├── one_pager.md                     ← 외부: 1페이지 요약
    ├── partner_proposal.md              ← 외부: 파트너 제안서
    ├── faq.md                           ← 외부: FAQ
    ├── financial_model.md               ← 보조: 재무 모델 (보정됨)
    ├── legal_checklist.md               ← 보조: 법무 체크리스트
    ├── data_dictionary.md               ← 보조: 데이터 사전
    ├── risk_register.md                 ← 보조: 리스크 대장
    ├── cross_validation.md              ← 검증: 문서 간 일치 보고서
    │
    └── pdf/                             ← Phase 6: PDF 변환본
        ├── ops_guide.pdf
        ├── roadmap.pdf
        ├── runbook.pdf
        ├── kpi_dashboard.pdf
        ├── pitch_deck.pdf
        ├── one_pager.pdf
        ├── partner_proposal.pdf
        ├── faq.pdf
        ├── financial_model.pdf
        ├── legal_checklist.pdf
        ├── data_dictionary.pdf
        └── risk_register.pdf
```

| 순환 | Step0 | Step1 | Step2 | Step3 | 재설계 | VC | 메모리검증 | 합계 |
|------|-------|-------|-------|-------|--------|----|----------|------|
| C1 | 2 | 5 | 5 | 1 | 3 | 0 | 1 | **17** |
| C2 | 2 | 5 | 5 | 1 | 3 | 1 | 1 | **18** |
| C3+ | 2 | 5 | 5 | 1 | 3 | 5+1 | 1 | **23/회** |

| 시나리오 | 순환 수 | 총 호출 |
|---------|--------|---------|
| 빠른 (C3 PASS) | 3 | ~58 |
| 일반적 (C4 PASS) | 4 | ~81 |
| 까다로운 (C6 PASS) | 6 | ~127 |
| VC_STALEMATE (C6) | 6 | ~127 |
| 상한 | ∞ | ∞ (발산/교착으로만 종료) |

---

## v4 → v5 변경 이력

| 항목 | v4 | v5 |
|------|-----|-----|
| VC 교착 처리 | 없음 (무한 루프 가능) | **CONDITIONAL 3연속 → VC_STALEMATE 종료** |
| 래칫 해제 | 불가능 | **VC 3/5 요구 시 해제 (순환당 최대 2개)** |
| VC 합의 편향 | 대응 없음 | **VC5 상시 비관 + FAIL 2명 시 PASS 불가** |
| C2 VC | 없음 | **경량 사전심사 1명 (방향성 피드백)** |
| 공통 메모리 검증 | 없음 | **메모리 검증 에이전트 (오염 방지)** |
| 강제 반대 배정 | 고정 로테이션 | **동적: Step 1 최고 수렴도 에이전트** |
| 재설계 | 단일 에이전트 | **R1(변경) + R2(대안) + 합성 (3명)** |
| fact_sheet | 1명, 신뢰도 없음 | **2명 병렬 + 신뢰도 등급 (HIGH/MED/LOW)** |
| VC PASS 기준 | FAIL 2명도 통과 가능 | **FAIL 2명 이상 → PASS 불가** |
| Step 0 | 1명 순차 | **2명 병렬 (시장+기술)** |
| 에이전트 역할 | 고정 | **C4부터 1슬롯 동적 교체 가능** |
| 문서 분화 | 없음 | **Phase 5: design_final → 12개 가이드북 (4에이전트+1검증)** |
| PDF 변환 | 없음 | **Phase 6: 모든 .md → .pdf (pandoc/md-to-pdf)** |
| 최종 산출물 | design_final 1개 | **design_final + guidebook/ 12개 .md + pdf/ 12개 .pdf** |
