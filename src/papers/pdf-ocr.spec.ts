import { isScannedOrLowText } from './pdf-ocr';

describe('isScannedOrLowText', () => {
  it('identifies empty or whitespace text as scanned/low-text', () => {
    expect(isScannedOrLowText('')).toBe(true);
    expect(isScannedOrLowText('   \n\t  ')).toBe(true);
  });

  it('identifies short text with no words when min threshold specified', () => {
    expect(isScannedOrLowText('1. ... ---', 20)).toBe(true);
  });

  it('identifies normal full-page text as sufficient (not low-text)', () => {
    const text = 'Question 1. Explain the theory of relativity.';
    expect(isScannedOrLowText(text)).toBe(false);
  });
});
