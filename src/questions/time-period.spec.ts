import { BadRequestException } from '@nestjs/common';
import { lastYears, parseTimePeriod } from './time-period';

describe('time period', () => {
  const now = new Date('2026-10-15T00:00:00Z');

  it('counts "Last N Years" back from the current year, inclusive', () => {
    expect(lastYears(3, now)).toEqual({ yearFrom: 2024, yearTo: 2026 });
    expect(parseTimePeriod('Last 5 Years', now)).toEqual({
      yearFrom: 2022,
      yearTo: 2026,
    });
  });

  it('accepts any case and a singular year', () => {
    expect(parseTimePeriod('  last 1 year ', now)).toEqual({
      yearFrom: 2026,
      yearTo: 2026,
    });
  });

  it.each(['', 'All', 'All years', 'all time'])(
    'treats %p as no time filter',
    (label) => {
      expect(parseTimePeriod(label, now)).toBeNull();
    },
  );

  it.each(['Recently', 'Last 0 Years', 'Last 99 Years', 'Next 5 Years'])(
    'rejects %p',
    (label) => {
      expect(() => parseTimePeriod(label, now)).toThrow(BadRequestException);
    },
  );
});
