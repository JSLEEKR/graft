import { createRequire } from 'node:module';

let version: string;
try {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json');
  version = pkg.version;
} catch {
  version = '0.0.0-unknown';
}

export const VERSION = version;
