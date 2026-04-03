# M1: "설치하고 돌려볼 수 있다" ✅ COMPLETE

> Completed 2026-04-03. npm published as `@jsleekr/graft@5.7.2`.

## Checklist

- [x] **M1-2: Claude Code 출력 검증** (P0, FIRST)
  - [x] `graft compile examples/hello.gft` 결과를 실제 Claude Code 프로젝트에 배치
  - [x] Claude Code가 `.claude/agents/*.md` frontmatter를 올바르게 인식하는지 확인
  - [x] `.claude/settings.json`이 실제 Claude Code 설정 포맷과 일치하는지 확인
  - [x] hooks `.js` 파일이 실제로 실행되는지 확인 (Node.js, 크로스플랫폼)
  - [x] `CLAUDE.md` 오케스트레이션 지시문을 Claude Code가 따르는지 확인
  - [x] 불일치 사항 수정 (v5.1: hook format, v5.2: parallel edge transforms)
  - [x] 2-node pipeline (hello.gft) e2e 성공 확인
  - [x] 4-node parallel pipeline (code-review.gft) codegen 검증 (v5.3)
  - [x] Memory pipeline (chatbot.gft) codegen 검증 (v5.3)

- [x] **M1-4: e2e 데모**
  - [x] hello.gft compile → Claude Code 실행 → 결과 산출 전체 과정 기록
  - [x] `graft init demo` → compile → Claude Code e2e 성공 (v5.7)

- [x] **M1-1: npm publish**
  - [x] `@jsleekr/graft` scope로 publish (npm org `graft-lang` 미생성, M2로 이관)
  - [x] `npm publish --access public` 성공 (v5.7.1, v5.7.2)
  - [x] `npm install -g @jsleekr/graft && graft --version` 동작 확인

- [x] **M1-3: README 재작성**
  - [x] "10분 Getting Started" 중심으로 재구성
  - [x] 실제 실행 결과 포함
  - [x] 기능 나열 → 시나리오 기반 설명

- [x] **M1-6: `graft init`**
  - [x] `graft init <name>` → scaffold 생성 (v5.1)
  - [x] 생성된 프로젝트가 즉시 `graft compile` 가능

- ➡️ **M1-5: VS Code 확장 배포** → M2로 이관

## e2e 검증 결과

### graft init demo (2-node sequential, v5.7)
- `graft init demo && cd demo && graft compile pipeline.gft` ✅
- Claude Code가 CLAUDE.md 읽고 파이프라인 실행 ✅
- Analyst(Sonnet) → edge transform(select+compact) → Reviewer(Haiku) 성공 ✅
- 전체 파이프라인 자동 실행, 수동 개입 없음 ✅

### code-review.gft (4-node parallel, v5.3)
- codegen 수준에서 검증 완료 ✅

### chatbot.gft (memory + imports, v5.3)
- codegen 수준에서 검증 완료 ✅
