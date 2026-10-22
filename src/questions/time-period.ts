import { BadRequestException } from '@nestjs/common';

export const TIME_PERIOD_YEARS = [3, 5, 10] as const;

export type YearRange = { yearFrom: number; yearTo: number };

const LAST_YEARS = /^last\s+(\d{1,2})\s+years?$/i;

export function timePeriodLabel(years: number): string {
  return `Last ${years} Years`;
}

// "Last N Years" counts back from the current calendar year, inclusive, so
// "Last 3 Years" in 2026 covers 2024, 2025 and 2026.
export function lastYears(years: number, now = new Date()): YearRange {
  const yearTo = now.getFullYear();
  return { yearFrom: yearTo - years + 1, yearTo };
}

export function parseTimePeriod(
  label: string,
  now = new Date(),
): YearRange | null {
  const trimmed = label.trim();
  if (trimmed === '' || /^all(\s+years?|\s+time)?$/i.test(trimmed)) {
    return null;
  }
  const match = LAST_YEARS.exec(trimmed);
  const years = match ? Number(match[1]) : 0;
  if (years < 1 || years > 50) {
    throw new BadRequestException(
      'filters.timePeriod must look like "Last 5 Years" or "All years".',
    );
  }
  return lastYears(years, now);
}
