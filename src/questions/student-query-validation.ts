const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const LABEL_STATUSES = [
  'pending',
  'relevant',
  'no-relevant-result',
  'unresolved',
] as const;

export type LabelStatus = (typeof LABEL_STATUSES)[number];

export type StudentQueryRecord = {
  id?: unknown;
  query?: unknown;
  subject?: unknown;
  queryStyle?: unknown;
  studentRef?: unknown;
  collectedOn?: unknown;
  sawBank?: unknown;
  notes?: unknown;
  label?: {
    status?: unknown;
    relevantIds?: unknown;
    suggestedIds?: unknown;
    reason?: unknown;
    labeledBy?: unknown;
    type?: unknown;
  };
};

export type ValidationIssue = {
  level: 'error' | 'warning';
  id: string | null;
  code: string;
  message: string;
};

export type ValidationReport = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  counts: {
    total: number;
    pending: number;
    relevant: number;
    noRelevantResult: number;
    unresolved: number;
    sawBankTrue: number;
    scorableIndependent: number;
  };
};

export function validateStudentQueries(
  file: { queries?: unknown },
  knownQuestionIds: ReadonlySet<string> = new Set(),
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const queries = Array.isArray(file.queries) ? file.queries : null;

  if (queries === null) {
    errors.push({
      level: 'error',
      id: null,
      code: 'queries-missing',
      message: 'queries must be an array.',
    });
    return {
      ok: false,
      errors,
      warnings,
      counts: emptyCounts(),
    };
  }

  const seenIds = new Map<string, number>();
  const seenQueries = new Map<string, string>();
  const counts = emptyCounts();
  counts.total = queries.length;

  for (const raw of queries) {
    const entry = raw as StudentQueryRecord;
    const id = typeof entry.id === 'string' ? entry.id : null;

    if (id === null || id.trim() === '') {
      errors.push({
        level: 'error',
        id: null,
        code: 'id-missing',
        message: 'Each query record needs a non-empty id (e.g. s001).',
      });
      continue;
    }

    if (seenIds.has(id)) {
      errors.push({
        level: 'error',
        id,
        code: 'id-duplicate',
        message: `Duplicate id "${id}" (also at index ${seenIds.get(id)}).`,
      });
    } else {
      seenIds.set(id, seenIds.size);
    }

    if (typeof entry.query !== 'string' || entry.query.trim() === '') {
      errors.push({
        level: 'error',
        id,
        code: 'query-missing',
        message: 'query must be the exact non-empty student text.',
      });
    } else {
      const normalized = entry.query.trim();
      const prior = seenQueries.get(normalized);
      if (prior) {
        warnings.push({
          level: 'warning',
          id,
          code: 'query-duplicate',
          message: `Same query text as "${prior}". Kept; not discarded.`,
        });
      } else {
        seenQueries.set(normalized, id);
      }
    }

    if (entry.sawBank === true) {
      counts.sawBankTrue += 1;
      warnings.push({
        level: 'warning',
        id,
        code: 'saw-bank',
        message:
          'sawBank is true — excluded from the independent evaluation set.',
      });
    } else if (entry.sawBank !== false) {
      errors.push({
        level: 'error',
        id,
        code: 'saw-bank-required',
        message: 'sawBank must be explicitly true or false.',
      });
    }

    const status = entry.label?.status;
    if (typeof status !== 'string') {
      errors.push({
        level: 'error',
        id,
        code: 'label-status-missing',
        message: 'label.status is required.',
      });
      continue;
    }
    if (!LABEL_STATUSES.includes(status as LabelStatus)) {
      errors.push({
        level: 'error',
        id,
        code: 'label-status-invalid',
        message: `label.status must be one of ${LABEL_STATUSES.join(', ')}.`,
      });
      continue;
    }

    const relevantIds = asStringArray(entry.label?.relevantIds);
    const suggestedIds = asStringArray(entry.label?.suggestedIds);

    if (relevantIds === null) {
      errors.push({
        level: 'error',
        id,
        code: 'relevant-ids-type',
        message: 'label.relevantIds must be an array of strings when present.',
      });
    }
    if (suggestedIds === null) {
      errors.push({
        level: 'error',
        id,
        code: 'suggested-ids-type',
        message: 'label.suggestedIds must be an array of strings when present.',
      });
    }

    const ids = relevantIds ?? [];
    const suggested = suggestedIds ?? [];

    for (const questionId of [...ids, ...suggested]) {
      if (!UUID.test(questionId)) {
        errors.push({
          level: 'error',
          id,
          code: 'question-id-format',
          message: `Question id "${questionId}" is not a UUID.`,
        });
      } else if (
        knownQuestionIds.size > 0 &&
        !knownQuestionIds.has(questionId)
      ) {
        warnings.push({
          level: 'warning',
          id,
          code: 'question-id-unknown',
          message: `Question id "${questionId}" is not in the known label corpus list. Confirm it exists in the live bank before scoring.`,
        });
      }
    }

    switch (status) {
      case 'pending':
        counts.pending += 1;
        if (ids.length > 0) {
          errors.push({
            level: 'error',
            id,
            code: 'pending-has-ids',
            message: 'pending labels must not list relevantIds.',
          });
        }
        break;
      case 'relevant':
        counts.relevant += 1;
        if (ids.length === 0) {
          errors.push({
            level: 'error',
            id,
            code: 'relevant-needs-ids',
            message: 'relevant labels must list at least one relevantId.',
          });
        }
        if (entry.sawBank === false && ids.length > 0) {
          counts.scorableIndependent += 1;
        }
        break;
      case 'no-relevant-result':
        counts.noRelevantResult += 1;
        if (ids.length > 0) {
          errors.push({
            level: 'error',
            id,
            code: 'no-result-has-ids',
            message: 'no-relevant-result labels must have empty relevantIds.',
          });
        }
        if (entry.sawBank === false) {
          counts.scorableIndependent += 1;
        }
        break;
      case 'unresolved':
        counts.unresolved += 1;
        if (ids.length > 0) {
          errors.push({
            level: 'error',
            id,
            code: 'unresolved-has-ids',
            message:
              'unresolved labels must not list relevantIds (use suggestedIds).',
          });
        }
        break;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts,
  };
}

export function knownIdsFromRetrievalLabels(labels: unknown): Set<string> {
  const ids = new Set<string>();
  if (typeof labels !== 'object' || labels === null) {
    return ids;
  }
  const record = labels as Record<string, unknown>;
  for (const question of asObjectArray(record.questions)) {
    if (typeof question.id === 'string') {
      ids.add(question.id);
    }
  }
  for (const key of [
    'confirmed',
    'informal',
    'reviewedConfirmed',
    'expandedConfirmed',
    'round2',
  ]) {
    for (const entry of asObjectArray(record[key])) {
      for (const id of asStringArray(entry.relevantIds) ?? []) {
        ids.add(id);
      }
      for (const id of asStringArray(entry.suggestedRelevantIds) ?? []) {
        ids.add(id);
      }
    }
  }
  return ids;
}

function emptyCounts(): ValidationReport['counts'] {
  return {
    total: 0,
    pending: 0,
    relevant: 0,
    noRelevantResult: 0,
    unresolved: 0,
    sawBankTrue: 0,
    scorableIndependent: 0,
  };
}

function asStringArray(value: unknown): string[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }
    items.push(item);
  }
  return items;
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null,
  );
}
