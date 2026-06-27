import JSZip from 'jszip';
import type { ImportedScriptMetadata, StudioAsset, StudioPage, StudioProject, StudioTheme } from '../../types/project';
import { createDefaultFlowchart, createDefaultTheme, createId, createPage, nowIso } from '../../lib/projects/createProject';
import { sanitizeHtml } from '../../lib/html/sanitize';
import { hasTraversalPath, normalizeAssetPath, normalizePublicPath, safeSlug } from '../../lib/path-safety/pathSafety';
import { bytesToBase64 } from '../../lib/crypto/encoding';

interface YachoStructurePage {
  id?: string;
  title?: string;
  name?: string;
  slug?: string;
  path?: string;
  status?: string;
  file?: string;
  content?: string;
  pageNumber?: number;
  number?: number;
}

interface YachoStructure {
  title?: string;
  name?: string;
  pages?: YachoStructurePage[];
}

interface YachoFlowchart {
  nodes?: Array<{ id?: string; label?: string; title?: string; pageId?: string; x?: number; y?: number }>;
  edges?: Array<{ id?: string; source?: string; target?: string; label?: string }>;
}

function guessMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

function dataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

async function readOptionalJson<T>(zip: JSZip, path: string): Promise<T | undefined> {
  const file = zip.file(path);
  if (!file) {
    return undefined;
  }
  return JSON.parse(await file.async('text')) as T;
}

function contentCandidates(page: YachoStructurePage): string[] {
  return [
    page.content ?? '',
    page.file ?? '',
    page.path ? `contents/${page.path}` : '',
    page.slug ? `contents/${page.slug}.html` : '',
    page.id ? `contents/${page.id}.html` : ''
  ].filter(Boolean);
}

async function pageBody(zip: JSZip, page: YachoStructurePage): Promise<string> {
  for (const candidate of contentCandidates(page)) {
    const normalized = candidate.replace(/\\/g, '/');
    if (hasTraversalPath(normalized)) {
      continue;
    }
    const file = zip.file(normalized);
    if (file) {
      return sanitizeHtml(await file.async('text'));
    }
  }
  return '<main><p>Imported page body was empty.</p></main>';
}

async function importAssets(zip: JSZip): Promise<StudioAsset[]> {
  const assets: StudioAsset[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || hasTraversalPath(path)) {
      continue;
    }
    if (!/^(assets|media)\//i.test(path)) {
      continue;
    }
    const bytes = await entry.async('uint8array');
    const mime = guessMime(path);
    assets.push({
      id: createId('asset'),
      name: path.split('/').at(-1) ?? path,
      safeName: normalizeAssetPath(path).replace(/^assets\//, ''),
      mime,
      dataUrl: dataUrl(mime, bytes),
      bytes: bytes.byteLength
    });
  }
  return assets;
}

async function importThemes(zip: JSZip): Promise<StudioTheme[]> {
  const themes: StudioTheme[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || hasTraversalPath(path) || !/^css\/.+\.css$/i.test(path)) {
      continue;
    }
    themes.push({
      id: createId('theme'),
      name: path.split('/').at(-1)?.replace(/\.css$/i, '') || 'Imported CSS',
      css: await entry.async('text')
    });
  }
  return themes;
}

async function importScripts(zip: JSZip): Promise<ImportedScriptMetadata[]> {
  const scripts: ImportedScriptMetadata[] = [];
  const metadataFile = zip.file('scripts.json');
  if (metadataFile) {
    const parsed = JSON.parse(await metadataFile.async('text')) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    for (const [index, entry] of entries.entries()) {
      const record = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
      scripts.push({
        id: createId('script'),
        name: String(record.name ?? record.title ?? `Imported Script ${index + 1}`),
        path: String(record.path ?? `scripts.json#${index}`),
        enabled: false,
        metadata: entry
      });
    }
  }
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || hasTraversalPath(path) || !/^scripts\//i.test(path)) {
      continue;
    }
    scripts.push({
      id: createId('script'),
      name: path.split('/').at(-1) ?? path,
      path,
      enabled: false,
      source: await entry.async('text')
    });
  }
  return scripts;
}

export async function importYachoProjectZip(input: Blob | ArrayBuffer): Promise<StudioProject> {
  const zip = await JSZip.loadAsync(input);
  for (const path of Object.keys(zip.files)) {
    if (hasTraversalPath(path)) {
      throw new Error('YACHO zip contains an unsafe path.');
    }
  }

  const structure = (await readOptionalJson<YachoStructure>(zip, 'structure.json')) ?? {};
  const flowchart = await readOptionalJson<YachoFlowchart>(zip, 'flowchart.json');
  const createdAt = nowIso();
  const importedThemes = await importThemes(zip);
  const theme = importedThemes[0] ?? createDefaultTheme();
  const pages: StudioPage[] = [];
  const sourcePages = structure.pages?.length ? structure.pages : [{ title: 'Imported Page', slug: 'imported' }];

  for (const [index, source] of sourcePages.entries()) {
    const title = source.title ?? source.name ?? `Imported Page ${index + 1}`;
    const slug = source.slug ?? safeSlug(title, `page-${index + 1}`);
    pages.push(
      createPage({
        title,
        slug,
        path: normalizePublicPath(source.path ?? `${slug}.html`, `${slug}.html`),
        status: source.status === 'draft' ? 'draft' : 'published',
        pageNumber: source.pageNumber ?? source.number ?? index + 1,
        bodyHtml: await pageBody(zip, source),
        themeId: theme.id,
        allowScripts: false,
        memo: 'Imported from YACHO. Scripts were not auto-enabled.'
      })
    );
  }

  const fallbackFlow = createDefaultFlowchart(pages[0]);
  const importedFlow = flowchart
    ? {
        id: createId('flow'),
        name: 'Imported Flowchart',
        nodes: (flowchart.nodes ?? []).map((node, index) => ({
          id: node.id ?? createId('node'),
          label: node.label ?? node.title ?? `Node ${index + 1}`,
          pageId: node.pageId,
          x: node.x ?? 80 + index * 120,
          y: node.y ?? 80
        })),
        edges: (flowchart.edges ?? [])
          .filter((edge) => edge.source && edge.target)
          .map((edge) => ({
            id: edge.id ?? createId('edge'),
            source: edge.source as string,
            target: edge.target as string,
            label: edge.label
          }))
      }
    : fallbackFlow;

  return {
    schemaVersion: 1,
    id: createId('project'),
    name: structure.title ?? structure.name ?? 'Imported YACHO Project',
    createdAt,
    updatedAt: createdAt,
    scriptPreviewEnabled: false,
    pages,
    assets: await importAssets(zip),
    themes: importedThemes.length ? importedThemes : [theme],
    flowcharts: [importedFlow],
    searchRules: [],
    conditions: [],
    importedScripts: await importScripts(zip),
    snapshots: []
  };
}
