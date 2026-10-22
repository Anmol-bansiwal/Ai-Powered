/**
 * Live evaluation: original-query vector search vs hybrid (vector + lexical RRF).
 * Requires a running API (default http://localhost:3517) and OpenAI for embeddings.
 *
 * Usage:
 *   npm run eval:hybrid
 *   EVAL_BASE_URL=http://localhost:3000 npm run eval:hybrid
 *
 * Production search/answer stay on vector-only. Writes eval/hybrid-report.json.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELATED_SCORE,
  bestRelevantRank,
  collectCases,
  isUnrelatedNegative,
  loadLabels,
  metricsFromRanks,
  pct,
  postJson,
} from './eval-label-cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.EVAL_BASE_URL ?? 'http://localhost:3517';
const LIMIT = 10;

const labels = loadLabels();

function summarizeHybrid(hits) {
  return (hits ?? []).map((hit) => ({
    rank: hit.rank,
    id: hit.id,
    vectorRank: hit.vectorRank,
    lexicalRank: hit.lexicalRank,
    pageReference: hit.pageReference,
    preview: String(hit.questionText ?? '').slice(0, 80),
  }));
}

function summarizeVector(hits) {
  return (hits ?? []).map((hit, index) => ({
    rank: index + 1,
    id: hit.id,
    score: hit.score,
    pageReference: hit.pageReference,
    preview: String(hit.questionText ?? '').slice(0, 80),
  }));
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
    vectorHits: summarizeVector(vectorCall.json.results).slice(0, 3),
    hybridHits: summarizeHybrid(hybridCall.json.hybrid).slice(0, 3),
    lexicalHitCount: hybridCall.json.lexical.length,
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
  // Hybrid list has no cosine score; treat lexical contribution as a signal
  // and use the vector top score for the shared relatedness threshold.
  return {
    ...entry,
    vectorTopScore,
    vectorLatencyMs: Math.round(vectorCall.ms),
    hybridLatencyMs: Math.round(hybridCall.ms),
    hybridTopId: hybridCall.json.hybrid[0]?.id ?? null,
    lexicalHitCount: hybridCall.json.lexical.length,
    retrievalFalsePositiveVector:
      vectorTopScore !== null && vectorTopScore >= RELATED_SCORE,
    answerStatus: answerCall.json.status,
    answerCorrectlyRejected:
      answerCall.json.status === 'out_of_scope' ||
      answerCall.json.status === 'insufficient',
    outOfScope: answerCall.json.status === 'out_of_scope',
  };
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function main() {
  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    throw new Error(`API not healthy at ${BASE}`);
  }

  const { positives, hardNegatives } = collectCases(labels);
  console.log(
    `Evaluating hybrid vs vector on ${positives.length} positives and ${hardNegatives.length} hard negatives against ${BASE}`,
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

  const bySet = {};
  for (const set of [...new Set(positives.map((item) => item.set))]) {
    const rows = positiveResults.filter((row) => row.set === set);
    bySet[set] = {
      vector: metricsFromRanks(rows.map((row) => row.vectorRank)),
      hybrid: metricsFromRanks(rows.map((row) => row.hybridRank)),
    };
  }

  const byType = {};
  for (const type of [...new Set(positives.map((item) => item.type))]) {
    const rows = positiveResults.filter((row) => row.type === type);
    byType[type] = {
      vector: metricsFromRanks(rows.map((row) => row.vectorRank)),
      hybrid: metricsFromRanks(rows.map((row) => row.hybridRank)),
    };
  }

  const unrelated = negativeResults.filter(isUnrelatedNegative);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    experiment: 'A — hybrid (vector + Postgres full-text, RRF)',
    productionBaseline:
      'Original-query text-embedding-3-small vector search. Hybrid remains experimental until it beats this baseline on rank metrics without hurting hard negatives.',
    promotionDecision:
      'No production changes. Next milestone is independent student labels + repeated latency (see eval/NEXT_MILESTONE.md). Do not tune hybrid weights until the eval set is frozen. text-embedding-3-large and rewrite promotion stay deferred.',
    counts: {
      positives: positives.length,
      hardNegatives: hardNegatives.length,
      unrelatedChecked: unrelated.length,
    },
    retrieval: {
      overall: {
        vector: metricsFromRanks(vectorRanks),
        hybrid: metricsFromRanks(hybridRanks),
      },
      bySet,
      byType,
      rankingWins: {
        hybridBetter: positiveResults.filter(
          (row) =>
            row.hybridRank !== null &&
            (row.vectorRank === null || row.hybridRank < row.vectorRank),
        ).length,
        vectorBetter: positiveResults.filter(
          (row) =>
            row.vectorRank !== null &&
            (row.hybridRank === null || row.vectorRank < row.hybridRank),
        ).length,
        tied: positiveResults.filter(
          (row) => row.vectorRank === row.hybridRank,
        ).length,
      },
      // Single-pass means only — use npm run eval:latency for median/p95.
      latencyMsSinglePass: {
        vectorMean: Math.round(
          mean(positiveResults.map((row) => row.vectorLatencyMs)),
        ),
        hybridMean: Math.round(
          mean(positiveResults.map((row) => row.hybridLatencyMs)),
        ),
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
          unrelated.filter((row) => row.outOfScope).length,
          unrelated.length,
        ),
        correctlyRejectedRate: pct(
          unrelated.filter((row) => row.answerCorrectlyRejected).length,
          unrelated.length,
        ),
        answeredFalsePositiveRate: pct(
          unrelated.filter((row) => row.answerStatus === 'answered').length,
          unrelated.length,
        ),
        byStatus: unrelated.reduce((acc, row) => {
          acc[row.answerStatus] = (acc[row.answerStatus] ?? 0) + 1;
          return acc;
        }, {}),
      },
    },
    positives: positiveResults,
    negatives: negativeResults,
  };

  const outPath = join(ROOT, 'eval/hybrid-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const v = report.retrieval.overall.vector;
  const h = report.retrieval.overall.hybrid;
  console.log('\n=== Hybrid evaluation report ===');
  console.log(`Positives: ${v.n}`);
  console.log(
    `Vector  Recall@1=${v.recallAt1.toFixed(3)} Recall@3=${v.recallAt3.toFixed(3)} MRR=${v.mrr.toFixed(3)} (single-pass latency~${report.retrieval.latencyMsSinglePass.vectorMean}ms)`,
  );
  console.log(
    `Hybrid  Recall@1=${h.recallAt1.toFixed(3)} Recall@3=${h.recallAt3.toFixed(3)} MRR=${h.mrr.toFixed(3)} (single-pass latency~${report.retrieval.latencyMsSinglePass.hybridMean}ms)`,
  );
  console.log(
    `Ranking: hybridBetter=${report.retrieval.rankingWins.hybridBetter} vectorBetter=${report.retrieval.rankingWins.vectorBetter} tied=${report.retrieval.rankingWins.tied}`,
  );
  console.log('Per-type Recall@1 (vector → hybrid):');
  for (const [type, metrics] of Object.entries(byType)) {
    console.log(
      `  ${type}: ${metrics.vector.recallAt1.toFixed(3)} → ${metrics.hybrid.recallAt1.toFixed(3)} (n=${metrics.vector.n})`,
    );
  }
  console.log(
    `Unrelated answerability (production answer path): out_of_scope=${report.hardNegatives.answerability.outOfScopeRate.toFixed(3)} answeredFP=${report.hardNegatives.answerability.answeredFalsePositiveRate.toFixed(3)}`,
  );
  console.log(`Wrote ${outPath}`);
  console.log(`Decision: ${report.promotionDecision}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
