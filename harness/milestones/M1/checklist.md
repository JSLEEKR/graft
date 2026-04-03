# M1: "설치하고 돌려볼 수 있다"

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

- [ ] **M1-4: e2e 데모**
  - [x] hello.gft compile → Claude Code 실행 → 결과 산출 전체 과정 기록
  - [ ] chatbot.gft (memory + imports) 데모
  - [ ] 데모 결과를 README에 반영

- [ ] **M1-1: npm publish**
  - [ ] npm org `@graft-lang` 생성 (또는 패키지명 변경)
  - [ ] `npm publish --access public` 성공
  - [ ] `npm install -g @graft-lang/graft && graft --version` 동작 확인
  - [ ] GitHub Actions CI: test → build → publish on tag

- [x] **M1-3: README 재작성**
  - [x] "10분 Getting Started" 중심으로 재구성 (v5.1)
  - [x] 실제 실행 결과 포함 (v5.4: hook→.js, graft init CLI)
  - [x] 기능 나열 → 시나리오 기반 설명

- [ ] **M1-5: VS Code 확장 배포**
  - [ ] marketplace publisher 등록
  - [ ] `vsce package` → `.vsix` 생성 확인
  - [ ] `vsce publish`
  - [ ] marketplace에서 검색/설치 가능 확인

- [x] **M1-6: `graft init`**
  - [x] `graft init <name>` → scaffold 생성 (v5.1)
  - [x] 생성된 프로젝트가 즉시 `graft compile` 가능

## Verification Criteria

**"10분 테스트"**: 새 디렉토리에서 시작하여:
1. `npm install -g @graft-lang/graft` (2분)
2. `graft init my-pipeline` (10초)
3. `graft compile my-pipeline/pipeline.gft` (1초)
4. Claude Code에서 실행 (7분)
5. 결과 확인

이것이 실패하면 M1은 미완성.

## e2e 검증 결과

### hello.gft (2-node sequential, v5.1)
- graft compile → .claude/ 구조 생성 ✅
- Claude Code가 CLAUDE.md 읽고 파이프라인 실행 ✅
- Researcher(Sonnet) → edge transform(select+compact) → Writer(Haiku) 성공 ✅
- 비용: ~$0.13-0.40/실행

### code-review.gft (4-node parallel, v5.3)
- graft compile → 4 agents + 3 hooks + orchestration 생성 ✅
- CLAUDE.md: Agent tool parallel dispatch 지시 포함 ✅
- Edge transforms: 3개 parallel→sequential 정확한 경로 ✅
- SeniorReviewer agent: transformed input 경로 명시 ✅
- 실제 Claude Code e2e: 미검증 (codegen 수준에서 검증 완료)

### chatbot.gft (memory + imports, v5.3)
- graft compile → agent + orchestration + memory scaffold 생성 ✅
- Memory read/write 경로 agent MD에 포함 ✅
- Persistent Memory 섹션 orchestration에 포함 ✅
- 실제 Claude Code e2e: 미검증 (codegen 수준에서 검증 완료)
