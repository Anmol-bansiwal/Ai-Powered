import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const RELATED_SCORE = 0.45;

export function loadLabels() {
  return JSON.parse(
    readFileSync(join(ROOT, 'eval/retrieval-labels.json'), 'utf8'),
  );
}

export function recallAt(ranks, k) {
  if (ranks.length === 0) return 0;
  return (
    ranks.filter((rank) => rank !== null && rank <= k).length / ranks.length
  );
}

export function meanReciprocalRank(ranks) {
  if (ranks.length === 0) return 0;
  const total = ranks.reduce(
    (sum, rank) => sum + (rank === null ? 0 : 1 / rank),
    0,
  );
  return total / ranks.length;
}

export function bestRelevantRank(ids, relevantIds) {
  let best = null;
  for (const id of relevantIds) {
    const index = ids.indexOf(id);
    if (index === -1) continue;
    const rank = index + 1;
    if (best === null || rank < best) best = rank;
  }
  return best;
}

export function metricsFromRanks(ranks) {
  return {
    n: ranks.length,
    recallAt1: recallAt(ranks, 1),
    recallAt3: recallAt(ranks, 3),
    mrr: meanReciprocalRank(ranks),
  };
}

export function pct(count, total) {
  return total === 0 ? 0 : count / total;
}

export function isUnrelatedNegative(row) {
  return (
    row.type === 'unrelated' ||
    row.type === 'hard-negative' ||
    row.decision === 'no-relevant-result' ||
    /mona lisa|capital of|hamlet|photosynthesis|ethanol|japan|penicillin|australia|sourdough|pride and prejudice|fifa|nginx|chocolate cake|eiffel|dns|trademark|allergies|french revolution/i.test(
      row.query,
    )
  );
}

export function collectCases(labels) {
  const positives = [];
  const hardNegatives = [];
  const seen = new Set();

  function addPositive(set, entry) {
    if (!entry.relevantIds?.length) return;
    const key = `pos:${entry.query}`;
    if (seen.has(key)) return;
    seen.add(key);
    positives.push({
      set,
      type: entry.type ?? 'unknown',
      query: entry.query,
      relevantIds: entry.relevantIds,
    });
  }

  function addNegative(set, entry) {
    if (entry.relevantIds?.length) return;
    const key = `neg:${entry.query}`;
    if (seen.has(key)) return;
    seen.add(key);
    hardNegatives.push({
      set,
      type: entry.type ?? 'unknown',
      query: entry.query,
      decision: entry.decision ?? null,
    });
  }

  for (const entry of labels.confirmed ?? []) {
    if (entry.relevantIds?.length) addPositive('confirmed', entry);
    else addNegative('confirmed', entry);
  }
  for (const entry of labels.informal ?? []) {
    addPositive('informal', entry);
  }
  for (const entry of labels.reviewedConfirmed ?? []) {
    if (entry.decision === 'accepted') addPositive('reviewedConfirmed', entry);
    else if (
      entry.decision === 'no-relevant-result' ||
      entry.type === 'unrelated'
    ) {
      addNegative('reviewedConfirmed', entry);
    }
  }
  for (const entry of labels.expandedConfirmed ?? []) {
    if (entry.decision === 'accepted') addPositive('expandedConfirmed', entry);
    else if (
      entry.decision === 'no-relevant-result' ||
      entry.type === 'unrelated'
    ) {
      addNegative('expandedConfirmed', entry);
    }
  }
  for (const entry of labels.round2 ?? []) {
    if (entry.decision === 'accepted') addPositive('round2', entry);
    else if (
      entry.decision === 'no-relevant-result' ||
      entry.type === 'unrelated'
    ) {
      addNegative('round2', entry);
    }
  }

  return { positives, hardNegatives };
}

/**
 * Collect labelled queries for scoring.
 * @param {{ requireIndependent?: boolean, setName?: string }} options
 *   requireIndependent true (default): only sawBank === false (promotion sample).
 *   requireIndependent false: score labelled rows even if sawBank true (candidate/labeller sets).
 */
export function collectStudentCases(studentFile, options = {}) {
  const requireIndependent = options.requireIndependent !== false;
  const setName = options.setName ?? 'student';
  const positives = [];
  const hardNegatives = [];
  const skipped = [];
  for (const entry of studentFile.queries ?? []) {
    if (requireIndependent && entry.sawBank !== false) {
      skipped.push({
        id: entry.id,
        reason:
          entry.sawBank === true
            ? 'sawBank true — not independent'
            : 'sawBank missing or invalid',
      });
      continue;
    }
    const status = entry.label?.status;
    if (status === 'relevant' && entry.label.relevantIds?.length) {
      positives.push({
        set: setName,
        type: entry.label.type ?? entry.queryStyle ?? 'student',
        query: entry.query,
        relevantIds: entry.label.relevantIds,
        studentId: entry.id,
        subject: entry.subject ?? null,
        queryStyle: entry.queryStyle ?? null,
      });
    } else if (status === 'no-relevant-result') {
      hardNegatives.push({
        set: setName,
        type: entry.label.type ?? 'unrelated',
        query: entry.query,
        decision: 'no-relevant-result',
        studentId: entry.id,
        subject: entry.subject ?? null,
        queryStyle: entry.queryStyle ?? null,
      });
    } else {
      skipped.push({
        id: entry.id,
        reason: `not scored (status=${status ?? 'missing'})`,
      });
    }
  }
  return { positives, hardNegatives, skipped };
}

export async function postJson(base, path, body) {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const ms = performance.now() - started;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `${path} ${response.status}: ${json.message ?? json.error ?? text}`,
    );
  }
  return { json, ms };
}
