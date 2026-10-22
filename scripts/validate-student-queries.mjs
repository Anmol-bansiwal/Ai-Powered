/**
 * Prefer: npm run validate:student-queries
 * (runs scripts/validate-student-queries.ts via ts-node)
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [
    '-r',
    'ts-node/register/transpile-only',
    join(root, 'scripts/validate-student-queries.ts'),
  ],
  { stdio: 'inherit', cwd: root },
);
process.exit(result.status ?? 1);
