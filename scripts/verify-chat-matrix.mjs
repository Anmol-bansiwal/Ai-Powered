/**
 * Live matrix verification against Nest POST /questions/answer.
 * Records actual status, intent/kind, answer lead, sources — not unit mocks.
 */
import 'dotenv/config';

const BASE = process.env.VERIFY_BASE ?? 'http://localhost:3000';

async function answer(body) {
  const res = await fetch(`${BASE}/questions/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { http: res.status, ...json };
}

function lead(answer, max = 160) {
  if (typeof answer !== 'string') return String(answer);
  const one = answer.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

function sourcesOf(result) {
  const sources = result.sources ?? result.response?.sources ?? [];
  return sources.map((s) => ({
    id: s.id,
    pageReference: s.pageReference ?? null,
    score: s.score ?? null,
    text: lead(s.questionText ?? '', 80),
  }));
}

function understandingOf(result) {
  // /questions/answer may return AnswerResponse only (no understanding).
  // Prefer nested fields if present.
  return {
    intent: result.understanding?.intent ?? result.intent ?? null,
    kind: result.understanding?.kind ?? result.kind ?? null,
    activeSubject: result.understanding?.activeSubject ?? null,
    answerOrigin: result.answerOrigin ?? result.response?.answerOrigin ?? null,
  };
}

const cases = [];

async function run(name, body, expect) {
  const result = await answer(body);
  const status = result.status ?? result.response?.status;
  const answerText = result.answer ?? result.response?.answer ?? '';
  const explanation = result.explanation ?? result.response?.explanation ?? null;
  const row = {
    name,
    http: result.http,
    status,
    ...understandingOf(result),
    answerLead: lead(answerText),
    hasExplanation: Boolean(explanation),
    explanationLead: explanation ? lead(explanation, 100) : null,
    sources: sourcesOf(result),
    expect,
    pass: null,
  };

  const checks = [];
  if (expect.status) checks.push(status === expect.status);
  if (expect.answerMatch) checks.push(expect.answerMatch.test(answerText));
  if (expect.answerNot) checks.push(!expect.answerNot.test(answerText));
  if (expect.noSources) checks.push(row.sources.length === 0);
  if (expect.minSources != null) checks.push(row.sources.length >= expect.minSources);
  if (expect.hasExplanation != null) checks.push(row.hasExplanation === expect.hasExplanation);
  row.pass = checks.every(Boolean);
  cases.push(row);
  console.log(
    `${row.pass ? 'PASS' : 'FAIL'} | ${name} | status=${status} | sources=${row.sources.length} | ${row.answerLead}`,
  );
  return result;
}

const mathsPrior = [
  { role: 'user', text: 'maths' },
  {
    role: 'assistant',
    text: 'Happy to help with Mathematics.\n\nWhat would you like to focus on?',
  },
];

await run(
  'hello',
  { query: 'hello' },
  {
    status: 'guidance',
    answerMatch: /Hi!/i,
    answerNot: /Closest|Newton|dividend/i,
    noSources: true,
  },
);

const maths = await run(
  'maths',
  { query: 'maths' },
  {
    status: 'guidance',
    answerMatch: /Mathematics/i,
    noSources: true,
  },
);

await run(
  'maths → sin',
  {
    query: 'sin',
    priorTurns: mathsPrior,
  },
  {
    status: 'guidance',
    answerMatch: /sine/i,
    answerNot: /Which subject and topic/i,
    noSources: true,
  },
);

const cosPrior = [
  ...mathsPrior,
  { role: 'user', text: 'sin' },
  {
    role: 'assistant',
    text: 'In Mathematics, “sin” usually refers to the sine function.',
  },
];

await run(
  'cos theta',
  {
    query: 'cos theta',
    priorTurns: cosPrior,
    subject: 'Mathematics',
  },
  {
    // academic path — may be out_of_scope/insufficient/answered depending on bank
    answerNot: /Which subject and topic/i,
  },
);

await run(
  'cos theta → explain it',
  {
    query: 'explain it',
    priorTurns: [
      ...cosPrior,
      { role: 'user', text: 'cos theta' },
      {
        role: 'assistant',
        text: 'Cosine relates adjacent side to hypotenuse in a right triangle.',
      },
    ],
  },
  {
    answerNot: /Which subject and topic/i,
  },
);

await run(
  'physcis',
  { query: 'physcis' },
  {
    status: 'guidance',
    answerMatch: /Physics/i,
    noSources: true,
  },
);

await run(
  'gydrxg',
  { query: 'gydrxg' },
  {
    status: 'guidance',
    answerMatch: /couldn'?t understand|rephrase|Try a subject/i,
    noSources: true,
  },
);

await run(
  'Explain photosynthesis',
  { query: 'Explain photosynthesis' },
  {
    status: 'out_of_scope',
    answerMatch: /couldn'?t find|exam (archive|papers)|general explanation/i,
    answerNot: /Who wrote Hamlet|dividend yield/i,
  },
);

await run(
  'Find the Physics paper for 2024',
  { query: 'Find the Physics paper for 2024' },
  {
    status: 'guidance',
    answerMatch: /Physics|topic|Year|filter|archive/i,
    answerNot: /here is the PDF|downloaded|fabricat/i,
    noSources: true,
  },
);

await run(
  'Who wrote Hamlet?',
  { query: 'Who wrote Hamlet?' },
  {
    status: 'guidance',
    answerMatch: /outside|exam archive|studies/i,
    answerNot: /inertia|Newton|Shakespeare wrote/i,
    noSources: true,
  },
);

await run(
  'What is inertia?',
  { query: 'What is inertia?', subject: 'Physics' },
  {
    answerNot: /Which subject and topic/i,
  },
);

console.log('\n=== MATRIX SUMMARY ===');
const failed = cases.filter((c) => c.pass === false);
const passed = cases.filter((c) => c.pass === true);
const unchecked = cases.filter((c) => c.pass === null);
console.log(`PASS ${passed.length} / FAIL ${failed.length} / RECORDED ${cases.length}`);
for (const c of cases) {
  console.log(
    JSON.stringify(
      {
        name: c.name,
        pass: c.pass,
        status: c.status,
        answerOrigin: c.answerOrigin,
        sources: c.sources,
        answerLead: c.answerLead,
        hasExplanation: c.hasExplanation,
        explanationLead: c.explanationLead,
      },
      null,
      0,
    ),
  );
}
if (failed.length) process.exitCode = 1;
