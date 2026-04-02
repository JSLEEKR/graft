import { Program, TypeExpr, conditionFieldName, Expr, FlowNode, GraphDecl, BUILTIN_FUNCTIONS } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';
import { ProgramIndex } from '../program-index.js';

type InferredType = 'number' | 'string' | 'boolean' | 'unknown';

export class TypeChecker {
  private program: Program;
  private index: ProgramIndex;

  constructor(program: Program, index?: ProgramIndex) {
    this.program = program;
    this.index = index ?? new ProgramIndex(program);
  }

  check(): GraftError[] {
    const diagnostics: GraftError[] = [];
    this.checkEdgeTransforms(diagnostics);
    this.checkWritesSchemaOverlap(diagnostics);
    this.checkConditionTypes(diagnostics);
    this.checkExprTypes(diagnostics);
    return diagnostics;
  }

  private checkWritesSchemaOverlap(diagnostics: GraftError[]): void {
    for (const node of this.program.nodes) {
      if (node.writes.length === 0) continue;
      const producesFields = this.index.producesFieldsMap.get(node.name);
      if (!producesFields) continue; // scope checker catches

      for (const writeRef of node.writes) {
        const memoryFields = this.index.memoryFieldsMap.get(writeRef.memory);
        if (!memoryFields) continue; // scope checker catches undeclared

        let hasOverlap = false;
        for (const field of producesFields.keys()) {
          if (memoryFields.has(field)) { hasOverlap = true; break; }
        }

        if (!hasOverlap) {
          diagnostics.push(new GraftError(
            `Node '${node.name}' writes to memory '${writeRef.memory}' but produces no matching fields`,
            node.location,
            'warning',
            'TYPE_SCHEMA_MISMATCH',
          ));
        }
      }
    }
  }

  private checkEdgeTransforms(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      const sourceFields = this.index.producesFieldsMap.get(edge.source);
      if (!sourceFields) continue; // scope checker will catch this

      for (const transform of edge.transforms) {
        if (transform.type === 'select') {
          for (const f of transform.fields) {
            if (!sourceFields.has(f)) {
              errors.push(new GraftError(
                `select: field '${f}' does not exist in '${edge.source}' output`,
                edge.location,
                'error',
                'TYPE_FIELD_NOT_FOUND',
              ));
            }
          }
        } else if (transform.type === 'filter') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `filter: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
              'error',
              'TYPE_FIELD_NOT_FOUND',
            ));
          }
        } else if (transform.type === 'drop') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `drop: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
              'error',
              'TYPE_FIELD_NOT_FOUND',
            ));
          }
        }
      }
    }
  }

  private checkConditionTypes(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      if (edge.target.kind !== 'conditional') continue;

      const sourceFields = this.index.producesFieldsMap.get(edge.source);
      if (!sourceFields) continue; // scope checker catches this

      for (const branch of edge.target.branches) {
        if (!branch.condition) continue; // else branch
        const { op } = branch.condition;
        const field = conditionFieldName(branch.condition);

        // Only ordered comparisons need numeric types
        if (op === '==' || op === '!=') continue;

        const fieldType = sourceFields.get(field);
        if (!fieldType) continue; // scope checker catches this

        if (!isNumericType(fieldType)) {
          errors.push(new GraftError(
            `Ordered comparison '${op}' requires numeric type, but field '${field}' has type '${fieldType.kind === 'primitive' ? fieldType.name : fieldType.kind}'`,
            edge.location,
            'error',
            'TYPE_CONDITION_MISMATCH',
          ));
        }
      }
    }
  }

  private checkExprTypes(errors: GraftError[]): void {
    for (const graph of this.program.graphs) {
      const varTypes = new Map<string, InferredType>();
      this.walkFlowForTypes(graph.flow, varTypes, errors);
      this.checkVarConditionTypes(varTypes, errors);
    }
  }

  private walkFlowForTypes(
    nodes: FlowNode[],
    varTypes: Map<string, InferredType>,
    errors: GraftError[],
  ): void {
    for (const step of nodes) {
      if (step.kind === 'let') {
        const inferred = this.inferExprType(step.value, varTypes);
        varTypes.set(step.name, inferred);
        this.checkExprTypeErrors(step.value, varTypes, errors);
      } else if (step.kind === 'foreach') {
        const bodyTypes = new Map(varTypes);
        bodyTypes.set(step.binding, 'unknown');
        this.walkFlowForTypes(step.body, bodyTypes, errors);
      }
    }
  }

  private inferExprType(expr: Expr, varTypes: Map<string, InferredType>): InferredType {
    switch (expr.kind) {
      case 'literal': {
        const v = expr.value;
        if (typeof v === 'number') return 'number';
        if (typeof v === 'string') return 'string';
        if (typeof v === 'boolean') return 'boolean';
        return 'unknown';
      }
      case 'field_access': {
        // Single-segment: check varTypes first (variable-first resolution)
        if (expr.segments.length === 1) {
          const varType = varTypes.get(expr.segments[0]);
          if (varType) return varType;
        }
        // Multi-segment: first segment is node name, second is field name
        if (expr.segments.length >= 2) {
          const fields = this.index.producesFieldsMap.get(expr.segments[0]);
          if (fields) {
            const fieldType = fields.get(expr.segments[1]);
            if (fieldType) return typeExprToInferred(fieldType);
          }
        }
        return 'unknown';
      }
      case 'binary': {
        const leftType = this.inferExprType(expr.left, varTypes);
        const rightType = this.inferExprType(expr.right, varTypes);
        // Comparison operators return boolean
        if (expr.op === '<' || expr.op === '>' || expr.op === '<=' || expr.op === '>=' || expr.op === '==' || expr.op === '!=') {
          return 'boolean';
        }
        if (expr.op === '+') {
          if (leftType === 'string' || rightType === 'string') return 'string';
          if (leftType === 'number' && rightType === 'number') return 'number';
          return 'unknown';
        }
        return 'number'; // -, *, /, % produce numbers
      }
      case 'unary': {
        if (expr.op === '!') return 'boolean';
        return 'number'; // unary minus
      }
      case 'group':
        return this.inferExprType(expr.inner, varTypes);
      case 'call': {
        const builtin = BUILTIN_FUNCTIONS[expr.name];
        return (builtin?.returnType as InferredType) ?? 'unknown';
      }
      case 'template':
        return 'string';
      case 'conditional': {
        const consequentType = this.inferExprType(expr.consequent, varTypes);
        const alternateType = this.inferExprType(expr.alternate, varTypes);
        if (consequentType === alternateType) return consequentType;
        return 'unknown';
      }
    }
  }

  private checkExprTypeErrors(
    expr: Expr,
    varTypes: Map<string, InferredType>,
    errors: GraftError[],
  ): void {
    if (expr.kind === 'binary') {
      const leftType = this.inferExprType(expr.left, varTypes);
      const rightType = this.inferExprType(expr.right, varTypes);

      if (leftType !== 'unknown' && rightType !== 'unknown') {
        if (expr.op === '==' || expr.op === '!=') {
          // Equality allows any types
        } else if (expr.op === '<' || expr.op === '>' || expr.op === '<=' || expr.op === '>=') {
          if (leftType !== 'number' || rightType !== 'number') {
            errors.push(new GraftError(
              `Operator '${expr.op}' requires numeric operands, got '${leftType}' and '${rightType}'`,
              expr.location, 'error', 'TYPE_EXPR_MISMATCH',
            ));
          }
        } else if (expr.op === '+') {
          if (leftType !== rightType) {
            errors.push(new GraftError(
              `Operator '+' cannot be applied to types '${leftType}' and '${rightType}'`,
              expr.location, 'error', 'TYPE_EXPR_MISMATCH',
            ));
          }
        } else {
          if (leftType !== 'number' || rightType !== 'number') {
            errors.push(new GraftError(
              `Operator '${expr.op}' requires numeric operands, got '${leftType}' and '${rightType}'`,
              expr.location, 'error', 'TYPE_EXPR_MISMATCH',
            ));
          }
        }
      }

      this.checkExprTypeErrors(expr.left, varTypes, errors);
      this.checkExprTypeErrors(expr.right, varTypes, errors);
    } else if (expr.kind === 'unary') {
      const operandType = this.inferExprType(expr.operand, varTypes);
      if (operandType !== 'unknown') {
        if (expr.op === '!' && operandType !== 'boolean') {
          errors.push(new GraftError(
            `Operator '!' requires boolean operand, got '${operandType}'`,
            expr.location, 'error', 'TYPE_EXPR_MISMATCH',
          ));
        } else if (expr.op === '-' && operandType !== 'number') {
          errors.push(new GraftError(
            `Unary '-' requires numeric operand, got '${operandType}'`,
            expr.location, 'error', 'TYPE_EXPR_MISMATCH',
          ));
        }
      }
      this.checkExprTypeErrors(expr.operand, varTypes, errors);
    } else if (expr.kind === 'group') {
      this.checkExprTypeErrors(expr.inner, varTypes, errors);
    } else if (expr.kind === 'call') {
      const builtin = BUILTIN_FUNCTIONS[expr.name];
      if (builtin && expr.args.length !== builtin.arity) {
        errors.push(new GraftError(
          `Function '${expr.name}' expects ${builtin.arity} argument(s), got ${expr.args.length}`,
          expr.location, 'error', 'TYPE_FUNC_ARITY',
        ));
      }
      for (const arg of expr.args) {
        this.checkExprTypeErrors(arg, varTypes, errors);
      }
    } else if (expr.kind === 'template') {
      for (const part of expr.parts) {
        if (part.kind === 'expr') {
          this.checkExprTypeErrors(part.value, varTypes, errors);
        }
      }
    } else if (expr.kind === 'conditional') {
      this.checkExprTypeErrors(expr.condition, varTypes, errors);
      this.checkExprTypeErrors(expr.consequent, varTypes, errors);
      this.checkExprTypeErrors(expr.alternate, varTypes, errors);
    }
  }

  private checkVarConditionTypes(
    varTypes: Map<string, InferredType>,
    errors: GraftError[],
  ): void {
    for (const edge of this.program.edges) {
      if (edge.target.kind !== 'conditional') continue;

      for (const branch of edge.target.branches) {
        if (!branch.condition) continue;
        const { op, left } = branch.condition;

        if (op === '==' || op === '!=') continue;

        // Check if condition LHS is a variable reference (single-segment field_access)
        if (left.kind === 'field_access' && left.segments.length === 1) {
          const varName = left.segments[0];
          const varType = varTypes.get(varName);
          if (varType && varType !== 'unknown' && varType !== 'number') {
            errors.push(new GraftError(
              `Ordered comparison '${op}' requires numeric type, but variable '${varName}' has type '${varType}'`,
              edge.location, 'error', 'TYPE_VAR_CONDITION',
            ));
          }
        }
      }
    }
  }
}

function typeExprToInferred(type: TypeExpr): InferredType {
  if (type.kind === 'primitive') {
    switch (type.name) {
      case 'String': return 'string';
      case 'Int':
      case 'Float': return 'number';
      case 'Bool': return 'boolean';
    }
  }
  if (type.kind === 'primitive_range') return 'number';
  return 'unknown';
}

function isNumericType(type: TypeExpr): boolean {
  if (type.kind === 'primitive') return type.name === 'Int' || type.name === 'Float';
  if (type.kind === 'primitive_range') return true;
  return false;
}
