import * as path from 'node:path';
import { CodeActionKind } from 'vscode-languageserver/node';
import type { CodeAction, Diagnostic } from 'vscode-languageserver/node';
import { getWordAtPosition } from './utils.js';
import { extractUndefinedName } from './diagnostics.js';

export function buildAutoImportActions(
  docText: string,
  docUri: string,
  currentFilePath: string,
  diagnostics: Diagnostic[],
  workspaceExports: Map<string, string[]>,
): CodeAction[] {
  const actions: CodeAction[] = [];

  // Collect already-imported names
  const importedNames = new Set<string>();
  for (const line of docText.split('\n')) {
    const m = line.match(/^\s*import\s+\{([^}]+)\}/);
    if (m) {
      for (const n of m[1].split(',')) importedNames.add(n.trim());
    }
  }

  for (const diag of diagnostics) {
    if (diag.code !== 'SCOPE_UNDEFINED_REF') continue;

    const name = extractUndefinedName(diag.message, docText, diag.range.start.line, diag.range.start.character);
    if (!name || importedNames.has(name)) continue;

    for (const [filePath, exports] of workspaceExports) {
      if (filePath === currentFilePath || !exports.includes(name)) continue;

      const relPath = computeRelativeImportPath(currentFilePath, filePath);
      const edit = buildAutoImportEdit(name, relPath, docText);

      actions.push({
        title: `Import '${name}' from "${relPath}"`,
        kind: CodeActionKind.QuickFix,
        edit: {
          changes: {
            [docUri]: [{
              range: { start: { line: edit.insertLine, character: 0 }, end: { line: edit.insertLine, character: 0 } },
              newText: edit.newText,
            }],
          },
        },
      });
    }
  }

  return actions;
}

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
