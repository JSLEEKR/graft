# v4.4 Process Retrospective

## Summary

v4.4 ran 4 rounds: R1 (DIRECT), R2 (MEDIUM), R3 (DIRECT), R4 (TEST-ONLY). ~6 agent calls total. 46 new tests (1,077->1,123), 15 new ratchets, 0 unlocked. All 4 rounds PASS on first try -- 21 consecutive rounds without NEEDS_CHANGES (v4.0-R1 through v4.4-R4). Mixed release: refactoring (R1, R3) + feature (R2) + tests (R4).

## Tier Assessment

All tiers correct. R1 extraction was properly DIRECT (pure refactor). R2 string interpolation was correctly MEDIUM (new token + AST kind + parser + runtime + 2 analyzers = 7 files). R3 registry enrichment was DIRECT (modify existing patterns). R4 TEST-ONLY.

## Key Observations

1. **Extraction-before-feature** ordering worked well. R1 extracted evaluateExpr before R2 added template evaluation to it. Cleaner diffs.
2. **Template parsing via inner Lexer+Parser** was the key R2 design decision. Avoids complex lexer state.
3. **Registry enrichment** reduced per-builtin maintenance from 4-5 to 2 touch points. ROI will show in next version that adds builtins.
4. **Memory archival** reduced common_memory.md by ~120 lines. Should have been done earlier.
5. **JS template literal escaping**: Test strings containing ${} inside JS backtick literals get interpolated by JavaScript, not Graft. R2 tests had to use `.join('\n')` array syntax. This is a recurring test authoring issue.

## Recommendations for v4.5

1. Expression system is feature-complete for basic use. Consider comparison operators or conditional expressions.
2. The Expr union now has 8 kinds. Consider whether it needs optimization for the type checker.
3. flow-runner.ts at 311 lines is healthy. No extraction needed.
4. parser.ts at ~1,155 lines is approaching 1,200. Monitor but no action needed.
