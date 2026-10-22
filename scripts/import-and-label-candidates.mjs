/**
 * Import eval/edusearch_100_candidate_queries.csv → JSON (our schema),
 * then propose labels from live vector search (no invented UUIDs).
 *
 * Usage:
 *   node scripts/import-and-label-candidates.mjs
 *   EVAL_BASE_URL=http://localhost:3517 node scripts/import-and-label-candidates.mjs
 *
 * Writes:
 *   eval/edusearch_100_candidate_queries.json  (pending + metadata)
 *   eval/edusearch_100_candidate_queries.labeled.json  (auto-labelled for scoring)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.EVAL_BASE_URL ?? 'http://localhost:3517';
const RELEVANT_MIN = Number(process.env.EVAL_LABEL_MIN_SCORE ?? '0.48');
const NEGATIVE_MAX = Number(process.env.EVAL_LABEL_NEG_MAX ?? '0.40');

const STYLE = {
  Informal: 'informal',
  Numeric: 'numeric',
  Conceptual: 'conceptual',
  'Exact-ish': 'exact',
  Unrelated: 'unrelated',
  'Hard negative': 'hard-negative',
};

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const obj = {};
    header.forEach((key, index) => {
      obj[key] = cells[index] ?? '';
    });
    return obj;
  });
}

function toRecord(row) {
  return {
    id: row.queryId,
    query: row.query,
    subject: row.subject,
    queryStyle: STYLE[row.queryType] ?? String(row.queryType).toLowerCase(),
    sawBank: true,
    collectedOn: '2026-10-16',
    expectedTopic: row.expectedTopic,
    notes: row.notes,
    label: {
      status: 'pending',
      relevantIds: [],
      suggestedIds: [],
      type: STYLE[row.queryType] ?? 'candidate',
      reason: '',
      labeledBy: '',
    },
  };
}

async function search(query) {
  const response = await fetch(`${BASE}/questions/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 3 }),
  });
  if (!response.ok) {
    throw new Error(`search failed ${response.status} for ${query}`);
  }
  return response.json();
}

function isNegativeType(record) {
  return (
    record.queryStyle === 'unrelated' ||
    record.queryStyle === 'hard-negative' ||
    /^Unrelated|Out-of-bank/i.test(record.expectedTopic ?? '')
  );
}

function proposeLabel(record, hits) {
  const top = hits[0];
  const topScore = top?.score ?? 0;
  const preview = String(top?.questionText ?? '').slice(0, 100);

  if (isNegativeType(record)) {
    if (topScore < NEGATIVE_MAX) {
      return {
        status: 'no-relevant-result',
        relevantIds: [],
        suggestedIds: [],
        type: record.queryStyle,
        reason: `Auto: top score ${topScore.toFixed(3)} < ${NEGATIVE_MAX}; treated as no relevant bank question.`,
        labeledBy: 'auto',
        autoTop: top
          ? { id: top.id, score: topScore, preview }
          : null,
      };
    }
    return {
      status: 'unresolved',
      relevantIds: [],
      suggestedIds: top ? [top.id] : [],
      type: record.queryStyle,
      reason: `Auto: negative candidate but top score ${topScore.toFixed(3)} >= ${NEGATIVE_MAX}; needs human review.`,
      labeledBy: 'auto',
      autoTop: top ? { id: top.id, score: topScore, preview } : null,
    };
  }

  if (top && topScore >= RELEVANT_MIN) {
    return {
      status: 'relevant',
      relevantIds: [top.id],
      suggestedIds: hits.slice(1).map((hit) => hit.id),
      type: record.queryStyle,
      reason: `Auto: top hit score ${topScore.toFixed(3)} >= ${RELEVANT_MIN}. Confirm topic "${record.expectedTopic}".`,
      labeledBy: 'auto',
      autoTop: { id: top.id, score: topScore, preview },
    };
  }

  if (top && topScore >= NEGATIVE_MAX) {
    return {
      status: 'unresolved',
      relevantIds: [],
      suggestedIds: [top.id],
      type: record.queryStyle,
      reason: `Auto: ambiguous score ${topScore.toFixed(3)}; needs human review for "${record.expectedTopic}".`,
      labeledBy: 'auto',
      autoTop: { id: top.id, score: topScore, preview },
    };
  }

  return {
    status: 'no-relevant-result',
    relevantIds: [],
    suggestedIds: [],
    type: record.queryStyle,
    reason: `Auto: top score ${topScore.toFixed(3)} too low for expected topic "${record.expectedTopic}".`,
    labeledBy: 'auto',
    autoTop: top ? { id: top.id, score: topScore, preview } : null,
  };
}

async function main() {
  const csvPath = join(ROOT, 'eval/edusearch_100_candidate_queries.csv');
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const queries = rows.map(toRecord);

  const pendingFile = {
    purpose:
      'Labeller-constructed 100-query candidate set for exploratory vector-vs-hybrid comparison. NOT independent student submissions. Do not copy into student-queries.json as promotion evidence.',
    kind: 'labeller-constructed-candidate-100',
    notIndependentPromotionSample: true,
    corpus: {
      database: 'edusearch_ai',
      questionCount: 68,
      subjects: ['Physics', 'Chemistry'],
    },
    queries,
  };
  writeFileSync(
    join(ROOT, 'eval/edusearch_100_candidate_queries.json'),
    JSON.stringify(pendingFile, null, 2),
  );
  console.log(`Wrote pending JSON (${queries.length} queries)`);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    throw new Error(`API not healthy at ${BASE}`);
  }

  const labeledQueries = [];
  for (const [index, record] of queries.entries()) {
    process.stdout.write(
      `  label ${index + 1}/${queries.length}: ${record.id}…\n`,
    );
    const { results } = await search(record.query);
    labeledQueries.push({
      ...record,
      label: proposeLabel(record, results),
    });
  }

  const counts = labeledQueries.reduce(
    (acc, item) => {
      acc[item.label.status] = (acc[item.label.status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const labeledFile = {
    ...pendingFile,
    purpose:
      pendingFile.purpose +
      ' Auto-labelled from live search; review unresolved before trusting promotion-adjacent decisions.',
    autoLabel: {
      baseUrl: BASE,
      relevantMinScore: RELEVANT_MIN,
      negativeMaxScore: NEGATIVE_MAX,
      generatedAt: new Date().toISOString(),
      counts,
    },
    queries: labeledQueries,
  };

  const outPath = join(
    ROOT,
    'eval/edusearch_100_candidate_queries.labeled.json',
  );
  writeFileSync(outPath, JSON.stringify(labeledFile, null, 2));
  console.log('Auto-label counts:', counts);
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
