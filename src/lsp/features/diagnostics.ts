import type { Diagnostic } from 'vscode-languageserver/node';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import type { GraftError } from '../../errors/diagnostics.js';
import { getWordAtPosition } from './utils.js';

export function toDiagnostics(errors: GraftError[], warnings: GraftError[]): Diagnostic[] {
  const result: Diagnostic[] = [];
  for (const e of errors) {
    result.push(makeDiagnostic(e, DiagnosticSeverity.Error));
  }
  for (const w of warnings) {
    result.push(makeDiagnostic(w, DiagnosticSeverity.Warning));
  }
  return result;
}

function makeDiagnostic(e: GraftError, severity: DiagnosticSeverity): Diagnostic {
  const line = Math.max(0, e.location.line - 1);
  const character = Math.max(0, e.location.column - 1);
  const endCharacter = character + (e.location.length ?? 1);
  return {
    range: {
      start: { line, character },
      end: { line, character: endCharacter },
    },
    severity,
    message: e.message,
    source: 'graft',
    ...(e.code ? { code: e.code } : {}),
  };
}

export function extractUndefinedName(message: string, docText: string, line: number, character: number): string | null {
  const msgMatch = message.match(/'([^']+)'/);
  if (msgMatch) return msgMatch[1];
  return getWordAtPosition(docText, line, character);
}
