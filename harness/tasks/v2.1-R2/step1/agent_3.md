# A3-Skeptic: v2.1-R2 Correctness Fixes

## Convergence Score: 7/10

## Key Findings

### Critical: compiler.ts Warning Routing Bug
ScopeChecker.check() and TypeChecker.check() return GraftError[]. compiler.ts lines 67-77 push ALL results into `errors`. If checks produce warnings (severity: 'warning'), they block compilation despite being non-fatal. Must filter by severity.

### Edge Cases Identified
1. Parallel branches are `string[]` (node names), not FlowNodes — simpler than task implies
2. Multiple writes targets per node must be checked independently
3. Negative max_tokens unreachable at lexer level (only 0 is reachable)
4. Node with empty produces and writes triggers correct zero-overlap warning
5. Only compare branches WITHIN same parallel block (not sequential writes after)

## Implementation
- Check 1 (writes schema): TypeChecker, warning per writes entry with zero field overlap
- Check 2 (max_tokens): TypeChecker, error for <= 0
- Check 3 (parallel writes): ScopeChecker via nodeWritesMap, warning when 2+ branches write same memory
- Prerequisite: compiler.ts severity filtering (Option A: filter after check())
