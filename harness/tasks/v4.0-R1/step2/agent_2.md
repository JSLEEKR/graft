# A2-Pragmatist Cross-Critique -- v4.0-R1

## Key Positions
- Division: flat (spec grammar explicit)
- Let: arrow-connected (plan says parseFlowNode)
- Graph call zero args: error (plan test target says so)
- parsePrimary: permissive keywords (zero cost, prevents edge cases)
- conditionFieldName() + mkCond(): keep both
- KIntegerLiteral: added to parsePrimary (from A4)
- foreach: allow let, reject graph_call (conservative)
- Type-aware defaults: reject (R2 concern)
