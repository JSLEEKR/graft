import * as fs from 'node:fs';
import * as path from 'node:path';
import { MemoryDecl } from '../parser/ast.js';

export function loadMemory(
  memoryDir: string,
  name: string,
  options?: { verbose?: boolean },
): Record<string, unknown> | null {
  const filePath = path.join(memoryDir, `${name.toLowerCase()}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    if (options?.verbose) {
      console.warn(`[MEMORY] Warning: ${filePath} exists but contains invalid JSON — treating as empty`);
    }
    return null;
  }
}

export function saveMemory(memoryDir: string, mem: MemoryDecl, nodeOutput: unknown, fields?: string[]): void {
  fs.mkdirSync(memoryDir, { recursive: true });
  const filePath = path.join(memoryDir, `${mem.name.toLowerCase()}.json`);

  let current: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      current = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  if (typeof nodeOutput === 'object' && nodeOutput !== null) {
    const output = nodeOutput as Record<string, unknown>;
    const targetFields = fields
      ? mem.fields.filter(f => fields.includes(f.name))
      : mem.fields;
    for (const field of targetFields) {
      if (field.name in output) {
        current[field.name] = output[field.name];
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(current, null, 2));
}
