import { describe, expect, it } from 'vitest';
import { hasTraversalPath, normalizeAssetPath, normalizePublicPath } from '../../src/lib/path-safety/pathSafety';

describe('public path safety', () => {
  it('normalizes page paths into safe html files', () => {
    expect(normalizePublicPath('Clue Room')).toBe('clue-room.html');
    expect(normalizePublicPath('nested/page')).toBe('nested/page.html');
  });

  it('rejects direct and encoded traversal attempts', () => {
    expect(hasTraversalPath('../secret.html')).toBe(true);
    expect(hasTraversalPath('%2e%2e/secret.html')).toBe(true);
    expect(hasTraversalPath('C:/secret.html')).toBe(true);
    expect(normalizePublicPath('../secret.html', 'safe.html')).toBe('safe.html');
    expect(normalizeAssetPath('..\\secret.png')).toBe('assets/asset.bin');
  });
});
