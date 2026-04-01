export function isInComment(lines: string[], line: number, character: number): boolean {
  let inBlock = false;
  for (let i = 0; i <= line; i++) {
    const l = (lines[i] ?? '').replace(/\r$/, '');
    const endCol = i === line ? character : l.length;
    let j = 0;
    while (j < endCol) {
      if (!inBlock) {
        if (l[j] === '/' && j + 1 < l.length && l[j + 1] === '/') {
          if (i === line) return true;
          break;
        }
        if (l[j] === '/' && j + 1 < l.length && l[j + 1] === '*') {
          inBlock = true;
          j += 2;
          continue;
        }
        if (l[j] === '"') {
          j++;
          while (j < endCol && l[j] !== '"') j++;
          if (j < endCol) j++;
          continue;
        }
      } else {
        if (l[j] === '*' && j + 1 < l.length && l[j + 1] === '/') {
          inBlock = false;
          j += 2;
          continue;
        }
      }
      j++;
    }
  }
  return inBlock;
}

export function isInString(lineText: string, character: number): boolean {
  let inStr = false;
  for (let i = 0; i < character && i < lineText.length; i++) {
    if (lineText[i] === '"') inStr = !inStr;
  }
  return inStr;
}

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
