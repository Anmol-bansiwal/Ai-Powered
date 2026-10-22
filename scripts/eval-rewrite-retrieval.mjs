/**
 * Live evaluation of original vs rewritten vector search.
 * Requires a running API (default http://localhost:3517) and OpenAI.
 *
 * Usage:
 *   node scripts/eval-rewrite-retrieval.mjs
 *   EVAL_BASE_URL=http://localhost:3000 node scripts/eval-rewrite-retrieval.mjs
 *
 * Does not change production endpoints. Writes eval/rewrite-report.json.
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

async function post(path, body) {
  const { json } = await postJson(BASE, path, body);
  return json;
}

function summarizeHits(hits) {
  return (hits ?? []).map((hit, index) => ({
    rank: index + 1,
    id: hit.id,
    score: hit.score,
    pageReference: hit.pageReference,
    preview: String(hit.questionText ?? '').slice(0, 80),
  }));
}

async function evaluatePositive(entry) {
  const rewrite = await post('/questions/search/rewritten', {
    query: entry.query,
    limit: LIMIT,
  });
  const originalIds = rewrite.original.map((hit) => hit.id);
  const rewrittenIds = rewrite.rewrittenResults.map((hit) => hit.id);
  const originalRank = bestRelevantRank(originalIds, entry.relevantIds);
  const rewrittenRank = bestRelevantRank(rewrittenIds, entry.relevantIds);
  return {
    ...entry,
    rewritten: rewrite.rewritten,
    rewrittenQuery: rewrite.rewrittenQuery,
    originalRank,
    rewrittenRank,
    originalTopScore: rewrite.original[0]?.score ?? null,
    rewrittenTopScore: rewrite.rewrittenResults[0]?.score ?? null,
    originalTopId: rewrite.original[0]?.id ?? null,
    rewrittenTopId: rewrite.rewrittenResults[0]?.id ?? null,
    originalHits: summarizeHits(rewrite.original).slice(0, 3),
    rewrittenHits: summarizeHits(rewrite.rewrittenResults).slice(0, 3),
  };
}

async function evaluateNegative(entry) {
  const rewrite = await post('/questions/search/rewritten', {
    query: entry.query,
    limit: LIMIT,
  });
  const answerOriginal = await post('/questions/answer', {
    query: entry.query,
    limit: LIMIT,
  });
  // Answer production path still uses the original query (by design).
  const originalTopScore = rewrite.original[0]?.score ?? null;
  const rewrittenTopScore = rewrite.rewrittenResults[0]?.score ?? null;
  return {
    ...entry,
    rewritten: rewrite.rewritten,
    rewrittenQuery: rewrite.rewrittenQuery,
    originalTopScore,
    rewrittenTopScore,
    retrievalFalsePositiveOriginal:
      originalTopScore !== null && originalTopScore >= RELATED_SCORE,
    retrievalFalsePositiveRewritten:
      rewrittenTopScore !== null && rewrittenTopScore >= RELATED_SCORE,
    answerStatus: answerOriginal.status,
    answerCorrectlyRejected:
      answerOriginal.status === 'out_of_scope' ||
      answerOriginal.status === 'insufficient',
    outOfScope: answerOriginal.status === 'out_of_scope',
  };
}

async function main() {
  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    throw new Error(`API not healthy at ${BASE}`);
  }

  const { positives, hardNegatives } = collectCases(labels);
  console.log(
    `Evaluating ${positives.length} positives and ${hardNegatives.length} hard negatives against ${BASE}`,
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

  const originalRanks = positiveResults.map((row) => row.originalRank);
  const rewrittenRanks = positiveResults.map((row) => row.rewrittenRank);

  const bySet = {};
  for (const set of [...new Set(positives.map((p) => p.set))]) {
    const rows = positiveResults.filter((row) => row.set === set);
    bySet[set] = {
      original: metricsFromRanks(rows.map((row) => row.originalRank)),
      rewritten: metricsFromRanks(rows.map((row) => row.rewrittenRank)),
    };
  }

  const unrelated = negativeResults.filter(isUnrelatedNegative);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    promotionDecision:
      'No production rollout. Keep /questions/search/rewritten experimental and text-embedding-3-small in production until rewritten Recall@1/MRR and hard-negative rates clearly beat the original baseline.',
    corpusNote:
      labels.purpose +
      ' Score positives with relevantIds. Hard negatives include unrelated and no-relevant-result labels. unresolved is not scored.',
    counts: {
      positives: positives.length,
      hardNegatives: hardNegatives.length,
      unrelatedChecked: unrelated.length,
      rewriteApplied: positiveResults.filter((row) => row.rewritten).length,
    },
    retrieval: {
      overall: {
        original: metricsFromRanks(originalRanks),
        rewritten: metricsFromRanks(rewrittenRanks),
      },
      bySet,
      rankingWins: {
        rewrittenBetter: positiveResults.filter(
          (row) =>
            row.rewrittenRank !== null &&
            (row.originalRank === null || row.rewrittenRank < row.originalRank),
        ).length,
        originalBetter: positiveResults.filter(
          (row) =>
            row.originalRank !== null &&
            (row.rewrittenRank === null || row.originalRank < row.rewrittenRank),
        ).length,
        tied: positiveResults.filter(
          (row) => row.originalRank === row.rewrittenRank,
        ).length,
      },
    },
    hardNegatives: {
      relatedThreshold: RELATED_SCORE,
      retrievalFalsePositiveRate: {
        original: pct(
          negativeResults.filter((row) => row.retrievalFalsePositiveOriginal)
            .length,
          negativeResults.length,
        ),
        rewritten: pct(
          negativeResults.filter((row) => row.retrievalFalsePositiveRewritten)
            .length,
          negativeResults.length,
        ),
      },
      answerability: {
        // Production /questions/answer still embeds the original query.
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
      note: 'Retrieval always returns nearest neighbours. A retrieval false positive is top score >= 0.45 with no labelled relevant id. Answerability false positive is status answered on an unrelated query.',
    },
    positives: positiveResults,
    negatives: negativeResults,
  };

  const outPath = join(ROOT, 'eval/rewrite-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const o = report.retrieval.overall.original;
  const r = report.retrieval.overall.rewritten;
  console.log('\n=== Rewrite evaluation report ===');
  console.log(`Positives: ${o.n}`);
  console.log(
    `Original  Recall@1=${o.recallAt1.toFixed(3)} Recall@3=${o.recallAt3.toFixed(3)} MRR=${o.mrr.toFixed(3)}`,
  );
  console.log(
    `Rewritten Recall@1=${r.recallAt1.toFixed(3)} Recall@3=${r.recallAt3.toFixed(3)} MRR=${r.mrr.toFixed(3)}`,
  );
  console.log(
    `Ranking: rewrittenBetter=${report.retrieval.rankingWins.rewrittenBetter} originalBetter=${report.retrieval.rankingWins.originalBetter} tied=${report.retrieval.rankingWins.tied}`,
  );
  console.log(
    `Hard-neg retrieval FP (top>=0.45): original=${report.hardNegatives.retrievalFalsePositiveRate.original.toFixed(3)} rewritten=${report.hardNegatives.retrievalFalsePositiveRate.rewritten.toFixed(3)}`,
  );
  console.log(
    `Unrelated answerability: out_of_scope=${report.hardNegatives.answerability.outOfScopeRate.toFixed(3)} correctlyRejected=${report.hardNegatives.answerability.correctlyRejectedRate.toFixed(3)} answeredFP=${report.hardNegatives.answerability.answeredFalsePositiveRate.toFixed(3)}`,
  );
  console.log(`Wrote ${outPath}`);
  console.log(`Decision: ${report.promotionDecision}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
