export function getWordAtPosition(text: string, line: number, character: number): string | null {
  const lines = text.split('\n');
  if (line < 0 || line >= lines.length) return null;
  const lineText = lines[line];
  if (character < 0 || character > lineText.length) return null;

  const pattern = /[A-Za-z_][A-Za-z0-9_]*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (character >= start && character < end) {
      return match[0];
    }
  }
  return null;
}
