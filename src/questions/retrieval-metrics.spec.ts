import {
  bestRelevantRank,
  firstRelevantRank,
  meanReciprocalRank,
  recallAt,
} from './retrieval-metrics';

describe('retrieval metrics', () => {
  const ranks = [1, 3, null];

  it('averages recall only over the supplied labeled queries', () => {
    expect(recallAt(ranks, 1)).toBeCloseTo(1 / 3);
    expect(recallAt(ranks, 3)).toBeCloseTo(2 / 3);
    expect(recallAt(ranks, 5)).toBeCloseTo(2 / 3);
    expect(recallAt([], 1)).toBe(0);
  });

  it('uses the reciprocal of the first relevant rank and zero when it is missing', () => {
    expect(meanReciprocalRank(ranks)).toBeCloseTo((1 + 1 / 3) / 3);
    expect(firstRelevantRank(['other', 'target'], 'target')).toBe(2);
    expect(firstRelevantRank(['other'], 'target')).toBeNull();
  });

  it('picks the best rank among multiple relevant ids', () => {
    expect(bestRelevantRank(['a', 'b', 'c'], ['c', 'missing', 'b'])).toBe(2);
    expect(bestRelevantRank(['a', 'b'], ['z'])).toBeNull();
  });
});
