import { Field, TypeExpr } from './parser/ast.js';

export function fieldsToJsonExample(fields: Field[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const field of fields) {
    obj[field.name] = typeToExample(field.type);
  }
  return obj;
}

export function typeToExample(type: TypeExpr): unknown {
  switch (type.kind) {
    case 'primitive':
      switch (type.name) {
        case 'String': return '<string>';
        case 'Int': return 0;
        case 'Float': return 0.0;
        case 'Bool': return false;
        default: return '<unknown>';
      }
    case 'primitive_range':
      return type.min;
    case 'list':
      return [typeToExample(type.element)];
    case 'map':
      return {};
    case 'optional':
      return typeToExample(type.inner);
    case 'token_bounded':
      return typeToExample(type.inner);
    case 'enum':
      return type.values.join('|');
    case 'struct':
      return fieldsToJsonExample(type.fields);
    case 'domain':
      return `<${type.name}>`;
  }
}
