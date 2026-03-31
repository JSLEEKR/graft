# Contributing to Graft

Graft는 초기 설계 단계입니다. 모든 형태의 기여를 환영합니다.

## 현재 기여 가능한 영역

### 1. Language Design (가장 임팩트 있음)
- 문법 개선 제안 (RFC 형태)
- 타입 시스템 확장
- 새로운 추상화 제안
- 기존 설계의 edge case 발견

### 2. Specification
- 명세서의 모호한 부분 명확화
- 예제 추가
- 다른 언어/시스템과의 비교 분석

### 3. Compiler (향후)
- Parser 구현
- AST 정의
- Token Flow Analyzer
- Claude Code 백엔드 코드 생성기

### 4. Benchmarks
- 기존 멀티에이전트 방식 대비 토큰 절감률 측정
- 다양한 도메인에서의 Graft 효과 검증
- 컴파일 시간 벤치마크

### 5. Documentation
- 튜토리얼 작성
- 도메인별 예제 (.gft 파일)
- FAQ

## RFC Process

언어 설계 변경은 RFC(Request for Comments)를 통해 진행합니다:

1. `docs/rfcs/` 디렉토리에 `NNNN-제목.md` 파일 생성
2. 문제 정의, 제안, 대안, 트레이드오프를 기술
3. PR 생성
4. 논의 후 머지 또는 수정

## Code Style (향후 컴파일러 구현 시)

- 언어: 미정 (Rust, Go, TypeScript 중 논의 예정)
- 테스트: 모든 파서 규칙과 분석기에 대한 유닛 테스트 필수
- 문서: 공개 API에 대한 문서 필수

## Issue Labels

- `language-design` — 언어 설계 관련
- `specification` — 명세서 관련
- `compiler` — 컴파일러 구현
- `example` — 예제 파일
- `question` — 질문/논의
- `good-first-issue` — 처음 기여자에게 적합
