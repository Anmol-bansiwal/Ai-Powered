export const RRF_K = 60;

export type RankedDocument = {
  id: string;
  questionText: string;
  pageReference: string | null;
};

export type FusedDocument = RankedDocument & {
  vectorRank: number | null;
  lexicalRank: number | null;
};

export function fuseByReciprocalRank(
  vector: RankedDocument[],
  lexical: RankedDocument[],
): FusedDocument[] {
  const vectorRanks = ranksById(vector);
  const lexicalRanks = ranksById(lexical);
  const documents = new Map<string, RankedDocument>();
  for (const item of [...vector, ...lexical]) {
    if (!documents.has(item.id)) {
      documents.set(item.id, item);
    }
  }

  return [...documents.values()]
    .map((item) => ({
      ...item,
      vectorRank: vectorRanks.get(item.id) ?? null,
      lexicalRank: lexicalRanks.get(item.id) ?? null,
    }))
    .sort(compareFused);
}

function ranksById(items: RankedDocument[]): Map<string, number> {
  const ranks = new Map<string, number>();
  items.forEach((item, index) => {
    if (!ranks.has(item.id)) {
      ranks.set(item.id, index + 1);
    }
  });
  return ranks;
}

function compareFused(left: FusedDocument, right: FusedDocument): number {
  const scoreDelta = reciprocalScore(right) - reciprocalScore(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  const vectorDelta =
    missingLast(left.vectorRank) - missingLast(right.vectorRank);
  if (vectorDelta !== 0) {
    return vectorDelta;
  }
  const lexicalDelta =
    missingLast(left.lexicalRank) - missingLast(right.lexicalRank);
  if (lexicalDelta !== 0) {
    return lexicalDelta;
  }
  return left.id.localeCompare(right.id);
}

function reciprocalScore(item: FusedDocument): number {
  let score = 0;
  if (item.vectorRank !== null) {
    score += 1 / (RRF_K + item.vectorRank);
  }
  if (item.lexicalRank !== null) {
    score += 1 / (RRF_K + item.lexicalRank);
  }
  return score;
}

function missingLast(rank: number | null): number {
  return rank ?? Number.MAX_SAFE_INTEGER;
}
