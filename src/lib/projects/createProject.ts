import type {
  LegacyStudioFlowchart,
  MessengerThread,
  StoryMapEdge,
  StoryMapNode,
  StudioPage,
  StudioProject,
  StudioSite,
  StudioStoryMap,
  StudioStoryState,
  StudioTheme
} from '../../types/project';
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

export function createDefaultFlowchart(page: StudioPage): LegacyStudioFlowchart {
  return {
    id: createId('flow'),
    name: 'Main Flow',
    nodes: [{ id: createId('node'), label: page.title, pageId: page.id, x: 80, y: 80 }],
    edges: []
  };
}

function normalizeSitePathPrefix(value: string | undefined): string {
  return (value ?? '').replace(/^\/+|\/+$/g, '').replace(/\/?index\.html$/i, '');
}

export function createDefaultSite(partial: Partial<StudioSite> = {}): StudioSite {
  const theme = partial.themes?.[0] ?? createDefaultTheme();
  const page = partial.pages?.[0] ?? createPage({ themeId: theme.id });
  return {
    id: partial.id ?? createId('site'),
    name: partial.name ?? 'Default Site',
    slug: partial.slug ?? 'default',
    pathPrefix: normalizeSitePathPrefix(partial.pathPrefix),
    pages: partial.pages ?? [page],
    themes: partial.themes ?? [theme]
  };
}

export function createDefaultStoryState(): StudioStoryState {
  return {
    flags: {},
    visitedPages: [],
    solvedEvents: [],
    unlockedPages: [],
    messenger: {
      threads: {}
    }
  };
}

export function createDefaultStoryMap(site: StudioSite): StudioStoryMap {
  const firstPage = site.pages[0];
  const siteNode: StoryMapNode = {
    id: createId('node'),
    label: site.name,
    type: 'site',
    linkedEntity: { kind: 'site', siteId: site.id, id: site.id },
    siteId: site.id,
    notes: '',
    tags: [],
    x: 80,
    y: 80
  };
  const nodes: StoryMapNode[] = [siteNode];
  const edges: StoryMapEdge[] = [];
  if (firstPage) {
    const pageNode: StoryMapNode = {
      id: createId('node'),
      label: firstPage.title,
      type: 'page',
      linkedEntity: { kind: 'page', siteId: site.id, pageId: firstPage.id, id: firstPage.id },
      siteId: site.id,
      pageId: firstPage.id,
      notes: '',
      tags: [],
      x: 320,
      y: 80
    };
    nodes.push(pageNode);
    edges.push({
      id: createId('edge'),
      source: siteNode.id,
      target: pageNode.id,
      label: 'Start',
      action: 'read',
      pathRole: 'intended',
      prerequisiteMode: 'permissive',
      notes: '',
      tags: [],
      trigger: {
        id: createId('trigger'),
        type: 'pageVisited',
        siteId: site.id,
        pageId: firstPage.id
      },
      effects: []
    });
  }
  return {
    id: createId('story-map'),
    name: 'Main Story Map',
    nodes,
    edges
  };
}

export function createDefaultMessengerThread(): MessengerThread {
  const participantId = createId('participant');
  return {
    id: createId('thread'),
    title: 'Messenger Thread',
    participants: [
      {
        id: participantId,
        name: 'Unknown Contact',
        role: 'character'
      }
    ],
    nodes: [
      {
        id: createId('message'),
        senderId: participantId,
        kind: 'text',
        body: 'Did you find it?',
        choices: [],
        matchers: [],
        effects: []
      }
    ]
  };
}

export function createProject(name = 'Untitled ARG Project'): StudioProject {
  const createdAt = nowIso();
  const site = createDefaultSite();
  const id = createId('project');
  return {
    schemaVersion: 2,
    id,
    name,
    createdAt,
    updatedAt: createdAt,
    scriptPreviewEnabled: false,
    storyNamespace: safeSlug(id, 'story'),
    primarySiteId: site.id,
    sites: [site],
    assets: [],
    storyMaps: [createDefaultStoryMap(site)],
    searchRules: [],
    conditions: [],
    messengerThreads: [],
    storyState: createDefaultStoryState(),
    importedScripts: [],
    snapshots: []
  };
}

export function touchProject(project: StudioProject): StudioProject {
  return { ...project, updatedAt: nowIso() };
}
