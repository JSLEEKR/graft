# Convergence Report — v2.1-R4: Integration and Calibration

## Summary

MEDIUM tier simplified — R4 is purely integration testing with no production code changes. Existing 282 tests provide strong coverage. New tests fill remaining gaps: multi-node pipeline, parallel token tracking, import pipeline, and budget threshold logging.

Step 1 and Step 2 skipped — no design decisions to debate for integration tests.

## Implementation Spec

### No Production Code Changes

All v2.1 production code is complete from R1-R3. R4 adds integration tests only.

### New Integration Tests (in tests/token-tracking.test.ts)

#### 1. Multi-node sequential pipeline with token tracking

Test a 2-node sequential pipeline (A -> B -> done) with mock spawner returning different token usage per node. Verify:
- tokenUsage.perNode has 2 entries
- cumulative tracking is correct
- token_log.txt has 2 lines

#### 2. Parallel node token tracking

Test a parallel pipeline (parallel { A, B } -> done) with mock spawner. Verify:
- tokenUsage.perNode has entries for both nodes
- consumed is sum of both

#### 3. Import pipeline with token tracking

Test compiling a file with imports, then running with dry-run. Verify:
- tokenUsage reflects the imported nodes that execute

#### 4. Budget threshold at exactly 80%

Test with budget = 1000, mock spawner returning usage totaling 800. Verify:
- tokenUsage.fraction >= 0.8

#### 5. Token log format verification

Test exact format of token log entries:
- Contains timestamp in ISO format
- Contains "Node <name>"
- Contains "estimated: <number>"
- Contains "actual: <number>" or "actual: N/A"
- Contains "cumulative: <number>/<budget> (<pct>%)"

#### 6. Dry run with multi-node pipeline

Test dry run with multi-node pipeline. Verify:
- All perNode entries have actual: undefined
- token_log.txt shows N/A for actual

#### 7. Examples compile and dry-run correctly

Test that examples/hello.gft compiles and dry-runs without errors.

### Regression Sweep

Run full test suite — all 282+ tests must pass.

## Ratchet Items

No new ratchets for R4 — integration tests validate existing ratchets.

## Calibration Notes (in test comments)

If actual tokens diverge significantly from budgetIn/budgetOut estimates, note in common_memory for future PARTIAL_FIELD_FACTOR tuning. For v2.1 with mock spawners, this comparison is synthetic — real calibration requires actual Claude CLI runs.
