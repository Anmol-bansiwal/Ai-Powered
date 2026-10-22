/**
 * Vector vs hybrid on the auto-labelled 100-candidate set.
 * NOT the independent promotion sample.
 *
 * Usage: npm run eval:candidate100
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...process.env,
  EVAL_REQUIRE_INDEPENDENT: 'false',
  EVAL_QUERIES_FILE: 'eval/edusearch_100_candidate_queries.labeled.json',
  EVAL_REPORT_FILE: 'eval/candidate100-hybrid-report.json',
};
const result = spawnSync(
  process.execPath,
  [join(root, 'scripts/eval-student-retrieval.mjs')],
  { stdio: 'inherit', cwd: root, env },
);
process.exit(result.status ?? 1);
