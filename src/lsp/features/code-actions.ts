import * as path from 'node:path';
import { getWordAtPosition } from './utils.js';

export function buildAutoImportEdit(
  name: string, fromPath: string, docText: string,
): { insertLine: number; newText: string } {
  const lines = docText.split('\n');
  let insertLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+\{/.test(lines[i])) {
      insertLine = i + 1;
    }
  }
  return { insertLine, newText: `import { ${name} } from "${fromPath}"\n` };
}

export function computeRelativeImportPath(fromFile: string, toFile: string): string {
  let rel = path.relative(path.dirname(fromFile), toFile);
  rel = rel.replace(/\\/g, '/');  // Windows path normalization
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}
