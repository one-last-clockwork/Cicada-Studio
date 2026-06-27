import { describe, expect, it } from 'vitest';
import { candidateKeysForInput, normalizeAnswer, uniqueNormalized } from '../../src/lib/crypto/normalization';

describe('answer and search normalization', () => {
  it('normalizes NFKC, whitespace, and case', () => {
    expect(normalizeAnswer('  ＳＥＣＲＥＴ　Phrase  ')).toBe('secret phrase');
  });

  it('keeps Japanese aliases explicit instead of auto-converting kana', () => {
    expect(uniqueNormalized(['カギ', 'かぎ'])).toEqual(['カギ', 'かぎ']);
  });

  it('builds N-word contains candidates without leaking canonical terms', () => {
    expect(candidateKeysForInput('blue silver door', 'contains')).toEqual(
      expect.arrayContaining(['blue', 'silver', 'door', 'blue silver', 'silver door', 'blue silver door'])
    );
  });
});
