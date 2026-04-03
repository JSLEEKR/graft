# M1 Version Plan (v5.3~v5.6)

## Current State (post v5.2)
- ✅ M1-2 partial: hello.gft e2e 성공, parallel codegen 수정됨
- ✅ M1-6: graft init 완료
- ❌ M1-2 remaining: codegen 테스트 보강, chatbot.gft memory codegen 검증
- ❌ M1-4: e2e 데모 문서화
- ❌ M1-1: npm publish
- ❌ M1-3: README 재작성
- ❌ M1-5: VS Code 확장 배포

---

## v5.3 — Codegen 테스트 보강 + Memory 패턴 (M1-2 완료)

### R1: parallel codegen 테스트
- [ ] code-review.gft 컴파일 출력 검증 테스트 (orchestration, agents, hooks, settings)
- [ ] parallel→sequential edge transform 정합성 검증
- [ ] hook graceful no-op 테스트

### R2: memory codegen 테스트
- [ ] chatbot.gft 컴파일 출력 검증 테스트
- [ ] memory scaffold 생성 확인 (.graft/memory/)
- [ ] agent에 memory read/write 경로 포함 확인
- [ ] orchestration에 memory 섹션 포함 확인

### R3: settings.json hook 문법 검증
- [ ] Claude Code의 실제 hook 스키마와 대조
- [ ] `if` 필드 제거 또는 올바른 문법으로 수정
- [ ] 중복 matcher 통합 (같은 "Write" matcher 여러 개 → 하나로)

---

## v5.4 — README + Demo 문서 (M1-3 + M1-4)

### R1: README 재작성
- [ ] Quick Start 중심 구조 (설치→작성→컴파일→실행)
- [ ] 실제 컴파일 출력 예시 포함
- [ ] 언어 문법 요약 (context, node, edge, graph)

### R2: e2e 결과 문서화
- [ ] hello.gft → 컴파일 출력 → 실행 결과 기록
- [ ] code-review.gft parallel 파이프라인 결과 기록
- [ ] M1 체크리스트 업데이트

---

## v5.5 — npm publish 준비 (M1-1)

### R1: 패키지 정리
- [ ] package.json files/bin/exports 최종 확인
- [ ] .npmignore 또는 files 필드 최적화
- [ ] npm pack --dry-run 으로 포함 파일 확인

### R2: CI/CD
- [ ] GitHub Actions publish workflow 검증
- [ ] npm org 생성 가이드 (수동 단계)
- [ ] 태그 기반 자동 배포 설정

---

## v5.6 — VS Code 확장 준비 (M1-5)

### R1: 확장 패키징
- [ ] editors/vscode 빌드 확인
- [ ] .vscodeignore 정리
- [ ] vsce package 테스트

### R2: 배포 준비
- [ ] marketplace publisher 등록 가이드
- [ ] vsce publish 명령 준비
