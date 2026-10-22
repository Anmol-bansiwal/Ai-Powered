import { QuestionLayout } from './question-splitter';

export type FigurePlacement = {
  page: number;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
};

export type DraftFigure = {
  page: number;
  index: number;
  width: number;
  height: number;
  association: 'attached' | 'uncertain';
};

export type AssociatedDraft = QuestionLayout & {
  figures: DraftFigure[];
};

// A figure is attached only when one question owns the vertical band that
// contains it. The band runs from that question's text down to the next
// question on the page, and a continuation question also owns the top of
// the page. An image is not read or captioned here.
export function associateFigures(
  questions: QuestionLayout[],
  figures: FigurePlacement[],
): { questions: AssociatedDraft[]; unassigned: DraftFigure[] } {
  const drafts: AssociatedDraft[] = questions.map((question) => ({
    ...question,
    figures: [],
  }));
  const unassigned: DraftFigure[] = [];

  for (const figure of figures) {
    const decision = ownerIndexes(drafts, figure);
    const draftFigure = toDraftFigure(figure, decision.uncertain);
    if (decision.indexes.length === 0) {
      unassigned.push({ ...draftFigure, association: 'uncertain' });
      continue;
    }
    for (const index of decision.indexes) {
      drafts[index].figures.push({ ...draftFigure });
    }
  }

  for (const draft of drafts) {
    draft.figures.sort(
      (left, right) => left.page - right.page || left.index - right.index,
    );
  }
  unassigned.sort(
    (left, right) => left.page - right.page || left.index - right.index,
  );
  return { questions: drafts, unassigned };
}

function ownerIndexes(
  questions: AssociatedDraft[],
  figure: FigurePlacement,
): { indexes: number[]; uncertain: boolean } {
  const present = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.pages.includes(figure.page));
  if (present.length === 0) {
    return { indexes: [], uncertain: true };
  }
  if (present.length === 1) {
    return { indexes: [present[0].index], uncertain: false };
  }

  const positioned = present.filter(({ question }) =>
    question.regions.some((region) => region.page === figure.page),
  );
  if (positioned.length < 2 || !hasBox(figure)) {
    return {
      indexes: present.map((item) => item.index),
      uncertain: true,
    };
  }

  const ordered = [...positioned].sort((left, right) => {
    const leftTop = regionOn(left.question, figure.page).top;
    const rightTop = regionOn(right.question, figure.page).top;
    return rightTop - leftTop || left.index - right.index;
  });
  const midpoint = figure.y + figure.height / 2;

  for (let cursor = 0; cursor < ordered.length; cursor += 1) {
    const region = regionOn(ordered[cursor].question, figure.page);
    const startedEarlier =
      ordered[cursor].question.pageReference !== String(figure.page);
    const bandTop =
      cursor === 0 && startedEarlier ? Number.POSITIVE_INFINITY : region.top;
    const bandBottom =
      cursor + 1 < ordered.length
        ? regionOn(ordered[cursor + 1].question, figure.page).top
        : Number.NEGATIVE_INFINITY;
    if (midpoint <= bandTop && midpoint > bandBottom) {
      return { indexes: [ordered[cursor].index], uncertain: false };
    }
  }

  return { indexes: [], uncertain: true };
}

function regionOn(
  question: QuestionLayout,
  page: number,
): { top: number; bottom: number } {
  const region = question.regions.find((item) => item.page === page);
  return region ?? { top: 0, bottom: 0 };
}

function hasBox(figure: FigurePlacement): boolean {
  return figure.width > 0 && figure.height > 0;
}

function toDraftFigure(
  figure: FigurePlacement,
  uncertain: boolean,
): DraftFigure {
  return {
    page: figure.page,
    index: figure.index,
    width: figure.pixelWidth,
    height: figure.pixelHeight,
    association: uncertain ? 'uncertain' : 'attached',
  };
}
