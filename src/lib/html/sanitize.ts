const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'link', 'meta'];

export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<main>${html}</main>`, 'text/html');
  for (const tag of DANGEROUS_TAGS) {
    for (const element of doc.querySelectorAll(tag)) {
      element.remove();
    }
  }
  for (const element of doc.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return doc.querySelector('main')?.innerHTML ?? '';
}

export function renderThemeDocument(title: string, body: string, css = ''): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>${escapeStyleText(css)}</style>
  </head>
  <body>${body}</body>
</html>`;
}

export function escapeStyleText(value: string): string {
  return value.replace(/</g, '\\3C ');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
