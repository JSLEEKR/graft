import { Expr } from '../parser/ast.js';

export function evaluateExpr(expr: Expr, outputs: Map<string, unknown>, variables?: Map<string, unknown>, warnings?: string[]): unknown {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'field_access': {
      // Single-segment: check variables first (variable-first resolution per R2 ratchet v4.0-R21)
      if (expr.segments.length === 1) {
        if (variables?.has(expr.segments[0])) {
          return variables.get(expr.segments[0]);
        }
        // Could be a node name with single output
        return outputs.get(expr.segments[0]);
      }
      // Multi-segment: first segment is source name, rest are nested field access
      const root = outputs.get(expr.segments[0]);
      if (root === undefined || root === null) return undefined;
      let current: unknown = root;
      for (let i = 1; i < expr.segments.length; i++) {
        if (current === null || current === undefined || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[expr.segments[i]];
      }
      return current;
    }
    case 'binary': {
      const left = evaluateExpr(expr.left, outputs, variables, warnings);
      const right = evaluateExpr(expr.right, outputs, variables, warnings);
      switch (expr.op) {
        case '+':
          if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
          return Number(left) + Number(right);
        case '-': return Number(left) - Number(right);
        case '*': return Number(left) * Number(right);
        case '/': {
          const divisor = Number(right);
          if (divisor === 0) {
            warnings?.push('division by zero in expression');
            return 0;
          }
          return Number(left) / divisor;
        }
        case '%': {
          const divisor = Number(right);
          if (divisor === 0) {
            warnings?.push('division by zero in expression');
            return 0;
          }
          return Number(left) % divisor;
        }
        case '>': return Number(left) > Number(right);
        case '<': return Number(left) < Number(right);
        case '>=': return Number(left) >= Number(right);
        case '<=': return Number(left) <= Number(right);
        case '==': return left == right;
        case '!=': return left != right;
      }
      break;
    }
    case 'unary': {
      const operand = evaluateExpr(expr.operand, outputs, variables, warnings);
      if (expr.op === '-') return -Number(operand);
      if (expr.op === '!') return !operand;
      return operand;
    }
    case 'group':
      return evaluateExpr(expr.inner, outputs, variables, warnings);
    case 'call': {
      const args = expr.args.map(a => evaluateExpr(a, outputs, variables, warnings));
      switch (expr.name) {
        case 'len': {
          const val = args[0];
          if (Array.isArray(val)) return val.length;
          if (typeof val === 'string') return val.length;
          return 0;
        }
        case 'max': return Math.max(Number(args[0]), Number(args[1]));
        case 'min': return Math.min(Number(args[0]), Number(args[1]));
        case 'str': return typeof args[0] === 'object' && args[0] !== null ? JSON.stringify(args[0]) : String(args[0]);
        case 'abs': return Math.abs(Number(args[0]));
        case 'round': return Math.round(Number(args[0]));
        case 'keys': {
          const val = args[0];
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            return Object.keys(val);
          }
          return [];
        }
        default: return undefined;
      }
    }
    case 'template': {
      return expr.parts.map(part => {
        if (part.kind === 'text') return part.value;
        const val = evaluateExpr(part.value, outputs, variables, warnings);
        return String(val);
      }).join('');
    }
    case 'conditional': {
      const cond = evaluateExpr(expr.condition, outputs, variables, warnings);
      return cond
        ? evaluateExpr(expr.consequent, outputs, variables, warnings)
        : evaluateExpr(expr.alternate, outputs, variables, warnings);
    }
  }
}

export function resolveNestedField(segments: string[], obj: Record<string, unknown>): unknown {
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}
