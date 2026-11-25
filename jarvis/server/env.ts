// .env файлини (агар бўлса) ўқийди. Мавжуд муҳит ўзгарувчилари устун туради.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined && v !== '') process.env[m[1]] = v;
  }
}
