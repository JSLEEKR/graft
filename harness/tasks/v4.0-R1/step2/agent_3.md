# A3-Skeptic Cross-Critique -- v4.0-R1

## RETRACTION: Let-without-arrows was wrong
Spec F-01 says "parseFlowNode() handles let as a new case." Plan says same.
Spec example includes `edge` keyword (doesn't exist yet) — pseudocode, not syntax.
Arrow-connected let is correct.

## Revised Positions
- Let: arrow-connected (retracting Step 1)
- Division: flat (spec grammar)
- Graph call zero args: allow (parser-level, R2 validates)
- parsePrimary: permissive keywords
- conditionFieldName() + mkCond(): support
- KIntegerLiteral: reject for R1 (budget syntax, not expression syntax)
- foreach: allow let, reject graph_call (conservative)
- Revised score: 8 (up from 6)
