export function readFileSync() { throw new Error('fs not available in browser'); }
export function writeFileSync() { throw new Error('fs not available in browser'); }
export function existsSync() { return false; }
export function mkdirSync() {}
export default { readFileSync, writeFileSync, existsSync, mkdirSync };
