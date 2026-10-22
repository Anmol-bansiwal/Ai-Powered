import { splitPagesIntoQuestions } from './question-splitter';

describe('question splitter', () => {
  it('keeps subparts with the numbered question and records the page', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 12,
        text: [
          '1. State Newton second law.',
          '(a) Write the formula.',
          '(b) Give one example.',
          '2. Define inertia.',
        ].join('\n'),
      },
    ]);

    expect(questions).toEqual([
      {
        questionText:
          '1. State Newton second law.\n(a) Write the formula.\n(b) Give one example.',
        pageReference: '12',
      },
      {
        questionText: '2. Define inertia.',
        pageReference: '12',
      },
    ]);
  });

  it('returns one editable draft when a page has no question numbers', () => {
    const questions = splitPagesIntoQuestions([
      { pageNumber: 3, text: 'A passage about motion without a number.' },
      { pageNumber: 4, text: '   ' },
    ]);

    expect(questions).toEqual([
      {
        questionText: 'A passage about motion without a number.',
        pageReference: '3',
      },
    ]);
  });

  it('keeps options that continue onto the next page with Q12', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 3,
        text: 'Q12. If copper wire is stretched, the percentage change in its resistance is approximately',
      },
      {
        pageNumber: 4,
        text: [
          '(A) –0.4% (B) +0.8% (C) +0.4% (D) +0.2%',
          'Q13. Assertion (A): Galvanometer sensitivity.',
        ].join('\n'),
      },
    ]);

    expect(questions).toEqual([
      {
        questionText:
          'Q12. If copper wire is stretched, the percentage change in its resistance is approximately\n(A) –0.4% (B) +0.8% (C) +0.4% (D) +0.2%',
        pageReference: '3',
      },
      {
        questionText: 'Q13. Assertion (A): Galvanometer sensitivity.',
        pageReference: '4',
      },
    ]);
  });

  it('recognizes Q.20 and keeps the continuation on the next page', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 5,
        text: [
          'Q19. Two particles are shown in the figure.',
          'Q.20. Binding energy per nucleon vs mass number curve is shown in the figure.',
          '(i) Nuclear Fission',
        ].join('\n'),
      },
      {
        pageNumber: 6,
        text: [
          '(ii) Nuclear Fusion.',
          'Justify your answer.',
          'Q21. A cylindrical conductor of length l.',
        ].join('\n'),
      },
    ]);

    expect(questions.map((question) => question.questionText)).toEqual([
      'Q19. Two particles are shown in the figure.',
      'Q.20. Binding energy per nucleon vs mass number curve is shown in the figure.\n(i) Nuclear Fission\n(ii) Nuclear Fusion.\nJustify your answer.',
      'Q21. A cylindrical conductor of length l.',
    ]);
    expect(questions[1].pageReference).toBe('5');
  });

  it('attaches Q29 subquestions from the next page to the same draft', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 9,
        text: 'Q29. Case Study: the magnetic force acting on the electron is',
      },
      {
        pageNumber: 10,
        text: [
          'perpendicular to both velocity and field, as shown in the figure.',
          '(i) If the speed of the electron is doubled, the radius becomes',
          '(A) 4ro (B) 2ro (C) ro (D) ro/2',
          'Q30. Case Study Based Question: Photoelectric effect',
        ].join('\n'),
      },
    ]);

    expect(questions).toHaveLength(2);
    expect(questions[0].pageReference).toBe('9');
    expect(questions[0].questionText).toContain(
      '(i) If the speed of the electron is doubled',
    );
    expect(questions[0].questionText).toContain(
      '(A) 4ro (B) 2ro (C) ro (D) ro/2',
    );
    expect(questions[0].questionText).not.toContain('Photoelectric');
    expect(questions[1].questionText).toBe(
      'Q30. Case Study Based Question: Photoelectric effect',
    );
  });

  it('attaches the Q30 continuation page instead of creating an unnumbered draft', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 10,
        text: 'Q30. Case Study Based Question: Photoelectric effect. It is the phenomenon of emission of electrons.',
      },
      {
        pageNumber: 11,
        text: [
          'Nearly all metals exhibit this effect with ultraviolet light.',
          '(I) In a photoelectric experiment plate current is plotted against anode potential.',
          '(II) Photoelectrons are emitted when a zinc plate is irradiated by ultraviolet light.',
        ].join('\n'),
      },
    ]);

    expect(questions).toEqual([
      {
        questionText:
          'Q30. Case Study Based Question: Photoelectric effect. It is the phenomenon of emission of electrons.\nNearly all metals exhibit this effect with ultraviolet light.\n(I) In a photoelectric experiment plate current is plotted against anode potential.\n(II) Photoelectrons are emitted when a zinc plate is irradiated by ultraviolet light.',
        pageReference: '10',
      },
    ]);
  });

  it('attaches the Q31 continuation that precedes the next question', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 12,
        text: 'Q31. (I) Write two limitations of ohm’s law. (II) A wire is bent in the shape of a circle as shown in the figure.',
      },
      {
        pageNumber: 13,
        text: [
          'b) What do you understand by sensitivity of Wheatstone bridge?',
          'Q32. Explain the basic principle of an a.c. generator.',
        ].join('\n'),
      },
    ]);

    expect(questions).toEqual([
      {
        questionText:
          'Q31. (I) Write two limitations of ohm’s law. (II) A wire is bent in the shape of a circle as shown in the figure.\nb) What do you understand by sensitivity of Wheatstone bridge?',
        pageReference: '12',
      },
      {
        questionText: 'Q32. Explain the basic principle of an a.c. generator.',
        pageReference: '13',
      },
    ]);
  });

  it('does not turn a general instruction page into a question draft', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 1,
        text: [
          'SAMPLE QUESTION PAPER',
          'PHYSICS',
          'General Instructions',
          '(1) There are 33 questions in all. All questions are compulsory.',
          '(2) This question paper has five sections.',
        ].join('\n'),
      },
      {
        pageNumber: 2,
        text: 'Q1. A uniform electric field pointing in positive X-direction exists in a region.',
      },
    ]);

    expect(questions).toEqual([
      {
        questionText:
          'Q1. A uniform electric field pointing in positive X-direction exists in a region.',
        pageReference: '2',
      },
    ]);
  });

  describe('papers numbered without a period', () => {
    it('keeps page 1 questions and drops instructions, section rubric, and marks', () => {
      const questions = splitPagesIntoQuestions([
        {
          pageNumber: 1,
          text: [
            'SAMPLE PAPER (2024 -25)',
            'CHEMISTRY THEORY (043)',
            'GENERAL INSTRUCTIONS:',
            '(a) There are 33 questions in this question paper with internal choice.',
            'SECTION A',
            'The following questions are multiple-choice questions with one correct answer. Each',
            'question carries 1 mark. There is no internal choice in this section.',
            '1 Ammonolysis of ethyl chloride followed by reaction of the amine so formed with',
            '1 mole of methyl chloride gives an amine that',
            'a. reacts with Hinsberg reagent to form a product soluble in an alkali.',
            'd. does not react with Hinsberg reagent.',
            '1',
            '2 Which one of the following has the highest dipole moment?',
            'a. CH_{3}F',
            'd. CH_{3}Br',
            '1',
            '1',
          ].join('\n'),
        },
      ]);

      expect(questions).toEqual([
        {
          questionText:
            '1 Ammonolysis of ethyl chloride followed by reaction of the amine so formed with\n1 mole of methyl chloride gives an amine that\na. reacts with Hinsberg reagent to form a product soluble in an alkali.\nd. does not react with Hinsberg reagent.',
          pageReference: '1',
        },
        {
          questionText:
            '2 Which one of the following has the highest dipole moment?\na. CH_{3}F\nd. CH_{3}Br',
          pageReference: '1',
        },
      ]);
    });

    it('keeps options that continue onto the next page and starts a number on its own line', () => {
      const questions = splitPagesIntoQuestions([
        {
          pageNumber: 1,
          text: [
            '1 Match the properties given in column I with the metals in column II',
            '(i) Actinoid having configuration [Rn] 5f^{7}6d^{1}7s^{2} (A) Ce',
            '1',
            '1',
          ].join('\n'),
        },
        {
          pageNumber: 2,
          text: [
            'a. (i)-(C), (ii)-(B), (iii)-(A)',
            'd. (i)-(B), (ii)-(A), (iii)-(C)',
            '1',
            '2',
            '‘X’ and ‘Y’ in the above table are:',
            'a. X=[Co(NH_{3})_{6}]2+3Cl-, Y= 1:3',
            '1',
            '2',
          ].join('\n'),
        },
      ]);

      expect(questions).toEqual([
        {
          questionText:
            '1 Match the properties given in column I with the metals in column II\n(i) Actinoid having configuration [Rn] 5f^{7}6d^{1}7s^{2} (A) Ce\na. (i)-(C), (ii)-(B), (iii)-(A)\nd. (i)-(B), (ii)-(A), (iii)-(C)',
          pageReference: '1',
        },
        {
          questionText:
            '2\n‘X’ and ‘Y’ in the above table are:\na. X=[Co(NH_{3})_{6}]2+3Cl-, Y= 1:3',
          pageReference: '2',
        },
      ]);
    });

    it('does not append a section heading or its rubric to the previous question', () => {
      const questions = splitPagesIntoQuestions([
        {
          pageNumber: 5,
          text: [
            '1 Assertion (A): The half- life for a zero order reaction is independent of the initial',
            'concentration of the reactant.',
            'd. A is false but R is true.',
            '1',
            'SECTION B',
            'This section contains 5 questions with internal choice in one question. The following',
            'questions are very short answer type and carry 2 marks each.',
            '2 a. Nitrogen gas is soluble in water.',
            'OR',
            'b. How does sugar help in increasing the shelf life of the product?',
            '½+½',
            '1+½',
          ].join('\n'),
        },
      ]);

      expect(questions.map((question) => question.questionText)).toEqual([
        '1 Assertion (A): The half- life for a zero order reaction is independent of the initial\nconcentration of the reactant.\nd. A is false but R is true.',
        '2 a. Nitrogen gas is soluble in water.\nOR\nb. How does sugar help in increasing the shelf life of the product?',
      ]);
    });

    it('starts a question only at the next expected number', () => {
      const questions = splitPagesIntoQuestions([
        {
          pageNumber: 13,
          text: [
            '1 b. The osmotic pressure of a solution of cane sugar was found to be 2.46 atm at',
            '300 K. If the solution was diluted five times, calculate the osmotic pressure.',
            '1 A repeated number that is not the next question.',
            '3 A number that skips the next question.',
            '2 A solution of phenol was obtained by dissolving 2X 10^{-2} kg of phenol.',
          ].join('\n'),
        },
      ]);

      expect(questions.map((question) => question.questionText)).toEqual([
        '1 b. The osmotic pressure of a solution of cane sugar was found to be 2.46 atm at\n300 K. If the solution was diluted five times, calculate the osmotic pressure.\n1 A repeated number that is not the next question.\n3 A number that skips the next question.',
        '2 A solution of phenol was obtained by dissolving 2X 10^{-2} kg of phenol.',
      ]);
    });

    it('keeps decimals, data rows, and labelled lines that look like marks', () => {
      const questions = splitPagesIntoQuestions([
        {
          pageNumber: 10,
          text: [
            '1 The experimental data is tabulated below:',
            'C_{6}H_{5}CON 3.7',
            '7.78',
            '(i) 9.9 (ii) 9.5 (iii) 9.3 (iv) 9.1',
            'Mechanism 1',
            'A → C + D (slow)',
            '1',
            '1',
            '2 Amines are basic in nature.',
          ].join('\n'),
        },
      ]);

      expect(questions).toHaveLength(2);
      expect(questions[0].questionText).toBe(
        '1 The experimental data is tabulated below:\nC_{6}H_{5}CON 3.7\n7.78\n(i) 9.9 (ii) 9.5 (iii) 9.3 (iv) 9.1\nMechanism 1\nA → C + D (slow)',
      );
    });
  });

  it('keeps papers that number questions with a period on the existing rules', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 1,
        text: [
          '1. An electric dipole of dipole length',
          '2 cm is placed in a field.',
          '1',
          '2. Which colour gives the maximum stopping potential?',
          '3 Which one is not a question start here?',
        ].join('\n'),
      },
    ]);

    expect(questions.map((question) => question.questionText)).toEqual([
      '1. An electric dipole of dipole length\n2 cm is placed in a field.\n1',
      '2. Which colour gives the maximum stopping potential?\n3 Which one is not a question start here?',
    ]);
  });

  it('replaces an unmapped glyph with a visible replacement character', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 3,
        text: '5. The initial concentration of R in the reaction R\u0000P is 4.62 x 10^{-2} mol/L.',
      },
    ]);

    expect(questions[0].questionText).toBe(
      '5. The initial concentration of R in the reaction R\uFFFDP is 4.62 x 10^{-2} mol/L.',
    );
  });

  it('gives each assertion question the shared options from the preceding page', () => {
    const questions = splitPagesIntoQuestions([
      {
        pageNumber: 4,
        text: [
          'Q12. Resistance changes by approximately',
          '(A) –0.4% (B) +0.8%',
          'For Questions 13 to 14, two statements are given.',
          'A. Both Assertion and Reason are true and Reason explains Assertion.',
          'B. Both Assertion and Reason are true but Reason does not explain Assertion.',
          'Q13. Assertion (A): Current sensitivity.',
          'Reason (R): Coil resistance increases.',
          'Q14. Assertion (A): Hydrogen spectrum.',
          'Reason (R): Many atoms are present.',
          'Q15. A platinum surface has work function 5.63 eV.',
        ].join('\n'),
      },
    ]);

    expect(questions[0].questionText).toBe(
      'Q12. Resistance changes by approximately\n(A) –0.4% (B) +0.8%',
    );
    expect(questions[1].questionText).toContain(
      'A. Both Assertion and Reason are true and Reason explains Assertion.',
    );
    expect(questions[1].questionText).toContain(
      'Q13. Assertion (A): Current sensitivity.',
    );
    expect(questions[2].questionText).toContain(
      'Q14. Assertion (A): Hydrogen spectrum.',
    );
    expect(questions[2].questionText).toContain(
      'B. Both Assertion and Reason are true but Reason does not explain Assertion.',
    );
    expect(questions[3].questionText).toBe(
      'Q15. A platinum surface has work function 5.63 eV.',
    );
  });
});
