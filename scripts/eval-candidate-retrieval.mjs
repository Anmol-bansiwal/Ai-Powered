/**
 * Preliminary vector vs hybrid on labeller-constructed CBSE-style candidates.
 * NOT the independent promotion sample.
 *
 * Usage: npm run eval:candidate
 * Optional: EVAL_ONLY_IDS=c001,c002,c015 node scripts/eval-candidate-retrieval.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...process.env,
  EVAL_REQUIRE_INDEPENDENT: 'false',
  EVAL_QUERIES_FILE: 'eval/candidate-paper-queries.json',
  EVAL_REPORT_FILE: 'eval/candidate-hybrid-report.json',
};
const result = spawnSync(
  process.execPath,
  [join(root, 'scripts/eval-student-retrieval.mjs')],
  { stdio: 'inherit', cwd: root, env },
);
process.exit(result.status ?? 1);
