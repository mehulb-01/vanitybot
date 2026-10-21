import { describe, it, expect } from 'vitest';
import { formatNumber, formatCurrency } from '../src/utils/format';

describe('format utilities', () => {
  it('formats numbers with standard 3-digit comma grouping (thousands/millions/billions)', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(837)).toBe('837');
    expect(formatNumber(84000)).toBe('84,000');
    expect(formatNumber(122000)).toBe('122,000');
    expect(formatNumber(10000000000)).toBe('10,000,000,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
  });

  it('handles null and undefined gracefully', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
    expect(formatNumber(NaN)).toBe('0');
  });

  it('formats currency with dollar prefix', () => {
    expect(formatCurrency(837)).toBe('$837');
    expect(formatCurrency(122000)).toBe('$122,000');
    expect(formatCurrency(10000000000)).toBe('$10,000,000,000');
  });
});
