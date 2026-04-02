# A1-Architect Cross-Critique (FORCED DISSENTER) -- v4.0-R1

## Self-Rebuttal
1. Flat division precedence may be user-hostile (rebuttal 6/10) — but spec is explicit
2. conditionFieldName() is a migration crutch (rebuttal 4/10) — acceptable bridge
3. Node PascalCase in KEYWORDS is unnecessary (rebuttal 7/10) — check identifier value instead
4. Foreach allowing let but rejecting graph_call is inconsistent (rebuttal 8/10) — revised to allow both

## Revised Positions
- Division: flat (spec grammar), Node: don't add to KEYWORDS (check value at parse site)
- Foreach: allow let + graph_call (consistent), let: arrow-connected (plan explicit)
- parsePrimary: permissive keywords, conditionFieldName(): keep, mkCond(): keep
- Graph call zero args: allow (analyzer validates in R2)
