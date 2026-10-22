import { FigurePlacement, associateFigures } from './figure-association';
import { PdfPageInput, splitPagesWithLayout } from './question-splitter';

function figure(
  page: number,
  index: number,
  y: number,
  height: number,
  pixelWidth = 120,
  pixelHeight = 80,
): FigurePlacement {
  return {
    page,
    index,
    x: 140,
    y,
    width: 160,
    height,
    pixelWidth,
    pixelHeight,
  };
}

function attached(page: number, index: number, width = 120, height = 80) {
  return { page, index, width, height, association: 'attached' };
}

describe('figure association', () => {
  it('gives Q20 the figure on its continuation page and not Q21', () => {
    const questions = splitPagesWithLayout([
      page(5, [
        line('Q19. Two particles are shown in the figure.', 560, 540),
        line(
          'Q.20. Binding energy per nucleon vs mass number curve is shown in the figure.',
          140,
          120,
        ),
      ]),
      page(6, [
        line('(ii) Nuclear Fusion.', 760, 740),
        line('Q21. A cylindrical conductor of length l.', 200, 180),
      ]),
    ]);

    const result = associateFigures(questions, [
      figure(5, 1, 300, 80, 689, 250),
      figure(6, 1, 508, 206, 331, 249),
    ]);
    const q19 = draft(result.questions, 'Q19');
    const q20 = draft(result.questions, 'Q.20');
    const q21 = draft(result.questions, 'Q21');

    expect(q20.pageReference).toBe('5');
    expect(q20.questionText).toContain('(ii) Nuclear Fusion.');
    expect(q19.figures).toEqual([attached(5, 1, 689, 250)]);
    expect(q20.figures).toEqual([attached(6, 1, 331, 249)]);
    expect(q21.figures).toEqual([]);
  });

  it('gives Q22 both images on a page that also contains later questions', () => {
    const questions = splitPagesWithLayout([
      page(6, [line('Q21. A cylindrical conductor of length l.', 200, 180)]),
      page(7, [
        line('Draw the curve showing the variation of conductivity.', 780, 760),
        line(
          'Q22. Identify the circuit elements X and Y as shown in the given block diagram.',
          670,
          650,
        ),
        line(
          '(II) A centre-tap transformer is shown in the diagram.',
          400,
          380,
        ),
        line('Q23. Find the expression for the capacitance.', 220, 200),
        line('Q24. Draw a ray diagram for the Cassegrain telescope.', 120, 100),
      ]),
    ]);

    const result = associateFigures(questions, [
      figure(7, 1, 529, 104, 683, 370),
      figure(7, 2, 364, 116, 450, 210),
    ]);

    expect(draft(result.questions, 'Q21').figures).toEqual([]);
    expect(draft(result.questions, 'Q22').figures).toEqual([
      attached(7, 1, 683, 370),
      attached(7, 2, 450, 210),
    ]);
    expect(draft(result.questions, 'Q23').figures).toEqual([]);
    expect(draft(result.questions, 'Q24').figures).toEqual([]);
  });

  it('keeps Q27 figures from the start page and the next page with that question', () => {
    const questions = splitPagesWithLayout([
      page(8, [
        line(
          'Q25. In the given diagram the diode is connected to a cell.',
          651,
          630,
        ),
        line('Q26. A boy is holding a smooth hollow pipe.', 340, 320),
        line(
          'Q27. A light ray enters a right-angled prism as shown in Fig. 1.',
          216,
          190,
        ),
      ]),
      page(9, [
        line(
          'shown in Fig. 2, determine if the light ray continues.',
          730,
          700,
        ),
        line('Q28. State Gauss’s theorem in electrostatics.', 319, 300),
        line(
          'Q29. Motion of charge in magnetic field as shown in the figure.',
          134,
          110,
        ),
      ]),
    ]);

    const result = associateFigures(questions, [
      figure(8, 1, 478, 80, 350, 259),
      figure(8, 2, 107, 104, 452, 339),
      figure(9, 1, 554, 122, 587, 351),
    ]);

    expect(draft(result.questions, 'Q25').figures).toEqual([
      attached(8, 1, 350, 259),
    ]);
    expect(draft(result.questions, 'Q26').figures).toEqual([]);
    expect(draft(result.questions, 'Q27').figures).toEqual([
      attached(8, 2, 452, 339),
      attached(9, 1, 587, 351),
    ]);
    expect(draft(result.questions, 'Q27').pageReference).toBe('8');
    expect(draft(result.questions, 'Q28').figures).toEqual([]);
    expect(draft(result.questions, 'Q29').figures).toEqual([]);
  });

  it('gives Q30 the graph on its continuation page and not the previous figure', () => {
    const questions = splitPagesWithLayout([
      page(9, [
        line(
          'Q29. Motion of charge in magnetic field as shown in the figure.',
          134,
          110,
        ),
      ]),
      page(10, [
        line('perpendicular to both velocity and field.', 700, 680),
        line('Q30. Case Study Based Question: Photoelectric effect.', 160, 140),
      ]),
      page(11, [
        line(
          'In a photoelectric experiment plate current is plotted against anode potential.',
          640,
          620,
        ),
      ]),
    ]);

    const result = associateFigures(questions, [
      figure(10, 1, 577, 120, 231, 241),
      figure(11, 1, 450, 117, 475, 271),
    ]);

    expect(draft(result.questions, 'Q29').figures).toEqual([
      attached(10, 1, 231, 241),
    ]);
    expect(draft(result.questions, 'Q30').figures).toEqual([
      attached(11, 1, 475, 271),
    ]);
    expect(draft(result.questions, 'Q30').pageReference).toBe('10');
    expect(draft(result.questions, 'Q30').questionText).toContain(
      'plotted against anode potential',
    );
  });

  it('gives Q31 the circuit on its own page', () => {
    const questions = splitPagesWithLayout([
      page(12, [
        line(
          'Q31. A wire is bent in the shape of a circle as shown in the figure.',
          604,
          580,
        ),
        line('The resistance across C and D is 10 ohm.', 160, 140),
      ]),
      page(13, [
        line(
          'b) What do you understand by sensitivity of a Wheatstone bridge?',
          760,
          740,
        ),
        line(
          'Q32. Explain the basic principle of an a.c. generator.',
          500,
          480,
        ),
      ]),
    ]);

    const result = associateFigures(questions, [
      figure(12, 1, 178, 118, 418, 371),
    ]);

    expect(draft(result.questions, 'Q31').figures).toEqual([
      attached(12, 1, 418, 371),
    ]);
    expect(draft(result.questions, 'Q32').figures).toEqual([]);
  });

  it('leaves drafts empty when their pages contain no images', () => {
    const questions = splitPagesWithLayout([
      page(1, [
        line('SAMPLE QUESTION PAPER', 800, 780),
        line('General Instructions', 740, 720),
        line('There are 33 questions in all.', 700, 680),
      ]),
      page(2, [
        line('Q1. A uniform electric field exists in a region.', 700, 680),
      ]),
      page(3, [line('Q7. A lens forms an image of an object.', 700, 680)]),
      page(4, [line('Q13. Assertion (A): Current sensitivity.', 700, 680)]),
      page(13, [line('Q33. A planet orbits a star.', 500, 480)]),
    ]);

    const result = associateFigures(questions, []);

    expect(result.questions.map((question) => question.figures)).toEqual([
      [],
      [],
      [],
      [],
    ]);
    expect(result.unassigned).toEqual([]);
    expect(result.questions.map((question) => question.pageReference)).toEqual([
      '2',
      '3',
      '4',
      '13',
    ]);
  });

  it('flags an image on a shared page when vertical position is unavailable', () => {
    const questions = splitPagesWithLayout([
      {
        pageNumber: 8,
        text: [
          'Q25. In the given diagram the diode is connected to a cell.',
          'Q27. A prism is shown in Fig. 1.',
        ].join('\n'),
      },
    ]);

    const result = associateFigures(questions, [
      figure(8, 1, 200, 90, 350, 259),
    ]);

    expect(result.questions).toHaveLength(2);
    expect(result.unassigned).toEqual([]);
    for (const question of result.questions) {
      expect(question.figures).toEqual([
        {
          page: 8,
          index: 1,
          width: 350,
          height: 259,
          association: 'uncertain',
        },
      ]);
    }
  });
});

function page(
  pageNumber: number,
  lines: Array<{ text: string; top: number; bottom: number }>,
): PdfPageInput {
  return { pageNumber, text: lines.map((line) => line.text).join('\n'), lines };
}

function line(text: string, top: number, bottom: number) {
  return { text, top, bottom };
}

function draft(
  questions: Array<{
    questionText: string;
    figures: unknown[];
    pageReference: string;
  }>,
  start: string,
) {
  const question = questions.find((item) =>
    item.questionText.startsWith(start),
  );
  if (!question) {
    throw new Error(`Missing draft ${start}`);
  }
  return question;
}
