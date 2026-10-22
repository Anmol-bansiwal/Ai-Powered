/**
 * Independent student-query evaluation: vector vs hybrid.
 * Uses only sawBank===false records labelled relevant / no-relevant-result.
 *
 * Manual live run (OpenAI + DB). Not for CI.
 *
 * Usage:
 *   npm run validate:student-queries
 *   npm run eval:student
 *   EVAL_BASE_URL=http://localhost:3517 npm run eval:student
 *
 * Writes eval/student-hybrid-report.json
 * Does not change production endpoints or frozen retrieval-labels.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  RELATED_SCORE,
  bestRelevantRank,
  collectStudentCases,
  metricsFromRanks,
  pct,
  postJson,
} from './eval-label-cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.EVAL_BASE_URL ?? 'http://localhost:3517';
const LIMIT = 10;
const QUERIES_FILE =
  process.env.EVAL_QUERIES_FILE ?? 'eval/student-queries.json';
const REPORT_FILE =
  process.env.EVAL_REPORT_FILE ?? 'eval/student-hybrid-report.json';
const REQUIRE_INDEPENDENT = process.env.EVAL_REQUIRE_INDEPENDENT !== 'false';
const ONLY_IDS = new Set(
  (process.env.EVAL_ONLY_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const require = createRequire(import.meta.url);

function loadValidation() {
  try {
    return require(join(ROOT, 'dist/questions/student-query-validation.js'));
  } catch {
    require('ts-node/register/transpile-only');
    return require(join(ROOT, 'src/questions/student-query-validation.ts'));
  }
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeHits(hits, hybrid = false) {
  return (hits ?? []).map((hit, index) =>
    hybrid
      ? {
          rank: hit.rank,
          id: hit.id,
          vectorRank: hit.vectorRank,
          lexicalRank: hit.lexicalRank,
          preview: String(hit.questionText ?? '').slice(0, 80),
        }
      : {
          rank: index + 1,
          id: hit.id,
          score: hit.score,
          preview: String(hit.questionText ?? '').slice(0, 80),
        },
  );
}

async function evaluatePositive(entry) {
  const body = { query: entry.query, limit: LIMIT };
  const [vectorCall, hybridCall] = await Promise.all([
    postJson(BASE, '/questions/search', body),
    postJson(BASE, '/questions/search/hybrid', body),
  ]);
  const vectorIds = vectorCall.json.results.map((hit) => hit.id);
  const hybridIds = hybridCall.json.hybrid.map((hit) => hit.id);
  return {
    ...entry,
    vectorRank: bestRelevantRank(vectorIds, entry.relevantIds),
    hybridRank: bestRelevantRank(hybridIds, entry.relevantIds),
    vectorTopScore: vectorCall.json.results[0]?.score ?? null,
    vectorLatencyMs: Math.round(vectorCall.ms),
    hybridLatencyMs: Math.round(hybridCall.ms),
    vectorHits: summarizeHits(vectorCall.json.results).slice(0, 3),
    hybridHits: summarizeHits(hybridCall.json.hybrid, true).slice(0, 3),
  };
}

async function evaluateNegative(entry) {
  const body = { query: entry.query, limit: LIMIT };
  const [vectorCall, hybridCall, answerCall] = await Promise.all([
    postJson(BASE, '/questions/search', body),
    postJson(BASE, '/questions/search/hybrid', body),
    postJson(BASE, '/questions/answer', body),
  ]);
  const vectorTopScore = vectorCall.json.results[0]?.score ?? null;
  return {
    ...entry,
    vectorTopScore,
    vectorLatencyMs: Math.round(vectorCall.ms),
    hybridLatencyMs: Math.round(hybridCall.ms),
    hybridTopId: hybridCall.json.hybrid[0]?.id ?? null,
    retrievalFalsePositiveVector:
      vectorTopScore !== null && vectorTopScore >= RELATED_SCORE,
    answerStatus: answerCall.json.status,
    outOfScope: answerCall.json.status === 'out_of_scope',
    answerCorrectlyRejected:
      answerCall.json.status === 'out_of_scope' ||
      answerCall.json.status === 'insufficient',
  };
}

async function main() {
  const { validateStudentQueries, knownIdsFromRetrievalLabels } =
    loadValidation();
  const queriesPath = join(ROOT, QUERIES_FILE);
  const students = JSON.parse(readFileSync(queriesPath, 'utf8'));
  const labels = JSON.parse(
    readFileSync(join(ROOT, 'eval/retrieval-labels.json'), 'utf8'),
  );

  // Structural validation is required for the independent file; candidate
  // sets often set sawBank true on purpose, so only warn there.
  if (REQUIRE_INDEPENDENT) {
    const validation = validateStudentQueries(
      students,
      knownIdsFromRetrievalLabels(labels),
    );
    if (!validation.ok) {
      console.error(`${QUERIES_FILE} failed validation. Fix errors first:`);
      for (const issue of validation.errors) {
        console.error(`  [${issue.code}] ${issue.id ?? '-'}: ${issue.message}`);
      }
      process.exit(1);
    }
  }

  let { positives, hardNegatives, skipped } = collectStudentCases(students, {
    requireIndependent: REQUIRE_INDEPENDENT,
    setName: REQUIRE_INDEPENDENT ? 'student' : 'candidate',
  });
  if (ONLY_IDS.size > 0) {
    positives = positives.filter((row) => ONLY_IDS.has(row.studentId));
    hardNegatives = hardNegatives.filter((row) => ONLY_IDS.has(row.studentId));
  }
  if (positives.length === 0 && hardNegatives.length === 0) {
    console.error(
      'No scorable independent queries (need sawBank:false + relevant/no-relevant-result labels).',
    );
    console.error(`Skipped ${skipped.length} records.`);
    process.exit(1);
  }

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    throw new Error(`API not healthy at ${BASE}`);
  }

  console.log(
    `${REQUIRE_INDEPENDENT ? 'Independent' : 'Candidate'} eval: ${positives.length} positives, ${hardNegatives.length} hard negatives, ${skipped.length} skipped @ ${BASE}`,
  );

  const positiveResults = [];
  for (const [index, entry] of positives.entries()) {
    process.stdout.write(
      `  positive ${index + 1}/${positives.length}: ${entry.query.slice(0, 60)}…\n`,
    );
    positiveResults.push(await evaluatePositive(entry));
  }

  const negativeResults = [];
  for (const [index, entry] of hardNegatives.entries()) {
    process.stdout.write(
      `  negative ${index + 1}/${hardNegatives.length}: ${entry.query.slice(0, 60)}…\n`,
    );
    negativeResults.push(await evaluateNegative(entry));
  }

  const vectorRanks = positiveResults.map((row) => row.vectorRank);
  const hybridRanks = positiveResults.map((row) => row.hybridRank);

  const byType = {};
  for (const type of [...new Set(positives.map((item) => item.type))]) {
    const rows = positiveResults.filter((row) => row.type === type);
    byType[type] = {
      vector: metricsFromRanks(rows.map((row) => row.vectorRank)),
      hybrid: metricsFromRanks(rows.map((row) => row.hybridRank)),
    };
  }

  const bySubject = {};
  for (const subject of [
    ...new Set(positives.map((item) => item.subject).filter(Boolean)),
  ]) {
    const rows = positiveResults.filter((row) => row.subject === subject);
    bySubject[subject] = {
      vector: metricsFromRanks(rows.map((row) => row.vectorRank)),
      hybrid: metricsFromRanks(rows.map((row) => row.hybridRank)),
    };
  }

  const improved = positiveResults.filter(
    (row) =>
      row.hybridRank !== null &&
      (row.vectorRank === null || row.hybridRank < row.vectorRank),
  );
  const regressed = positiveResults.filter(
    (row) =>
      row.vectorRank !== null &&
      (row.hybridRank === null || row.vectorRank < row.hybridRank),
  );
  const tied = positiveResults.filter(
    (row) => row.vectorRank === row.hybridRank,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    queriesFile: QUERIES_FILE,
    requireIndependent: REQUIRE_INDEPENDENT,
    onlyIds: [...ONLY_IDS],
    experiment: REQUIRE_INDEPENDENT
      ? 'Independent student queries — vector vs hybrid'
      : 'Candidate / labeller-constructed queries — vector vs hybrid (NOT the promotion sample)',
    productionBaseline:
      'Original-query text-embedding-3-small. Production endpoints unchanged.',
    promotionDecision: REQUIRE_INDEPENDENT
      ? 'Fill eval/PROMOTION_REPORT_TEMPLATE.md from this report. Do not promote from labeller round2 or candidate-paper queries alone.'
      : 'Preliminary only. Do not use this report for hybrid promotion. Collect real independent queries in student-queries.json.',
    notIndependentPromotionSample: students.notIndependentPromotionSample === true,
    validationCounts: null,
    skipped,
    counts: {
      positives: positives.length,
      hardNegatives: hardNegatives.length,
      skipped: skipped.length,
    },
    retrieval: {
      overall: {
        vector: metricsFromRanks(vectorRanks),
        hybrid: metricsFromRanks(hybridRanks),
      },
      byType,
      bySubject,
      rankingWins: {
        hybridBetter: improved.length,
        vectorBetter: regressed.length,
        tied: tied.length,
      },
      improvedQueries: improved.map((row) => ({
        id: row.studentId,
        query: row.query,
        vectorRank: row.vectorRank,
        hybridRank: row.hybridRank,
      })),
      regressedQueries: regressed.map((row) => ({
        id: row.studentId,
        query: row.query,
        vectorRank: row.vectorRank,
        hybridRank: row.hybridRank,
      })),
      latencyMsSinglePass: {
        vectorMean: Math.round(
          mean(positiveResults.map((row) => row.vectorLatencyMs)),
        ),
        hybridMean: Math.round(
          mean(positiveResults.map((row) => row.hybridLatencyMs)),
        ),
        note: 'Use npm run eval:latency for median/p95 cold+warm.',
      },
    },
    hardNegatives: {
      relatedThreshold: RELATED_SCORE,
      retrievalFalsePositiveRateVector: pct(
        negativeResults.filter((row) => row.retrievalFalsePositiveVector)
          .length,
        negativeResults.length,
      ),
      answerability: {
        outOfScopeRate: pct(
          negativeResults.filter((row) => row.outOfScope).length,
          negativeResults.length,
        ),
        correctlyRejectedRate: pct(
          negativeResults.filter((row) => row.answerCorrectlyRejected).length,
          negativeResults.length,
        ),
        answeredFalsePositiveRate: pct(
          negativeResults.filter((row) => row.answerStatus === 'answered')
            .length,
          negativeResults.length,
        ),
        byStatus: negativeResults.reduce((acc, row) => {
          acc[row.answerStatus] = (acc[row.answerStatus] ?? 0) + 1;
          return acc;
        }, {}),
      },
    },
    positives: positiveResults,
    negatives: negativeResults,
  };

  const outPath = join(ROOT, REPORT_FILE);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const v = report.retrieval.overall.vector;
  const h = report.retrieval.overall.hybrid;
  console.log(
    `\n=== ${REQUIRE_INDEPENDENT ? 'Independent student' : 'Candidate (preliminary)'} evaluation ===`,
  );
  console.log(`Positives: ${v.n}`);
  console.log(
    `Vector  Recall@1=${v.recallAt1.toFixed(3)} Recall@3=${v.recallAt3.toFixed(3)} MRR=${v.mrr.toFixed(3)}`,
  );
  console.log(
    `Hybrid  Recall@1=${h.recallAt1.toFixed(3)} Recall@3=${h.recallAt3.toFixed(3)} MRR=${h.mrr.toFixed(3)}`,
  );
  console.log(
    `Ranking: improved=${improved.length} regressed=${regressed.length} tied=${tied.length}`,
  );
  console.log(
    `Hard-neg answerability: out_of_scope=${report.hardNegatives.answerability.outOfScopeRate.toFixed(3)} answeredFP=${report.hardNegatives.answerability.answeredFalsePositiveRate.toFixed(3)}`,
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
