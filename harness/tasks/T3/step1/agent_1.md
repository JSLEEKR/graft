# A1-Architect: AST Type Definitions Proposal

## Convergence Score: 92/100

The plan's AST types are well-designed and closely aligned with the spec. My evaluation finds them largely correct with a few targeted improvements. The high convergence score reflects that most changes are refinements, not structural rework.

---

## 1. Critical Evaluation of the Plan's Types

### 1.1 What the Plan Gets Right

- **Discriminated unions with `kind` for TypeExpr and EdgeTarget**: Correct. Exhaustive `switch` narrowing works perfectly in strict-mode TypeScript.
- **`type` discriminant for Transform and FailureStrategy**: Acceptable. Different semantic category ("what operation/strategy" vs "what shape"), no ambiguity since they are separate union types.
- **`SourceLocation` on declaration/reference nodes only**: Correct for v1. TypeExpr variants inherit location from their parent Field.
- **`ContextRef` with optional `field`**: Matches spec's partial read (`Research.findings`).
- **`EdgeTarget` as discriminated union instead of spec's `string | ConditionalTarget[]`**: Strictly better. Avoids stringly-typed branching.
- **`GraphDecl.flow` as `string[]` instead of `FlowStep[]`**: Correct YAGNI decision for v1 sequential-only flows.
- **Mutable interfaces**: Correct. Parser builds incrementally; analyzer may annotate.

### 1.2 Issues Found

#### Issue A: `select` Transform Supports Multiple Fields (Spec says "Multiple `select` calls accumulate")

The plan has `{ type: 'select'; field: string }` (singular). The spec says "select is projection (which fields to keep). Multiple select calls accumulate." This means the parser can emit one `select` per `select(field)` call -- each with a single field. This is actually fine: the accumulation happens at the analyzer/codegen level by processing all transforms in order. **No change needed.**

#### Issue B: Condition Missing Location

`Condition` has no `location` field. For v1, conditions appear inside edge routing (`when risk_score > 0.7`) and filter transforms (`filter(issues, severity >= medium)`). If the analyzer detects an invalid field reference or type mismatch in a condition, it currently must report errors using the parent EdgeDecl's location, which is imprecise. However, adding location to Condition is a non-breaking additive change. **Defer to v1.1 -- acceptable for v1.**

#### Issue C: Transform Missing Location

Same argument as Condition. Transforms have no `location`, meaning "unknown field in select(foo)" would point to the whole edge declaration. For v1, this is acceptable since error messages will include the field name. **Defer.**

#### Issue D: Inconsistent Discriminant Naming (Deliberate)

- `TypeExpr` and `EdgeTarget` use `kind`
- `Transform` and `FailureStrategy` use `type`

The research notes say this is intentional: `kind` = "what shape is this data", `type` = "what operation/strategy". I agree this is defensible but want to flag the downstream cost: any generic AST utility (visitor, printer, serializer) must handle both discriminant names. For ~15 types, this cost is negligible. **Keep as-is.**

#### Issue E: `NodeDecl.produces` Is Not Optional

The plan makes `produces` a required field (`produces: ProducesDecl`). The spec shows every node has a `produces` block. Is there a case where a node does something but produces no structured output (e.g., a side-effect-only node)? Not in v1 scope. **Keep required.**

#### Issue F: Missing `Condition.location` in ConditionalBranch

`ConditionalBranch` wraps a `Condition` and a `target` string. When the analyzer validates conditional edge routing, it needs to locate the branch. Currently `ConditionalBranch` has no location. Since the parent `EdgeDecl` has location and the number of branches is small, this is acceptable for v1. **Defer.**

---

## 2. Proposed Changes (Improvements Over Plan)

### Change 1: Add `location` to `Condition` (RECOMMEND, not REQUIRE)

```typescript
export interface Condition {
  field: string;
  op: '>=' | '>' | '<' | '<=' | '==' | '!=';
  value: string | number | boolean;
  location: SourceLocation;
}
```

**Rationale**: Conditions appear in two places -- filter transforms and conditional edge routing. Both can have type errors (invalid field, wrong comparator for type). With location, error messages can point directly to `severity >= medium` rather than the whole edge. The parser already has position info when parsing these, so the cost is one extra field assignment.

**If rejected**: The plan's version without location is functional. Errors just point to the edge.

### Change 2: Add `location` to `Transform` variants (RECOMMEND, not REQUIRE)

```typescript
export type Transform =
  | { type: 'select'; field: string; location: SourceLocation }
  | { type: 'filter'; field: string; condition: Condition; location: SourceLocation }
  | { type: 'drop'; field: string; location: SourceLocation }
  | { type: 'compact'; location: SourceLocation }
  | { type: 'truncate'; tokens: number; location: SourceLocation };
```

**Rationale**: Same as Condition. The analyzer's type checker validates that `select(field)` references a real field in the source node's produces schema. Pointing at the specific transform rather than the whole edge makes error messages significantly better. Cost: one field per variant, assigned during parsing.

**If rejected**: Functional but lower-quality error messages.

### Change 3: Keep `Condition` as `interface` (not bare type)

The plan defines `Condition` as an `interface` already. Good. This is correct -- it has a fixed shape, not a union. No change needed, just confirming.

### Change 4: Explicit Type Export for `ConditionalBranch`

The plan correctly exports `ConditionalBranch` as a named interface. This is important for T4 (parser needs to construct these) and T5 (analyzer needs to pattern-match on them). No change needed.

---

## 3. Types Serving All Downstream Tasks

### T4 (Parser) Compatibility

The parser constructs these types from tokens. Key considerations:
- **Program**: Parser accumulates four arrays. Simple, correct.
- **NodeDecl**: Parser must handle `budget: 5k/2k` by splitting into `budgetIn`/`budgetOut`. The k-suffix expansion happens in the parser (KIntegerLiteral token already carries raw value, parser multiplies by 1000). This is well-supported.
- **EdgeTarget**: Parser sees `->` followed by either an identifier (direct) or `{` (conditional). The discriminated union maps cleanly.
- **TypeExpr**: Recursive descent naturally builds recursive TypeExpr. `List<String>` becomes `{ kind: 'list', element: { kind: 'primitive', name: 'String' } }`.

**Verdict**: Types serve T4 well. No issues.

### T5 (Analyzer) Compatibility

Three passes need different things:
- **Scope checker**: Walks `NodeDecl.reads` (ContextRef[]), `EdgeDecl.source`/`target`, `GraphDecl.flow`. All are string-based lookups against declared names. Well-supported.
- **Type checker**: Needs to traverse `Transform` to find field references, then look up those fields in the source node's `ProducesDecl.fields`. The `Field.type: TypeExpr` discriminated union supports recursive type checking. Well-supported.
- **Token estimator**: Needs `ContextDecl.maxTokens`, `NodeDecl.budgetIn`/`budgetOut`, `GraphDecl.budget`, and transform heuristics (compact = 30% reduction). All values are directly on the AST nodes as numbers. Well-supported.

**Verdict**: Types serve T5 well. The only gap is error location granularity (Changes 1-2 above).

### T6 (CodeGen) Compatibility

- **Node to agent.md**: Needs `NodeDecl.name`, `.model`, `.budgetIn`/`.budgetOut`, `.reads`, `.tools`, `.onFailure`, `.produces`. All present.
- **Edge to hook.sh**: Needs `EdgeDecl.source`, `.target` (node name via EdgeTarget), `.transforms`. All present.
- **Graph to CLAUDE.md**: Needs `GraphDecl.name`, `.input`, `.output`, `.budget`, `.flow`. All present.
- **Settings.json**: Needs model resolution and tool mapping. Model is a string on NodeDecl. Tool names are strings in the array. Both simple lookups.

**Verdict**: Types serve T6 well. No issues.

---

## 4. Missing Types or Fields Assessment

| Candidate | Needed? | Verdict |
|---|---|---|
| `Program.location` (file-level span) | No | Program spans the whole file; no error points here |
| `NodeDecl.budgetTotal` (computed) | No | Analyzer can compute `budgetIn + budgetOut`; YAGNI |
| `EdgeDecl.isImplicit` flag | No | Implicit edges (no declaration) are absent from AST by definition |
| `GraphDecl.flow` including `done` | No | Plan correctly excludes `done` from flow array; it is a terminator keyword |
| `TypeExpr` location | No for v1 | Parent `Field` carries location; additive later |
| `Condition.location` | Recommended | See Change 1 |
| `Transform` location | Recommended | See Change 2 |

---

## 5. Type Hierarchy Depth Assessment

The hierarchy is appropriately **flat**:
- No base `ASTNode` interface (correct -- no shared behavior)
- No class inheritance
- Maximum nesting: `Program -> NodeDecl -> ProducesDecl -> Field -> TypeExpr -> (recursive)`
- This is 4 levels deep at most, which matches the grammar's nesting depth

The hierarchy is **not too shallow** either. `EdgeTarget` as a discriminated union (rather than flattening conditional branches into EdgeDecl) correctly separates concerns.

**Verdict**: Hierarchy depth is well-calibrated. No changes.

---

## 6. Final Recommended `ast.ts`

```typescript
import { SourceLocation } from '../errors/diagnostics.js';

// Top-level program
export interface Program {
  contexts: ContextDecl[];
  nodes: NodeDecl[];
  edges: EdgeDecl[];
  graphs: GraphDecl[];
}

// context TaskSpec(max_tokens: 1k) { ... }
export interface ContextDecl {
  name: string;
  maxTokens: number;
  fields: Field[];
  location: SourceLocation;
}

// node Analyzer(model: sonnet, budget: 5k/2k) { ... }
export interface NodeDecl {
  name: string;
  model: string;
  budgetIn: number;
  budgetOut: number;
  reads: ContextRef[];
  tools: string[];
  onFailure?: FailureStrategy;
  produces: ProducesDecl;
  location: SourceLocation;
}

// produces Research { ... }
export interface ProducesDecl {
  name: string;
  fields: Field[];
  location: SourceLocation;
}

// edge Analyzer -> Reviewer | select(...) | compact
export interface EdgeDecl {
  source: string;
  target: EdgeTarget;
  transforms: Transform[];
  location: SourceLocation;
}

export type EdgeTarget =
  | { kind: 'direct'; node: string }
  | { kind: 'conditional'; branches: ConditionalBranch[] };

export interface ConditionalBranch {
  condition?: Condition;  // absent = else branch
  target: string;
}

// graph SimpleQA(...) { Researcher -> Writer -> done }
export interface GraphDecl {
  name: string;
  input: string;
  output: string;
  budget: number;
  flow: string[];  // v1: sequential node names, 'done' excluded
  location: SourceLocation;
}

// Schema fields
export interface Field {
  name: string;
  type: TypeExpr;
  location: SourceLocation;
}

// Type expressions
export type TypeExpr =
  | { kind: 'primitive'; name: string }
  | { kind: 'primitive_range'; name: string; min: number; max: number }
  | { kind: 'list'; element: TypeExpr }
  | { kind: 'map'; key: TypeExpr; value: TypeExpr }
  | { kind: 'optional'; inner: TypeExpr }
  | { kind: 'token_bounded'; inner: TypeExpr; max: number }
  | { kind: 'enum'; values: string[] }
  | { kind: 'struct'; name: string; fields: Field[] }
  | { kind: 'domain'; name: string };

// Context references in reads
export interface ContextRef {
  context: string;
  field?: string;  // partial read: Research.findings
  location: SourceLocation;
}

// Conditions (edge routing, filter)
export interface Condition {
  field: string;
  op: '>=' | '>' | '<' | '<=' | '==' | '!=';
  value: string | number | boolean;
}

// Transform operations on edges
export type Transform =
  | { type: 'select'; field: string }
  | { type: 'filter'; field: string; condition: Condition }
  | { type: 'drop'; field: string }
  | { type: 'compact' }
  | { type: 'truncate'; tokens: number };

// Failure strategies
export type FailureStrategy =
  | { type: 'retry'; max: number }
  | { type: 'fallback'; node: string }
  | { type: 'retry_then_fallback'; max: number; node: string }
  | { type: 'skip' }
  | { type: 'abort' };
```

---

## 7. Convergence Notes

**Score: 92/100**

- **-0 points**: Core structure matches plan exactly. All discriminated unions, all interfaces, all fields correct.
- **-4 points**: Recommended (not required) addition of `location` to `Condition` and `Transform` for better error messages. These are quality-of-life improvements the other agents may or may not agree on.
- **-4 points**: Minor risk that omitting location from sub-expression nodes will produce confusing error messages during T5 development. This is a judgment call, not a correctness issue.

**Position on contested points:**
1. **`Condition.location` and `Transform` location**: I recommend adding them but will not block on it. The plan's version without them is functional.
2. **Discriminant naming (`kind` vs `type`)**: Keep as-is. The semantic distinction is defensible and the cost of inconsistency is negligible at this scale.
3. **Everything else**: The plan's types are correct and well-designed. Ship them.

**Deferred from this proposal (YAGNI):**
- `readonly` fields
- Visitor pattern infrastructure
- `TypeExpr` location fields
- Base `ASTNode` interface
- `Program.location`
