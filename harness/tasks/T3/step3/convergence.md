# Convergence Report — T3: AST Type Definitions

## Summary

The plan's AST type definitions are structurally correct and faithful to the v1 grammar. All four agents agree on the core design: interfaces for declaration nodes, discriminated unions for polymorphic types, `SourceLocation` imported from diagnostics.ts, mutable fields, no visitor pattern, single file `src/parser/ast.ts`, no test file. The only substantive debate concerned type-level narrowing of `primitive.name`, `domain.name`, and `primitive_range.name` from `string` to literal unions (A1/A3/A4 favor, A2 against) and whether to add `location` to `Condition` and `Transform` (A1 recommends, A2 rejects as YAGNI). The converged implementation adopts the literal union narrowing (zero-cost type safety) and rejects the location additions (YAGNI, additive later). A JSDoc comment on `ConditionalBranch.condition` documenting else-branch semantics is adopted per A4's suggestion.

## Forced Dissent Rulings

| Argument | Ruling | Basis |
|----------|--------|-------|
| A4 (forced dissenter) self-rebuttal: failed to find structural issues, now supports A3's narrowing of primitive/domain/primitive_range names | Accept | A4's self-rebuttal is honest -- no structural flaw exists. A4's revised support for A3's narrowing is well-reasoned and aligns with compiler domain best practice (AST nodes carry narrow types for keyword-derived values). |

## Per-Agent Accept/Reject

### A1-Architect
- Accepted: Narrow `primitive.name` to literal union (adopted from A3 in Step 2) -- zero-cost type safety
- Accepted: Narrow `domain.name` to literal union -- same reasoning
- Accepted: Narrow `primitive_range.name` to `'Float'` -- grammar only supports Float ranges
- Accepted: JSDoc on `ConditionalBranch.condition` for else semantics -- zero cost documentation
- Rejected: Add `location` to `Condition` -- YAGNI; parser does not exist yet, additive later, project pattern favors deferral
- Rejected: Add `location` to `Transform` variants -- same reasoning as Condition

### A2-Pragmatist
- Accepted: Plan types are structurally correct -- all agents agree
- Accepted: All 9 TypeExpr variants needed -- all in v1 spec scope
- Accepted: ProducesDecl as separate interface -- own location, own name, analyzer references independently
- Accepted: No test file for types-only module -- compile check suffices
- Rejected: "Use plan types verbatim" -- A3's narrowing improvements are zero-cost and worth adopting

### A3-Skeptic
- Accepted: Issue 1 -- narrow `primitive.name` to `'String' | 'Int' | 'Float' | 'Bool'` -- strongest unique contribution, zero-cost type safety
- Accepted: Issue 2 -- narrow `primitive_range.name` to `'Float'` -- grammar constraint, zero cost
- Accepted: Narrow `domain.name` to `'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef'` -- closed set in v1 spec
- Accepted: hello.gft walkthrough confirms all constructs are representable
- Accepted: Issues 3-10 correctly scoped as non-actionable for T3

### A4-Specialist
- Accepted: Grammar-to-AST faithfulness mapping -- every production covered, no gaps
- Accepted: Semantic invariants belong in analyzer, not type system -- correct boundary
- Accepted: JSDoc on `ConditionalBranch.condition` documenting else semantics
- Accepted: Revised position supporting A3's narrowing (from self-rebuttal)
- Rejected: Add `location` to Condition and Transform as REQUIRED -- YAGNI; additive later

## Implementation Spec

### File List
- Create: `src/parser/` (directory)
- Create: `src/parser/ast.ts`

### Implementation Code

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
  /** When undefined, this branch represents the `else` case (default target). */
  condition?: Condition;
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
  | { kind: 'primitive'; name: 'String' | 'Int' | 'Float' | 'Bool' }
  | { kind: 'primitive_range'; name: 'Float'; min: number; max: number }
  | { kind: 'list'; element: TypeExpr }
  | { kind: 'map'; key: TypeExpr; value: TypeExpr }
  | { kind: 'optional'; inner: TypeExpr }
  | { kind: 'token_bounded'; inner: TypeExpr; max: number }
  | { kind: 'enum'; values: string[] }
  | { kind: 'struct'; name: string; fields: Field[] }
  | { kind: 'domain'; name: 'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef' };

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

### Test Code

No test file. This is a types-only module with zero runtime code. Verification is compile-only via `npx tsc --noEmit`. All agents unanimously agree on this. T4 (parser) and T5 (analyzer) tests will exercise AST construction and consumption.

### Verification Commands

```bash
npx tsc --noEmit
```

Expected: Clean compilation with no errors. Confirms:
1. The file is valid TypeScript under strict mode
2. The import of `SourceLocation` from `../errors/diagnostics.js` resolves correctly
3. All recursive type references (TypeExpr in list/map/optional/token_bounded/struct) are valid

## Ratchet-Locked Items

- [T3-R01] AST in single file `src/parser/ast.ts` -- LOCKED
- [T3-R02] Import `SourceLocation` from `../errors/diagnostics.js` (not re-defined) -- LOCKED
- [T3-R03] Interfaces for declaration nodes, discriminated unions for polymorphic types -- LOCKED
- [T3-R04] `TypeExpr` uses `kind` discriminant, `Transform`/`FailureStrategy` use `type` discriminant -- LOCKED
- [T3-R05] `primitive.name` narrowed to `'String' | 'Int' | 'Float' | 'Bool'` -- LOCKED
- [T3-R06] `domain.name` narrowed to `'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef'` -- LOCKED
- [T3-R07] `primitive_range.name` narrowed to `'Float'` -- LOCKED
- [T3-R08] Mutable interfaces (no `readonly`) -- LOCKED
- [T3-R09] No visitor pattern -- LOCKED
- [T3-R10] `GraphDecl.flow` as `string[]` (not `FlowStep[]`) -- LOCKED
- [T3-R11] `EdgeTarget` as discriminated union with `kind` (not `string | ConditionalTarget[]`) -- LOCKED
- [T3-R12] No test file for types-only module -- LOCKED

## Convergence Metrics

- Final convergence score: 9/10
- Unresolved issues: None. All disagreements resolved with explicit rulings.
- Notes for next task:
  - T4 parser must construct `primitive` TypeExpr only with narrowed names (`'String' | 'Int' | 'Float' | 'Bool'`)
  - T4 parser must construct `domain` TypeExpr only with narrowed names (`'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef'`)
  - T4 parser must construct `primitive_range` only with `name: 'Float'`
  - T4 parser handles k-suffix expansion (e.g., `4k` -> `4000`) for budget/maxTokens fields
  - `ConditionalBranch` with `condition === undefined` represents the else branch
  - `GraphDecl.flow` excludes the `done` terminator keyword
