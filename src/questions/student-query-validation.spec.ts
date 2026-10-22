import {
  knownIdsFromRetrievalLabels,
  validateStudentQueries,
} from './student-query-validation';

describe('validateStudentQueries', () => {
  const known = new Set(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);

  it('accepts a minimal independent relevant record', () => {
    const report = validateStudentQueries(
      {
        queries: [
          {
            id: 's001',
            query: 'that LCR one with 10 volt',
            subject: 'Physics',
            queryStyle: 'informal',
            sawBank: false,
            collectedOn: '2026-10-16',
            label: {
              status: 'relevant',
              relevantIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
              reason: 'Matches Q6',
              labeledBy: 'ab',
            },
          },
        ],
      },
      known,
    );
    expect(report.ok).toBe(true);
    expect(report.counts.scorableIndependent).toBe(1);
    expect(report.errors).toEqual([]);
  });

  it('flags duplicate ids, contradictory statuses, and unknown question ids', () => {
    const report = validateStudentQueries(
      {
        queries: [
          {
            id: 's001',
            query: 'glass ball',
            sawBank: false,
            label: {
              status: 'relevant',
              relevantIds: [],
            },
          },
          {
            id: 's001',
            query: 'glass ball again',
            sawBank: false,
            label: {
              status: 'no-relevant-result',
              relevantIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
            },
          },
          {
            id: 's002',
            query: 'prism thing',
            sawBank: false,
            label: {
              status: 'relevant',
              relevantIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
            },
          },
        ],
      },
      known,
    );
    expect(report.ok).toBe(false);
    expect(report.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'id-duplicate',
        'relevant-needs-ids',
        'no-result-has-ids',
      ]),
    );
    expect(report.warnings.map((item) => item.code)).toContain(
      'question-id-unknown',
    );
  });

  it('does not silently drop sawBank true records — warns and excludes from scorable', () => {
    const report = validateStudentQueries(
      {
        queries: [
          {
            id: 's010',
            query: 'inertia',
            sawBank: true,
            label: {
              status: 'relevant',
              relevantIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
            },
          },
        ],
      },
      known,
    );
    expect(report.warnings.some((item) => item.code === 'saw-bank')).toBe(true);
    expect(report.counts.scorableIndependent).toBe(0);
  });

  it('collects known ids from retrieval labels without inventing any', () => {
    const ids = knownIdsFromRetrievalLabels({
      questions: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
      round2: [
        {
          relevantIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
        },
      ],
    });
    expect([...ids].sort()).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]);
  });
});
