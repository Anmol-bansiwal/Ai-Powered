export function recallAt(ranks: Array<number | null>, k: number): number {
  if (ranks.length === 0) {
    return 0;
  }
  const hits = ranks.filter((rank) => rank !== null && rank <= k).length;
  return hits / ranks.length;
}

export function meanReciprocalRank(ranks: Array<number | null>): number {
  if (ranks.length === 0) {
    return 0;
  }
  const total = ranks.reduce<number>(
    (sum, rank) => sum + (rank === null ? 0 : 1 / rank),
    0,
  );
  return total / ranks.length;
}

export function firstRelevantRank(
  ids: string[],
  relevantId: string,
): number | null {
  const index = ids.indexOf(relevantId);
  return index === -1 ? null : index + 1;
}

/** Best (lowest) rank among any labelled relevant id; null if none retrieved. */
export function bestRelevantRank(
  ids: string[],
  relevantIds: string[],
): number | null {
  let best: number | null = null;
  for (const relevantId of relevantIds) {
    const rank = firstRelevantRank(ids, relevantId);
    if (rank !== null && (best === null || rank < best)) {
      best = rank;
    }
  }
  return best;
}
