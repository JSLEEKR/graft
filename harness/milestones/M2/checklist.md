# M2: "실무에서 써볼 만하다"

> 목표: 실제 시나리오에서 Graft가 수동 구성보다 낫다는 것을 증명

## Checklist

- ~~**M2-1: VS Code 확장 배포** — 제외 (사용자 결정)~~

- [ ] **M2-2: npm org `graft-lang` 설정**
  - [ ] npm 웹에서 org 생성
  - [ ] `@graft-lang/graft`로 패키지 이전 (또는 별도 publish)
  - [ ] README/docs 업데이트

- [ ] **M2-3: 실전 예제 보강**
  - [x] 3개 예제 존재 (content-pipeline, data-analysis, pr-summarizer) — v5.6
  - [ ] 각 예제별 실제 Claude Code e2e 검증
  - [ ] 예제별 README/설명 추가

- [x] **M2-4: 조건부 edge codegen**
  - [x] Router hook 생성 (조건 평가 → 라우팅 결정 파일)
  - [x] Orchestration에 조건부 분기 설명 포함
  - [x] Settings에 router hook 등록
  - [x] Agent input overrides에 조건부 타겟 포함

- [x] **M2-5: Hook auto-execution 검증**
  - [x] PostToolUse `if` 패턴 문법 확인 (Claude Code 문서 기준)
  - [x] M1 e2e에서 실제 자동 트리거 확인됨

- [x] **M2-6: 에러 메시지 개선**
  - [x] rustc 스타일 에러 포맷 (`-->`, `^^^`, `= help:`)
  - [x] "did you mean?" 제안 (Levenshtein 기반)

- [x] **M2-7: `graft watch`**
  - [x] 파일 변경 시 자동 재컴파일 (debounce 100ms)
  - [x] 같은 디렉토리 .gft import 파일 변경도 감지

- [x] **M2-8: `graft visualize`**
  - [x] 파이프라인 DAG → Mermaid 다이어그램 출력
  - [x] 노드 (모델 표시), 엣지 (변환 표시), 조건부 분기, 병렬 블록

## Verification Criteria

**"실무 테스트"**: 실제 업무 시나리오에서:
1. `.gft` 파일 작성 (기존 예제 참고)
2. `graft compile` → Claude Code 실행
3. 결과가 수동 구성 대비 개선되었는가?
4. 전체 과정에서 마찰 지점은?
