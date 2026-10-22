// Technical tokens that must survive a rewrite. Numbers and scripted formulas
// must appear verbatim. Spoken unit names may become the standard symbol
// (volt → V) but must not change to a different quantity (volt → Ω).

const UNIT_GROUPS: Array<{ aliases: string[]; canonical: string }> = [
  { aliases: ['v', 'volt', 'volts'], canonical: 'V' },
  { aliases: ['ω', 'ohm', 'ohms', 'Ω'], canonical: 'Ω' },
  { aliases: ['a', 'amp', 'amps', 'ampere', 'amperes'], canonical: 'A' },
  { aliases: ['w', 'watt', 'watts'], canonical: 'W' },
  { aliases: ['j', 'joule', 'joules'], canonical: 'J' },
  { aliases: ['n', 'newton', 'newtons'], canonical: 'N' },
  { aliases: ['ev'], canonical: 'eV' },
  { aliases: ['hz', 'hertz'], canonical: 'Hz' },
  { aliases: ['kg'], canonical: 'kg' },
  { aliases: ['g', 'gram', 'grams'], canonical: 'g' },
  { aliases: ['cm'], canonical: 'cm' },
  { aliases: ['mm'], canonical: 'mm' },
  { aliases: ['m', 'metre', 'metres', 'meter', 'meters'], canonical: 'm' },
  { aliases: ['s', 'sec', 'secs', 'second', 'seconds'], canonical: 's' },
];

const UNIT_LOOKUP = new Map<string, string>();
for (const group of UNIT_GROUPS) {
  for (const alias of group.aliases) {
    UNIT_LOOKUP.set(alias.toLowerCase(), group.canonical);
  }
  UNIT_LOOKUP.set(group.canonical.toLowerCase(), group.canonical);
}

const NUMBER = /\d+(?:\.\d+)?/g;
const SCRIPTED =
  /[A-Za-zΑ-Ωα-ω][A-Za-z0-9Α-Ωα-ω]*(?:[_^]\{[^}]{1,16}\}[A-Za-z0-9Α-Ωα-ω]*)+/g;
const NUMBER_UNIT =
  /(\d+(?:\.\d+)?)\s*([A-Za-zΩωµμ°/%]+)(?:\/([A-Za-zΩωµμ]+))?/g;
const NEGATION = /\b(?:not|no|never|without|neither|nor)\b/gi;

export type TechnicalTokens = {
  numbers: string[];
  units: string[];
  formulas: string[];
  negations: string[];
};

export function extractTechnicalTokens(text: string): TechnicalTokens {
  const formulas = unique(text.match(SCRIPTED) ?? []);
  // Strip scripted formulas first so digits inside _{3} are not counted as
  // free-standing numbers that a rewrite would have to repeat.
  let remainder = text;
  for (const formula of formulas) {
    remainder = remainder.split(formula).join(' ');
  }

  const units: string[] = [];
  for (const match of remainder.matchAll(NUMBER_UNIT)) {
    const primary = normalizeUnit(match[2]);
    if (primary) {
      units.push(primary);
    }
    if (match[3]) {
      const secondary = normalizeUnit(match[3]);
      if (secondary) {
        units.push(secondary);
      }
    }
  }
  const numbers = unique(remainder.match(NUMBER) ?? []);
  const negations = unique(
    [...text.matchAll(NEGATION)].map((match) => match[0].toLowerCase()),
  );
  return {
    numbers,
    units: unique(units),
    formulas,
    negations,
  };
}

export function preservesTechnicalTokens(
  original: string,
  rewritten: string,
): boolean {
  const required = extractTechnicalTokens(original);
  const found = extractTechnicalTokens(rewritten);
  const rewrittenLower = rewritten.toLowerCase();

  for (const number of required.numbers) {
    if (!found.numbers.includes(number)) {
      return false;
    }
  }
  for (const formula of required.formulas) {
    if (!rewritten.includes(formula)) {
      return false;
    }
  }
  for (const unit of required.units) {
    if (!found.units.includes(unit)) {
      return false;
    }
  }
  for (const negation of required.negations) {
    if (!rewrittenLower.includes(negation)) {
      return false;
    }
  }
  return true;
}

function normalizeUnit(raw: string): string | null {
  const key = raw.toLowerCase();
  return UNIT_LOOKUP.get(key) ?? null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
