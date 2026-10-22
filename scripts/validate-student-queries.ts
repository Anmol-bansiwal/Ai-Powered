/**
 * Validates eval/student-queries.json. No OpenAI. No production changes.
 *
 * Usage: npm run validate:student-queries
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  knownIdsFromRetrievalLabels,
  validateStudentQueries,
} from '../src/questions/student-query-validation';

const ROOT = join(__dirname, '..');

function main(): void {
  const students = JSON.parse(
    readFileSync(join(ROOT, 'eval/student-queries.json'), 'utf8'),
  ) as { queries?: unknown };
  const labels = JSON.parse(
    readFileSync(join(ROOT, 'eval/retrieval-labels.json'), 'utf8'),
  ) as unknown;
  const known = knownIdsFromRetrievalLabels(labels);
  const report = validateStudentQueries(students, known);

  console.log('=== student-queries validation ===');
  console.log(JSON.stringify(report.counts, null, 2));
  for (const issue of report.errors) {
    console.error(`ERROR [${issue.code}] ${issue.id ?? '-'}: ${issue.message}`);
  }
  for (const issue of report.warnings) {
    console.warn(`WARN  [${issue.code}] ${issue.id ?? '-'}: ${issue.message}`);
  }
  if (!report.ok) {
    process.exitCode = 1;
    console.error('Validation failed.');
    return;
  }
  console.log('Validation passed.');
  if (report.counts.scorableIndependent === 0) {
    console.log(
      'No scorable independent queries yet — collect and label before npm run eval:student.',
    );
  }
}

main();
