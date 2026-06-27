const RESERVED_NAMES = new Set(['structure.json', 'flowchart.json', 'project.json']);

function decodeRepeated(value: string): string {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) {
        break;
      }
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

export function hasTraversalPath(value: string): boolean {
  const decoded = decodeRepeated(value).replace(/\\/g, '/');
  return (
    decoded.startsWith('/') ||
    /^[a-zA-Z]:\//.test(decoded) ||
    decoded.split('/').some((part) => part === '..' || part === '.') ||
    decoded.includes('\0')
  );
}

export function safeSlug(value: string, fallback = 'page'): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
}

export function normalizePublicPath(value: string, fallback = 'page.html'): string {
  const decoded = decodeRepeated(value.trim()).replace(/\\/g, '/');
  if (!decoded || hasTraversalPath(decoded)) {
    return fallback;
  }

  const cleaned = decoded
    .split('/')
    .map((part) => safeSlug(part.replace(/\.html$/i, ''), 'page'))
    .filter(Boolean)
    .join('/');
  const withExtension = cleaned.endsWith('.html') ? cleaned : `${cleaned}.html`;
  const basename = withExtension.split('/').at(-1) ?? withExtension;
  if (RESERVED_NAMES.has(basename.toLowerCase())) {
    return fallback;
  }
  return withExtension;
}

export function normalizeAssetPath(value: string, fallback = 'asset.bin'): string {
  const decoded = decodeRepeated(value.trim()).replace(/\\/g, '/');
  if (!decoded || hasTraversalPath(decoded)) {
    return `assets/${fallback}`;
  }
  const basename = decoded.split('/').at(-1) ?? fallback;
  const safe = basename
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `assets/${safe || fallback}`;
}
