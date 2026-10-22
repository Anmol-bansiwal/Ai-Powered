/**
 * Repeated latency comparison: vector vs hybrid under the same conditions.
 * Reports median and p95 for cold (first) and warm (subsequent) calls.
 *
 * Usage:
 *   npm run eval:latency
 *   EVAL_BASE_URL=http://localhost:3517 EVAL_LATENCY_REPEATS=20 npm run eval:latency
 *
 * Does not change production. Writes eval/latency-report.json.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCases, loadLabels, postJson } from './eval-label-cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.EVAL_BASE_URL ?? 'http://localhost:3517';
const REPEATS = Math.max(
  5,
  Number.parseInt(process.env.EVAL_LATENCY_REPEATS ?? '15', 10) || 15,
);
const LIMIT = 5;

// Fixed probe set: mix of exact-ish, numeric, informal, and unrelated.
const PROBES = [
  "Newton's second law of motion",
  'series LCR circuit, 10 V across each element',
  'glass sphere of radius 6 cm and refractive index 1.5',
  'that LCR one where 10 volt is across each',
  'p-nitrotoluene Etard reaction',
  'electric dipole in field 2 x 10^{5} N/C at 30 degrees',
  'Who painted the Mona Lisa?',
  'What is the capital of Japan?',
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.length
      ? Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length)
      : 0,
  };
}

async function timePath(path, query) {
  const { ms } = await postJson(BASE, path, { query, limit: LIMIT });
  return Math.round(ms);
}

async function runSeries(path, query, repeats) {
  const samples = [];
  for (let i = 0; i < repeats; i += 1) {
    samples.push(await timePath(path, query));
  }
  return {
    query,
    path,
    coldMs: samples[0],
    warm: summarize(samples.slice(1)),
    all: summarize(samples),
    samples,
  };
}

async function main() {
  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    throw new Error(`API not healthy at ${BASE}`);
  }

  // Prefer labelled positives when available; fall back to the fixed probe list.
  const { positives } = collectCases(loadLabels());
  const queries =
    positives.length >= 4
      ? [
          ...new Set([
            ...PROBES,
            ...positives.slice(0, 8).map((item) => item.query),
          ]),
        ].slice(0, 10)
      : PROBES;

  console.log(
    `Latency: ${queries.length} queries × ${REPEATS} repeats each (vector + hybrid) at ${BASE}`,
  );

  const perQuery = [];
  for (const [index, query] of queries.entries()) {
    process.stdout.write(
      `  ${index + 1}/${queries.length}: ${query.slice(0, 50)}…\n`,
    );
    const vector = await runSeries('/questions/search', query, REPEATS);
    const hybrid = await runSeries(
      '/questions/search/hybrid',
      query,
      REPEATS,
    );
    perQuery.push({ query, vector, hybrid });
  }

  const vectorWarm = perQuery.flatMap((row) => row.vector.samples.slice(1));
  const hybridWarm = perQuery.flatMap((row) => row.hybrid.samples.slice(1));
  const vectorCold = perQuery.map((row) => row.vector.coldMs);
  const hybridCold = perQuery.map((row) => row.hybrid.coldMs);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    repeatsPerQuery: REPEATS,
    note: 'Cold = first call per query/path after process start of that series. Warm = remaining repeats. Production unchanged.',
    overall: {
      vector: {
        cold: summarize(vectorCold),
        warm: summarize(vectorWarm),
      },
      hybrid: {
        cold: summarize(hybridCold),
        warm: summarize(hybridWarm),
      },
    },
    perQuery,
  };

  const outPath = join(ROOT, 'eval/latency-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const v = report.overall.vector.warm;
  const h = report.overall.hybrid.warm;
  console.log('\n=== Latency report (warm) ===');
  console.log(
    `Vector  median=${v.median}ms p95=${v.p95}ms mean=${v.mean}ms (n=${v.n})`,
  );
  console.log(
    `Hybrid  median=${h.median}ms p95=${h.p95}ms mean=${h.mean}ms (n=${h.n})`,
  );
  console.log(
    `Cold median: vector=${report.overall.vector.cold.median}ms hybrid=${report.overall.hybrid.cold.median}ms`,
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
