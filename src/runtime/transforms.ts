import { Transform, Condition } from '../parser/ast.js';

export function applyTransforms(data: unknown, transforms: Transform[]): unknown {
  let result = data;
  for (const t of transforms) {
    result = applyOne(result, t);
  }
  return result;
}

function applyOne(data: unknown, transform: Transform): unknown {
  if (data === null || data === undefined || typeof data !== 'object') return data;
  switch (transform.type) {
    case 'select': return applySelect(data as Record<string, unknown>, transform.fields);
    case 'filter': return applyFilter(data as Record<string, unknown>, transform.field, transform.condition);
    case 'drop': return applyDrop(data as Record<string, unknown>, transform.field);
    case 'compact': return applyCompact(data);
    case 'truncate': return applyTruncate(data, transform.tokens);
  }
}

function applySelect(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const f of fields) { if (f in obj) result[f] = obj[f]; }
  return result;
}

function applyFilter(obj: Record<string, unknown>, field: string, condition: Condition): Record<string, unknown> {
  const arr = obj[field];
  if (!Array.isArray(arr)) return obj;
  const filtered = arr.filter(item => evalCondition(item, condition));
  return { ...obj, [field]: filtered };
}

function applyDrop(obj: Record<string, unknown>, field: string): Record<string, unknown> {
  const result = { ...obj };
  delete result[field];
  return result;
}

function applyCompact(data: unknown): unknown {
  if (data === null || data === undefined) return undefined;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => applyCompact(item)).filter(item => !isEmpty(item));
  }
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const compacted = applyCompact(val);
    if (!isEmpty(compacted)) result[key] = compacted;
  }
  return result;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) return true;
  return false;
}

function applyTruncate(data: unknown, maxTokens: number): unknown {
  const maxChars = maxTokens * 4; // ~1 token per 4 chars
  const json = JSON.stringify(data);
  if (json.length <= maxChars) return data;
  if (typeof data === 'string' && data.length > maxChars) return data.slice(0, maxChars) + '...';
  if (typeof data !== 'object' || data === null) return data;
  const ratio = maxChars / json.length;
  return truncateDeep(data, ratio);
}

function truncateDeep(data: unknown, ratio: number): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    const maxLen = Math.max(10, Math.floor(data.length * ratio));
    return data.length > maxLen ? data.slice(0, maxLen) + '...' : data;
  }
  if (Array.isArray(data)) {
    const maxItems = Math.max(1, Math.floor(data.length * ratio));
    return data.slice(0, maxItems).map(item => truncateDeep(item, ratio));
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) result[key] = truncateDeep(val, ratio);
    return result;
  }
  return data;
}

export function evalCondition(item: unknown, condition: Condition): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const val = (item as Record<string, unknown>)[condition.field];
  const target = condition.value;
  switch (condition.op) {
    case '==': return val === target;
    case '!=': return val !== target;
    case '>': return typeof val === 'number' && typeof target === 'number' && val > target;
    case '>=': return typeof val === 'number' && typeof target === 'number' && val >= target;
    case '<': return typeof val === 'number' && typeof target === 'number' && val < target;
    case '<=': return typeof val === 'number' && typeof target === 'number' && val <= target;
    default: return false;
  }
}
