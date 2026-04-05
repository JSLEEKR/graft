export function resolve(...args) { return args[args.length - 1]; }
export function join(...args) { return args.join('/'); }
export function dirname(p) { return p.split('/').slice(0, -1).join('/') || '.'; }
export function basename(p) { return p.split('/').pop() || ''; }
export function extname(p) { const m = p.match(/\.[^.]+$/); return m ? m[0] : ''; }
export default { resolve, join, dirname, basename, extname };
