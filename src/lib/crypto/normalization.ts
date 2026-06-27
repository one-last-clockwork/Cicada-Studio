export function normalizeAnswer(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeTerms(values: string[]): string[] {
  return values.map(normalizeAnswer).filter(Boolean);
}

export function splitTermList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map(normalizeAnswer)
    .filter(Boolean);
}

export function uniqueNormalized(values: string[]): string[] {
  return [...new Set(normalizeTerms(values))];
}

export function candidateKeysForInput(input: string, mode: 'exact' | 'contains'): string[] {
  const normalized = normalizeAnswer(input);
  if (!normalized) {
    return [];
  }
  if (mode === 'exact') {
    return [normalized];
  }
  const words = normalized.split(' ').filter(Boolean);
  const candidates = new Set<string>([normalized]);
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= words.length; end += 1) {
      candidates.add(words.slice(start, end).join(' '));
    }
  }
  return [...candidates];
}
