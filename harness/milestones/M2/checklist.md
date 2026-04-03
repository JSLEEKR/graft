# M2: "실무에서 써볼 만하다"

> 목표: 실제 시나리오에서 Graft가 수동 구성보다 낫다는 것을 증명

## Checklist

- [ ] **M2-1: VS Code 확장 배포** (M1에서 이관)
  - [ ] marketplace publisher 등록
  - [ ] `vsce package` → `.vsix` 생성 확인
  - [ ] `vsce publish`
  - [ ] marketplace에서 검색/설치 가능 확인

- [ ] **M2-2: npm org `graft-lang` 설정**
  - [ ] npm 웹에서 org 생성
  - [ ] `@graft-lang/graft`로 패키지 이전 (또는 별도 publish)
  - [ ] README/docs 업데이트

- [ ] **M2-3: 실전 예제 보강**
  - [x] 3개 예제 존재 (content-pipeline, data-analysis, pr-summarizer) — v5.6
  - [ ] 각 예제별 실제 Claude Code e2e 검증
  - [ ] 예제별 README/설명 추가

- [ ] **M2-4: 조건부 edge codegen**
  - [ ] `when risk >= 0.7 -> Reviewer` 등 조건부 라우팅 로직 생성
  - [ ] 현재: 파싱은 됨, codegen 미구현

- [ ] **M2-5: Hook auto-execution 검증**
  - [ ] PostToolUse `if` 패턴이 Claude Code에서 자동 트리거되는지 확인
  - [ ] glob 패턴 매칭 정확도 검증

- [ ] **M2-6: 에러 메시지 개선**
  - [ ] rustc 스타일 에러 포맷 (`-->`, `^^^`, `= help:`)
  - [ ] "did you mean?" 제안

- [ ] **M2-7: `graft watch`** (P2)
  - [ ] 파일 변경 시 자동 재컴파일

- [ ] **M2-8: `graft visualize`** (P2)
  - [ ] 파이프라인 DAG → Mermaid 다이어그램 출력

## Verification Criteria

**"실무 테스트"**: 실제 업무 시나리오에서:
1. `.gft` 파일 작성 (기존 예제 참고)
2. `graft compile` → Claude Code 실행
3. 결과가 수동 구성 대비 개선되었는가?
4. 전체 과정에서 마찰 지점은?
