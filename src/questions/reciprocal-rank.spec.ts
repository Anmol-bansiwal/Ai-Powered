import { fuseByReciprocalRank, RRF_K } from './reciprocal-rank';

const document = (id: string) => ({
  id,
  questionText: id,
  pageReference: '1',
});

describe('reciprocal rank fusion', () => {
  it('uses k = 60 and ranks, so a raw lexical score cannot change the order', () => {
    expect(RRF_K).toBe(60);
    const fused = fuseByReciprocalRank(
      [document('vector-first'), document('both')],
      [document('both'), document('lexical-only')],
    );

    expect(fused.map((item) => item.id)).toEqual([
      'both',
      'vector-first',
      'lexical-only',
    ]);
    expect(fused[0]).toMatchObject({ vectorRank: 2, lexicalRank: 1 });
    expect(fused[1]).toMatchObject({ vectorRank: 1, lexicalRank: null });
    expect(fused[2]).toMatchObject({ vectorRank: null, lexicalRank: 2 });
  });

  it('breaks equal reciprocal scores by vector rank, then lexical rank, then id', () => {
    const fused = fuseByReciprocalRank(
      [document('a'), document('b')],
      [document('b'), document('a')],
    );

    expect(fused.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('keeps vector order when the lexical branch matches nothing', () => {
    const fused = fuseByReciprocalRank(
      [document('first'), document('second')],
      [],
    );

    expect(
      fused.map((item) => [item.id, item.vectorRank, item.lexicalRank]),
    ).toEqual([
      ['first', 1, null],
      ['second', 2, null],
    ]);
  });
});
