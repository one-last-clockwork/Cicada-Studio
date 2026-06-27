import type { StudioFlowchart, StudioPage, StudioProject, StudioTheme } from '../../types/project';
import { normalizePublicPath, safeSlug } from '../path-safety/pathSafety';

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createDefaultTheme(): StudioTheme {
  return {
    id: createId('theme'),
    name: 'Default Case File',
    css: `:root { color-scheme: light; font-family: Inter, system-ui, sans-serif; }
body { margin: 0; color: #24272d; background: #f7f5ef; line-height: 1.65; }
main { max-width: 760px; margin: 0 auto; padding: 48px 22px 72px; background: #fffdf8; min-height: 100vh; }
a { color: #0f766e; }
.arg-widget { border: 1px solid #d7d0c2; padding: 16px; margin: 18px 0; background: #ffffff; }
input, button { font: inherit; }`
  };
}

export function createPage(partial: Partial<StudioPage> = {}): StudioPage {
  const title = partial.title ?? 'Opening Page';
  const slug = partial.slug ?? safeSlug(title, 'opening-page');
  const pageNumber = partial.pageNumber ?? 1;
  return {
    id: partial.id ?? createId('page'),
    title,
    slug,
    path: normalizePublicPath(partial.path ?? (pageNumber === 1 ? 'index.html' : `${slug}.html`), 'index.html'),
    status: partial.status ?? 'published',
    pageNumber,
    bodyHtml:
      partial.bodyHtml ??
      `<main>
  <h1>${title}</h1>
  <p>Start drafting the public-facing page here.</p>
  <div data-search-widget="default"></div>
</main>`,
    themeId: partial.themeId,
    allowScripts: partial.allowScripts ?? false,
    memo: partial.memo ?? '',
    revealBlocks: partial.revealBlocks ?? [],
    unlockPages: partial.unlockPages ?? []
  };
}

export function createDefaultFlowchart(page: StudioPage): StudioFlowchart {
  return {
    id: createId('flow'),
    name: 'Main Flow',
    nodes: [{ id: createId('node'), label: page.title, pageId: page.id, x: 80, y: 80 }],
    edges: []
  };
}

export function createProject(name = 'Untitled ARG Project'): StudioProject {
  const createdAt = nowIso();
  const theme = createDefaultTheme();
  const page = createPage({ themeId: theme.id });
  return {
    schemaVersion: 1,
    id: createId('project'),
    name,
    createdAt,
    updatedAt: createdAt,
    scriptPreviewEnabled: false,
    pages: [page],
    assets: [],
    themes: [theme],
    flowcharts: [createDefaultFlowchart(page)],
    searchRules: [],
    conditions: [],
    importedScripts: [],
    snapshots: []
  };
}

export function touchProject(project: StudioProject): StudioProject {
  return { ...project, updatedAt: nowIso() };
}
