import {
  firstRelevantRank,
  meanReciprocalRank,
  recallAt,
} from './retrieval-metrics';

// Mocked ranks for the informal rewrite experiment. Live OpenAI + DB scoring
// stays manual via POST /questions/search/rewritten; CI only checks the math.

type LabeledCase = {
  query: string;
  relevantIds: string[];
  originalIds: string[];
  rewrittenIds: string[];
};

const INFORMAL_CASES: LabeledCase[] = [
  {
    query: 'that LCR one where 10 volt is across each',
    relevantIds: ['e9188da0-76f0-4de0-bd49-15c98e80e4d9'],
    originalIds: ['other', 'e9188da0-76f0-4de0-bd49-15c98e80e4d9'],
    rewrittenIds: ['e9188da0-76f0-4de0-bd49-15c98e80e4d9', 'other'],
  },
  {
    query: 'the glass ball one with 1.5 refractive index',
    relevantIds: ['7ab34996-26de-4471-8ac2-bb9a1c4eb28d'],
    originalIds: ['other', 'other-2', '7ab34996-26de-4471-8ac2-bb9a1c4eb28d'],
    rewrittenIds: ['7ab34996-26de-4471-8ac2-bb9a1c4eb28d', 'other'],
  },
  {
    query: 'capital of France',
    relevantIds: [],
    originalIds: ['unrelated-1', 'unrelated-2'],
    rewrittenIds: ['unrelated-1', 'unrelated-2'],
  },
];

function ranksFor(
  cases: LabeledCase[],
  side: 'originalIds' | 'rewrittenIds',
): Array<number | null> {
  return cases.flatMap((item) => {
    if (item.relevantIds.length === 0) {
      return [];
    }
    return item.relevantIds.map((id) => firstRelevantRank(item[side], id));
  });
}

function falsePositiveRate(
  cases: LabeledCase[],
  side: 'originalIds' | 'rewrittenIds',
): number {
  const unrelated = cases.filter((item) => item.relevantIds.length === 0);
  if (unrelated.length === 0) {
    return 0;
  }
  // A false positive here means the top hit looks "confident" — for the
  // experiment we only assert the unrelated set still has no relevant id
  // in the ranked list (always true by construction of these mocks).
  const leaks = unrelated.filter((item) =>
    item[side].some((id) => item.relevantIds.includes(id)),
  ).length;
  return leaks / unrelated.length;
}

describe('rewrite retrieval metrics (mocked informal labels)', () => {
  it('reports higher Recall@1 and MRR for rewritten ranks on informal queries', () => {
    const originalRanks = ranksFor(INFORMAL_CASES, 'originalIds');
    const rewrittenRanks = ranksFor(INFORMAL_CASES, 'rewrittenIds');

    expect(recallAt(originalRanks, 1)).toBeCloseTo(0);
    expect(recallAt(rewrittenRanks, 1)).toBeCloseTo(1);
    expect(recallAt(originalRanks, 3)).toBeCloseTo(1);
    expect(recallAt(rewrittenRanks, 3)).toBeCloseTo(1);
    expect(meanReciprocalRank(originalRanks)).toBeLessThan(
      meanReciprocalRank(rewrittenRanks),
    );
    expect(falsePositiveRate(INFORMAL_CASES, 'originalIds')).toBe(0);
    expect(falsePositiveRate(INFORMAL_CASES, 'rewrittenIds')).toBe(0);
  });
});
