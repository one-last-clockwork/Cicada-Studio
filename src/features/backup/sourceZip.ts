import JSZip from 'jszip';
import type {
  ImportedScriptMetadata,
  LegacyStudioFlowchart,
  MatchMode,
  RevealBlock,
  SearchRule,
  StoryMapEdge,
  StoryMapEdgeAction,
  StoryMapNode,
  StoryMapNodeType,
  StoryPathRole,
  StoryPrerequisiteMode,
  StudioAsset,
  StudioCondition,
  StudioPage,
  StudioProject,
  StudioSite,
  StudioStoryMap,
  StudioTheme,
  UnlockPage
} from '../../types/project';
import { bytesToBase64 } from '../../lib/crypto/encoding';
import { hasTraversalPath, normalizeAssetPath, normalizePublicPath, safeSlug } from '../../lib/path-safety/pathSafety';
import { createDefaultStoryMap, createDefaultStoryState, createDefaultTheme, createId, nowIso } from '../../lib/projects/createProject';
import { dataUrlToBytes } from '../../lib/zip/blob';
import type {
  SourceZipAssetMetadata,
  SourceZipDryRunResult,
  SourceZipIssue,
  SourceZipManifest,
  SourceZipPageMetadata,
  SourceZipScriptMetadata,
  SourceZipSite,
  SourceZipThemeMetadata
} from './sourceZipTypes';

const SOURCE_MANIFEST_KIND = 'cicada-studio-project-source';
const SOURCE_MANIFEST_VERSION = 2;
const DEFAULT_SITE_ID = 'default';
const DEFAULT_SITE_ROOT = 'sites/default';

async function readableZipInput(input: Blob | ArrayBuffer): Promise<Blob | ArrayBuffer> {
  if (input instanceof Blob && typeof input.arrayBuffer === 'function') {
    return input.arrayBuffer();
  }
  return input;
}

function issue(kind: SourceZipIssue['kind'], message: string, path?: string): SourceZipIssue {
  return { kind, message, path };
}

function addIssue(collection: SourceZipIssue[], kind: SourceZipIssue['kind'], message: string, path?: string): void {
  collection.push(issue(kind, message, path));
}

function stableSortRecord(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortRecord(item));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((next, key) => {
        next[key] = stableSortRecord(record[key]);
        return next;
      }, {});
  }
  return value;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(stableSortRecord(value), null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pageBase(page: StudioPage, index: number): string {
  return safeSlug(page.slug || page.title || page.id, `page-${index + 1}`);
}

function themeBase(theme: StudioTheme, index: number): string {
  return safeSlug(theme.name || theme.id, `theme-${index + 1}`);
}

function makeUniqueName(base: string, used: Set<string>, extension = ''): string {
  const normalized = safeSlug(base.replace(new RegExp(`${extension.replace('.', '\\.')}$`, 'i'), ''), 'item');
  let candidate = `${normalized}${extension}`;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${normalized}-${index}${extension}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function uniqueAssetFileName(name: string, used: Set<string>, fallback: string): string {
  const normalized = normalizeAssetPath(name || fallback).replace(/^assets\//, '');
  const parts = normalized.split('.');
  const extension = parts.length > 1 ? `.${parts.pop() ?? ''}` : '';
  const base = parts.join('.') || fallback.replace(/\.[^.]+$/, '');
  return makeUniqueName(base, used, extension);
}

function sourceFileNameForScript(script: ImportedScriptMetadata, used: Set<string>, index: number): string {
  const fallback = `script-${index + 1}.txt`;
  return uniqueAssetFileName(script.path || script.name || fallback, used, fallback);
}

function manifestForProject(project: StudioProject, sites: SourceZipSite[]): SourceZipManifest {
  return {
    kind: SOURCE_MANIFEST_KIND,
    version: SOURCE_MANIFEST_VERSION,
    exportedAt: nowIso(),
    project: {
      schemaVersion: project.schemaVersion,
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      scriptPreviewEnabled: project.scriptPreviewEnabled,
      storyNamespace: project.storyNamespace,
      primarySiteId: project.primarySiteId
    },
    sites
  };
}

function sourceRootForSite(site: StudioSite, index: number, used: Set<string>): string {
  const base = safeSlug(site.slug || site.name || site.id, index === 0 ? DEFAULT_SITE_ID : `site-${index + 1}`);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return `sites/${candidate}`;
}

function uniqueSourceSlug(page: StudioPage, index: number, used: Set<string>): string {
  const base = safeSlug(page.slug || page.title || page.id, `page-${index + 1}`);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function uniqueSourcePublicPath(path: string | undefined, fallback: string, used: Set<string>): string {
  const normalized = normalizePublicPath(path || fallback, fallback);
  let candidate = normalized;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = normalized.replace(/\.html$/i, `-${suffix}.html`);
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function themesForSourceExport(site: StudioSite): StudioTheme[] {
  return site.themes.length ? site.themes : [createDefaultTheme()];
}

function pagesForSourceExport(site: StudioSite, themes: StudioTheme[]): StudioPage[] {
  const usedSlugs = new Set<string>();
  const usedPaths = new Set<string>();
  const themeIds = new Set(themes.map((theme) => theme.id));
  const defaultThemeId = themes[0]?.id;
  return site.pages.map((page, index) => {
    const slug = uniqueSourceSlug(page, index, usedSlugs);
    const fallbackPath = index === 0 ? 'index.html' : `${slug}.html`;
    const path = uniqueSourcePublicPath(page.path, fallbackPath, usedPaths);
    return {
      ...page,
      slug,
      path,
      pageNumber: index + 1,
      themeId: page.themeId && themeIds.has(page.themeId) ? page.themeId : defaultThemeId
    };
  });
}

function storyMapsForSourceExport(project: StudioProject, pageIds: Set<string>): StudioStoryMap[] {
  if (!project.storyMaps.length) {
    const firstSite = project.sites[0];
    return firstSite ? [createDefaultStoryMap(firstSite)] : [];
  }
  return project.storyMaps.map((storyMap) => {
    const nodes = storyMap.nodes.map((node) => {
      const linkedEntity =
        node.linkedEntity?.kind === 'page' && node.linkedEntity.pageId && !pageIds.has(node.linkedEntity.pageId)
          ? undefined
          : node.linkedEntity;
      return {
        ...node,
        linkedEntity,
        pageId: node.pageId && pageIds.has(node.pageId) ? node.pageId : undefined
      };
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    return {
      ...storyMap,
      nodes,
      edges: storyMap.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    };
  });
}

export async function exportProjectSourceZip(project: StudioProject): Promise<Blob> {
  const zip = new JSZip();
  const sourceSites: SourceZipSite[] = [];
  const usedSiteRoots = new Set<string>();
  const pageIds = new Set<string>();
  const usedAssetNames = new Set<string>();
  const usedScriptNames = new Set<string>();

  for (const [siteIndex, site] of project.sites.entries()) {
    const siteRoot = sourceRootForSite(site, siteIndex, usedSiteRoots);
    const themes = themesForSourceExport(site);
    const pages = pagesForSourceExport(site, themes);
    const usedPageNames = new Set<string>();
    const usedThemeNames = new Set<string>();
    const pageFiles: string[] = [];
    const themeFiles: string[] = [];

    for (const [index, page] of pages.entries()) {
      pageIds.add(page.id);
      const fileBase = makeUniqueName(pageBase(page, index), usedPageNames);
      const bodyFile = `${siteRoot}/pages/${fileBase}.html`;
      const metadataFile = `${siteRoot}/pages/${fileBase}.json`;
      const metadata = {
        allowScripts: page.allowScripts,
        bodyFile,
        id: page.id,
        memo: page.memo,
        pageNumber: page.pageNumber,
        path: page.path,
        revealBlocks: page.revealBlocks,
        slug: page.slug,
        status: page.status,
        themeId: page.themeId,
        title: page.title,
        unlockPages: page.unlockPages
      };
      zip.file(bodyFile, page.bodyHtml);
      zip.file(metadataFile, stableJson(metadata));
      pageFiles.push(metadataFile);
    }

    for (const [index, theme] of themes.entries()) {
      const fileBase = makeUniqueName(themeBase(theme, index), usedThemeNames);
      const cssFile = `${siteRoot}/themes/${fileBase}.css`;
      const metadataFile = `${siteRoot}/themes/${fileBase}.json`;
      zip.file(cssFile, theme.css);
      zip.file(metadataFile, stableJson({ cssFile, id: theme.id, name: theme.name }));
      themeFiles.push(metadataFile);
    }

    const sourceSite: SourceZipSite = {
      id: site.id,
      slug: site.slug,
      name: site.name,
      pathPrefix: site.pathPrefix,
      root: siteRoot,
      pageFiles,
      themeFiles
    };
    sourceSites.push(sourceSite);
    zip.file(`${siteRoot}/site.json`, stableJson(sourceSite));
  }

  zip.file('cicada.project.json', stableJson(manifestForProject(project, sourceSites)));
  zip.file('story/story-maps.json', stableJson(storyMapsForSourceExport(project, pageIds)));
  zip.file('story/story-state.json', stableJson(project.storyState));
  zip.file('search/rules.json', stableJson(project.searchRules));
  zip.file('conditions.json', stableJson(project.conditions));
  zip.file('messenger/threads.json', stableJson(project.messengerThreads));

  const assetManifest: SourceZipAssetMetadata[] = [];
  for (const [index, asset] of project.assets.entries()) {
    const fileName = uniqueAssetFileName(asset.safeName || asset.name, usedAssetNames, `asset-${index + 1}.bin`);
    const file = `assets/files/${fileName}`;
    zip.file(file, dataUrlToBytes(asset.dataUrl));
    assetManifest.push({
      bytes: asset.bytes,
      file,
      id: asset.id,
      mime: asset.mime,
      name: asset.name,
      safeName: asset.safeName
    });
  }
  zip.file('assets/manifest.json', stableJson(assetManifest));

  const scriptMetadata: SourceZipScriptMetadata[] = [];
  for (const [index, script] of project.importedScripts.entries()) {
    const sourceFile = script.source ? `scripts/files/${sourceFileNameForScript(script, usedScriptNames, index)}` : undefined;
    if (sourceFile && script.source) {
      zip.file(sourceFile, script.source);
    }
    scriptMetadata.push({
      enabled: false,
      id: script.id,
      metadata: script.metadata,
      name: script.name,
      path: script.path,
      sourceFile
    });
  }
  zip.file('scripts/metadata.json', stableJson(scriptMetadata));

  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return new Blob([buffer], { type: 'application/zip' });
}

async function readJsonFile<T>(zip: JSZip, path: string, result: SourceZipDryRunResult): Promise<T | undefined> {
  const file = zip.file(path);
  if (!file) {
    addIssue(result.errors, 'error', 'Required JSON file is missing.', path);
    return undefined;
  }
  try {
    return JSON.parse(await file.async('text')) as T;
  } catch {
    addIssue(result.errors, 'error', 'JSON could not be parsed.', path);
    return undefined;
  }
}

async function readOptionalJsonFile<T>(zip: JSZip, path: string, result: SourceZipDryRunResult): Promise<T | undefined> {
  const file = zip.file(path);
  if (!file) {
    return undefined;
  }
  try {
    return JSON.parse(await file.async('text')) as T;
  } catch {
    addIssue(result.errors, 'error', 'JSON could not be parsed.', path);
    return undefined;
  }
}

function fileListFromZip(zip: JSZip, prefix: string, extension: string): string[] {
  return Object.keys(zip.files)
    .filter((path) => !zip.files[path]?.dir && path.startsWith(prefix) && path.endsWith(extension))
    .sort();
}

function metadataFiles(site: SourceZipSite | undefined, zip: JSZip, type: 'pages' | 'themes'): string[] {
  const listed = type === 'pages' ? site?.pageFiles : site?.themeFiles;
  if (Array.isArray(listed) && listed.length) {
    return listed.filter((path) => typeof path === 'string').sort();
  }
  return fileListFromZip(zip, `${site?.root ?? DEFAULT_SITE_ROOT}/${type}/`, '.json');
}

function parseRevealBlocks(value: unknown): RevealBlock[] {
  return arrayValue(value).map((item, index) => {
    const record = isRecord(item) ? item : {};
    return {
      id: optionalString(record.id) ?? createId('reveal'),
      label: optionalString(record.label) ?? `Reveal ${index + 1}`,
      prompt: optionalString(record.prompt) ?? 'Answer',
      answerAliases: arrayValue(record.answerAliases).map(String).filter(Boolean),
      secretHtml: optionalString(record.secretHtml) ?? '',
      failureMessage: optionalString(record.failureMessage) ?? 'The submitted value did not unlock anything.'
    };
  });
}

function parseUnlockPages(value: unknown): UnlockPage[] {
  return arrayValue(value).map((item, index) => {
    const record = isRecord(item) ? item : {};
    const id = optionalString(record.id) ?? createId('unlock');
    return {
      id,
      label: optionalString(record.label) ?? `Unlock ${index + 1}`,
      path: normalizePublicPath(optionalString(record.path) ?? `${id}.html`, `${id}.html`),
      prompt: optionalString(record.prompt) ?? 'Key',
      answerAliases: arrayValue(record.answerAliases).map(String).filter(Boolean),
      payloadHtml: optionalString(record.payloadHtml) ?? '',
      failureMessage: optionalString(record.failureMessage) ?? 'The submitted value did not unlock anything.'
    };
  });
}

function normalizePageStatus(value: unknown): 'draft' | 'published' {
  return value === 'draft' ? 'draft' : 'published';
}

function parseMatchMode(value: unknown): MatchMode {
  return value === 'contains' ? 'contains' : 'exact';
}

function makeUniquePublicPath(path: string, used: Set<string>, fallback: string, result: SourceZipDryRunResult, sourcePath?: string): string {
  const normalized = normalizePublicPath(path, fallback);
  let candidate = normalized;
  let index = 2;
  while (used.has(candidate)) {
    candidate = normalized.replace(/\.html$/i, `-${index}.html`);
    index += 1;
  }
  used.add(candidate);
  if (candidate !== normalized || normalized !== path) {
    addIssue(result.repairs, 'repair', `Page path was normalized to ${candidate}.`, sourcePath);
  }
  return candidate;
}

function makeUniqueSlug(slug: string, used: Set<string>, fallback: string, result: SourceZipDryRunResult, sourcePath?: string): string {
  const base = safeSlug(slug, fallback);
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  used.add(candidate);
  if (candidate !== slug) {
    addIssue(result.repairs, 'repair', `Page slug was normalized to ${candidate}.`, sourcePath);
  }
  return candidate;
}

async function importPages(zip: JSZip, site: SourceZipSite | undefined, result: SourceZipDryRunResult): Promise<StudioPage[]> {
  const pages: StudioPage[] = [];
  const usedSlugs = new Set<string>();
  const usedPaths = new Set<string>();
  const pageIds = new Set<string>();
  const files = metadataFiles(site, zip, 'pages');
  if (!files.length) {
    addIssue(result.errors, 'error', 'Source Zip does not contain any page metadata.', `${DEFAULT_SITE_ROOT}/pages`);
    return pages;
  }

  for (const [index, metadataPath] of files.entries()) {
    const metadata = await readJsonFile<SourceZipPageMetadata>(zip, metadataPath, result);
    if (!metadata) {
      continue;
    }
    const bodyFile = metadata.bodyFile ?? metadataPath.replace(/\.json$/i, '.html');
    const bodyEntry = zip.file(bodyFile);
    if (!bodyEntry) {
      addIssue(result.errors, 'error', 'Page body file is missing.', bodyFile);
      continue;
    }
    let id = metadata.id;
    if (!id) {
      id = createId('page');
      addIssue(result.repairs, 'repair', `Missing page id was generated as ${id}.`, metadataPath);
    }
    if (pageIds.has(id)) {
      addIssue(result.errors, 'error', `Duplicate page id "${id}" is ambiguous.`, metadataPath);
      continue;
    }
    pageIds.add(id);
    const title = metadata.title || `Page ${index + 1}`;
    const slug = makeUniqueSlug(metadata.slug || title, usedSlugs, `page-${index + 1}`, result, metadataPath);
    const fallbackPath = index === 0 ? 'index.html' : `${slug}.html`;
    const path = makeUniquePublicPath(metadata.path || fallbackPath, usedPaths, fallbackPath, result, metadataPath);
    pages.push({
      id,
      title,
      slug,
      path,
      status: normalizePageStatus(metadata.status),
      pageNumber: optionalNumber(metadata.pageNumber) ?? index + 1,
      bodyHtml: await bodyEntry.async('text'),
      themeId: metadata.themeId,
      allowScripts: optionalBoolean(metadata.allowScripts) ?? false,
      memo: metadata.memo ?? '',
      revealBlocks: parseRevealBlocks(metadata.revealBlocks),
      unlockPages: parseUnlockPages(metadata.unlockPages)
    });
  }

  return pages.sort((a, b) => a.pageNumber - b.pageNumber).map((page, index) => ({ ...page, pageNumber: index + 1 }));
}

async function importThemes(zip: JSZip, site: SourceZipSite | undefined, result: SourceZipDryRunResult): Promise<StudioTheme[]> {
  const themes: StudioTheme[] = [];
  const ids = new Set<string>();
  const files = metadataFiles(site, zip, 'themes');
  for (const [index, metadataPath] of files.entries()) {
    const metadata = await readJsonFile<SourceZipThemeMetadata>(zip, metadataPath, result);
    if (!metadata) {
      continue;
    }
    const cssFile = metadata.cssFile ?? metadataPath.replace(/\.json$/i, '.css');
    const cssEntry = zip.file(cssFile);
    if (!cssEntry) {
      addIssue(result.errors, 'error', 'Theme CSS file is missing.', cssFile);
      continue;
    }
    let id = metadata.id;
    if (!id) {
      id = createId('theme');
      addIssue(result.repairs, 'repair', `Missing theme id was generated as ${id}.`, metadataPath);
    }
    if (ids.has(id)) {
      addIssue(result.errors, 'error', `Duplicate theme id "${id}" is ambiguous.`, metadataPath);
      continue;
    }
    ids.add(id);
    themes.push({
      id,
      name: metadata.name || `Theme ${index + 1}`,
      css: await cssEntry.async('text')
    });
  }
  if (!themes.length) {
    const theme = createDefaultTheme();
    themes.push(theme);
    addIssue(result.repairs, 'repair', 'No themes were found, so a default theme was created.', `${DEFAULT_SITE_ROOT}/themes`);
  }
  return themes;
}

function repairPageThemeReferences(pages: StudioPage[], themes: StudioTheme[], result: SourceZipDryRunResult): StudioPage[] {
  const themeIds = new Set(themes.map((theme) => theme.id));
  const defaultThemeId = themes[0]?.id;
  return pages.map((page) => {
    if (!page.themeId) {
      addIssue(result.repairs, 'repair', `Missing theme reference on page "${page.title}" was changed to the default theme.`, page.id);
      return { ...page, themeId: defaultThemeId };
    }
    if (themeIds.has(page.themeId)) {
      return page;
    }
    addIssue(result.repairs, 'repair', `Missing theme reference on page "${page.title}" was changed to the default theme.`, page.id);
    return { ...page, themeId: defaultThemeId };
  });
}

const STORY_MAP_NODE_TYPES: StoryMapNodeType[] = [
  'project',
  'site',
  'page',
  'clue',
  'discovery',
  'action',
  'gate',
  'internal_site',
  'external_surface',
  'messenger',
  'state_change',
  'custom'
];

const STORY_MAP_EDGE_ACTIONS: StoryMapEdgeAction[] = [
  'read',
  'notice',
  'search_web',
  'search_social',
  'enter_url',
  'move_site',
  'solve_cipher',
  'submit_keyword',
  'combine_clues',
  'wait',
  'receive_message',
  'custom'
];

const STORY_PATH_ROLES: StoryPathRole[] = ['intended', 'alternate', 'shortcut_allowed', 'recovery', 'risk'];
const STORY_PREREQUISITE_MODES: StoryPrerequisiteMode[] = ['permissive', 'strict'];

function optionalStringArray(value: unknown): string[] {
  return arrayValue(value).map(String).filter(Boolean);
}

function pageSiteId(pageSites: Map<string, string>, pageId: string | undefined): string | undefined {
  return pageId ? pageSites.get(pageId) : undefined;
}

function normalizeStoryMapNodeType(value: unknown): StoryMapNodeType {
  return STORY_MAP_NODE_TYPES.includes(value as StoryMapNodeType) ? (value as StoryMapNodeType) : 'custom';
}

function normalizeStoryMapEdgeAction(value: unknown): StoryMapEdgeAction {
  return STORY_MAP_EDGE_ACTIONS.includes(value as StoryMapEdgeAction) ? (value as StoryMapEdgeAction) : 'custom';
}

function normalizeStoryPathRole(value: unknown): StoryPathRole {
  return STORY_PATH_ROLES.includes(value as StoryPathRole) ? (value as StoryPathRole) : 'intended';
}

function normalizeStoryPrerequisiteMode(value: unknown): StoryPrerequisiteMode {
  return STORY_PREREQUISITE_MODES.includes(value as StoryPrerequisiteMode) ? (value as StoryPrerequisiteMode) : 'permissive';
}

function parseStoryMaps(
  value: unknown,
  pageIds: Set<string>,
  pageSites: Map<string, string>,
  result: SourceZipDryRunResult,
  fallbackSite: StudioSite
): StudioStoryMap[] {
  const source = Array.isArray(value) ? value : [];
  if (!source.length) {
    addIssue(result.repairs, 'repair', 'No Story Maps were found, so a default Story Map was created.', 'story/story-maps.json');
    return [createDefaultStoryMap(fallbackSite)];
  }
  return source.map((item, storyMapIndex) => {
    const record = isRecord(item) ? item : {};
    const rawNodes = arrayValue(record.nodes);
    const nodes: StoryMapNode[] = rawNodes.map((node, nodeIndex) => {
      const nodeRecord = isRecord(node) ? node : {};
      const rawPageId = optionalString(nodeRecord.pageId);
      const pageId = rawPageId && pageIds.has(rawPageId) ? rawPageId : undefined;
      if (rawPageId && !pageId) {
        addIssue(result.warnings, 'warning', `Story Map node "${optionalString(nodeRecord.label) ?? nodeIndex + 1}" references a missing page.`, 'story/story-maps.json');
      }
      return {
        id: optionalString(nodeRecord.id) ?? createId('node'),
        label: optionalString(nodeRecord.label) ?? `Node ${nodeIndex + 1}`,
        type: normalizeStoryMapNodeType(nodeRecord.type),
        linkedEntity: isRecord(nodeRecord.linkedEntity) ? (nodeRecord.linkedEntity as unknown as StoryMapNode['linkedEntity']) : undefined,
        siteId: optionalString(nodeRecord.siteId) ?? pageSiteId(pageSites, pageId),
        pageId,
        externalUrl: optionalString(nodeRecord.externalUrl),
        notes: optionalString(nodeRecord.notes) ?? '',
        tags: optionalStringArray(nodeRecord.tags),
        x: optionalNumber(nodeRecord.x) ?? 80 + nodeIndex * 120,
        y: optionalNumber(nodeRecord.y) ?? 80
      };
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: StoryMapEdge[] = [];
    for (const [edgeIndex, edge] of arrayValue(record.edges).entries()) {
      const edgeRecord = isRecord(edge) ? edge : {};
      const source = optionalString(edgeRecord.source);
      const target = optionalString(edgeRecord.target);
      if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) {
        addIssue(result.repairs, 'repair', 'Story Map edge with a missing node reference was removed.', 'story/story-maps.json');
        continue;
      }
      edges.push({
        id: optionalString(edgeRecord.id) ?? createId('edge'),
        source,
        target,
        label: optionalString(edgeRecord.label) ?? `Edge ${edgeIndex + 1}`,
        action: normalizeStoryMapEdgeAction(edgeRecord.action),
        pathRole: normalizeStoryPathRole(edgeRecord.pathRole),
        prerequisiteMode: normalizeStoryPrerequisiteMode(edgeRecord.prerequisiteMode),
        difficulty:
          edgeRecord.difficulty === 'low' || edgeRecord.difficulty === 'medium' || edgeRecord.difficulty === 'high'
            ? edgeRecord.difficulty
            : undefined,
        expectedInput: optionalString(edgeRecord.expectedInput),
        fallbackHint: optionalString(edgeRecord.fallbackHint),
        notes: optionalString(edgeRecord.notes) ?? '',
        tags: optionalStringArray(edgeRecord.tags),
        trigger: isRecord(edgeRecord.trigger) ? (edgeRecord.trigger as unknown as StoryMapEdge['trigger']) : undefined,
        effects: Array.isArray(edgeRecord.effects) ? (edgeRecord.effects as StoryMapEdge['effects']) : []
      });
    }
    return {
      id: optionalString(record.id) ?? createId('story-map'),
      name: optionalString(record.name) ?? `Story Map ${storyMapIndex + 1}`,
      nodes,
      edges
    };
  });
}

function migrateLegacyFlowcharts(
  value: unknown,
  pageIds: Set<string>,
  pageSites: Map<string, string>,
  result: SourceZipDryRunResult,
  fallbackSite: StudioSite
): StudioStoryMap[] {
  const source = Array.isArray(value) ? (value as LegacyStudioFlowchart[]) : [];
  if (!source.length) {
    return parseStoryMaps(undefined, pageIds, pageSites, result, fallbackSite);
  }
  addIssue(result.repairs, 'repair', 'Legacy flowcharts were migrated to Story Maps.', 'story/flowcharts.json');
  return source.map((item, flowIndex) => {
    const record: Record<string, unknown> = isRecord(item) ? (item as unknown as Record<string, unknown>) : {};
    const rawNodes = arrayValue(record.nodes);
    const nodes: StoryMapNode[] = rawNodes.map((node, nodeIndex) => {
      const nodeRecord = isRecord(node) ? node : {};
      const rawPageId = optionalString(nodeRecord.pageId);
      const pageId = rawPageId && pageIds.has(rawPageId) ? rawPageId : undefined;
      if (rawPageId && !pageId) {
        addIssue(result.warnings, 'warning', `Story Map node "${optionalString(nodeRecord.label) ?? nodeIndex + 1}" references a missing page.`, 'story/flowcharts.json');
      }
      return {
        id: optionalString(nodeRecord.id) ?? createId('node'),
        label: optionalString(nodeRecord.label) ?? `Node ${nodeIndex + 1}`,
        type: pageId ? 'page' : 'discovery',
        linkedEntity: pageId ? { kind: 'page', id: pageId, pageId, siteId: pageSiteId(pageSites, pageId) } : undefined,
        siteId: pageSiteId(pageSites, pageId),
        pageId,
        notes: '',
        tags: [],
        x: optionalNumber(nodeRecord.x) ?? 80 + nodeIndex * 120,
        y: optionalNumber(nodeRecord.y) ?? 80
      };
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: StoryMapEdge[] = [];
    for (const [edgeIndex, edge] of arrayValue(record.edges).entries()) {
      const edgeRecord = isRecord(edge) ? edge : {};
      const source = optionalString(edgeRecord.source);
      const target = optionalString(edgeRecord.target);
      if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) {
        addIssue(result.repairs, 'repair', 'Story Map edge with a missing node reference was removed.', 'story/flowcharts.json');
        continue;
      }
      edges.push({
        id: optionalString(edgeRecord.id) ?? createId('edge'),
        source,
        target,
        label: optionalString(edgeRecord.label) ?? `Edge ${edgeIndex + 1}`,
        action: 'read',
        pathRole: 'intended',
        prerequisiteMode: 'permissive',
        notes: '',
        tags: [],
        effects: []
      });
    }
    return {
      id: optionalString(record.id) ?? createId('story-map'),
      name: optionalString(record.name)?.replace(/flowchart/gi, 'Story Map') ?? `Story Map ${flowIndex + 1}`,
      nodes,
      edges
    };
  });
}

function parseSearchRules(value: unknown, pageIds: Set<string>, result: SourceZipDryRunResult): SearchRule[] {
  return arrayValue(value).map((item, index) => {
    const record = isRecord(item) ? item : {};
    const targetPageId = optionalString(record.targetPageId) ?? '';
    if (!targetPageId || !pageIds.has(targetPageId)) {
      addIssue(result.errors, 'error', `Search rule "${optionalString(record.label) ?? index + 1}" references a missing target page.`, 'search/rules.json');
    }
    return {
      id: optionalString(record.id) ?? createId('search'),
      label: optionalString(record.label) ?? `Search Rule ${index + 1}`,
      terms: arrayValue(record.terms).map(String).filter(Boolean),
      aliases: arrayValue(record.aliases).map(String).filter(Boolean),
      mode: parseMatchMode(record.mode),
      targetPageId,
      hint: optionalString(record.hint) ?? '',
      failureMessage: optionalString(record.failureMessage) ?? 'The submitted value did not unlock anything.'
    };
  });
}

function parseConditions(value: unknown, pageIds: Set<string>, result: SourceZipDryRunResult): StudioCondition[] {
  return arrayValue(value).map((item, index) => {
    const record = isRecord(item) ? item : {};
    const sourcePageId = optionalString(record.sourcePageId) ?? '';
    const targetPageId = optionalString(record.targetPageId) ?? '';
    if (!sourcePageId || !pageIds.has(sourcePageId)) {
      addIssue(result.errors, 'error', `Condition "${optionalString(record.label) ?? index + 1}" references a missing source page.`, 'conditions.json');
    }
    if (!targetPageId || !pageIds.has(targetPageId)) {
      addIssue(result.errors, 'error', `Condition "${optionalString(record.label) ?? index + 1}" references a missing target page.`, 'conditions.json');
    }
    return {
      id: optionalString(record.id) ?? createId('condition'),
      label: optionalString(record.label) ?? `Condition ${index + 1}`,
      sourcePageId,
      targetPageId,
      publicHint: optionalString(record.publicHint) ?? '',
      internalNote: optionalString(record.internalNote) ?? ''
    };
  });
}

async function importAssets(zip: JSZip, result: SourceZipDryRunResult): Promise<StudioAsset[]> {
  const manifest = await readOptionalJsonFile<unknown>(zip, 'assets/manifest.json', result);
  if (!manifest) {
    return [];
  }
  if (!Array.isArray(manifest)) {
    addIssue(result.errors, 'error', 'Asset manifest must be an array.', 'assets/manifest.json');
    return [];
  }
  const assets: StudioAsset[] = [];
  for (const [index, item] of manifest.entries()) {
    const record = isRecord(item) ? item : {};
    const file = optionalString(record.file);
    if (!file) {
      addIssue(result.warnings, 'warning', `Asset ${index + 1} does not declare a file and was skipped.`, 'assets/manifest.json');
      continue;
    }
    const entry = zip.file(file);
    if (!entry) {
      addIssue(result.warnings, 'warning', `Asset file "${file}" is missing and was skipped.`, file);
      continue;
    }
    const bytes = await entry.async('uint8array');
    const name = optionalString(record.name) ?? file.split('/').at(-1) ?? `asset-${index + 1}`;
    const mime = optionalString(record.mime) ?? 'application/octet-stream';
    assets.push({
      id: optionalString(record.id) ?? createId('asset'),
      name,
      safeName: normalizeAssetPath(optionalString(record.safeName) ?? name).replace(/^assets\//, ''),
      mime,
      dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`,
      bytes: optionalNumber(record.bytes) ?? bytes.byteLength
    });
  }
  return assets;
}

async function importScripts(zip: JSZip, result: SourceZipDryRunResult): Promise<ImportedScriptMetadata[]> {
  const manifest = await readOptionalJsonFile<unknown>(zip, 'scripts/metadata.json', result);
  if (!manifest) {
    return [];
  }
  if (!Array.isArray(manifest)) {
    addIssue(result.errors, 'error', 'Script metadata must be an array.', 'scripts/metadata.json');
    return [];
  }
  const scripts: ImportedScriptMetadata[] = [];
  for (const [index, item] of manifest.entries()) {
    const record = isRecord(item) ? item : {};
    const sourceFile = optionalString(record.sourceFile);
    const sourceEntry = sourceFile ? zip.file(sourceFile) : null;
    let source: string | undefined;
    if (sourceFile && sourceEntry) {
      source = await sourceEntry.async('text');
    } else if (sourceFile) {
      addIssue(result.warnings, 'warning', `Script source "${sourceFile}" is missing.`, sourceFile);
    }
    if (record.enabled === true) {
      addIssue(result.repairs, 'repair', 'Imported script was forced to disabled.', 'scripts/metadata.json');
    }
    scripts.push({
      id: optionalString(record.id) ?? createId('script'),
      name: optionalString(record.name) ?? `Imported Script ${index + 1}`,
      path: optionalString(record.path) ?? sourceFile ?? `scripts/metadata.json#${index}`,
      enabled: false,
      source,
      metadata: record.metadata
    });
  }
  return scripts;
}

function parseMessengerThreads(value: unknown): StudioProject['messengerThreads'] {
  return Array.isArray(value) ? (value as StudioProject['messengerThreads']) : [];
}

function parseStoryState(value: unknown): StudioProject['storyState'] {
  return isRecord(value) ? (value as unknown as StudioProject['storyState']) : createDefaultStoryState();
}

function emptyDryRunResult(): SourceZipDryRunResult {
  return {
    ok: false,
    errors: [],
    warnings: [],
    repairs: []
  };
}

function parsedManifestProject(manifest: unknown, result: SourceZipDryRunResult): SourceZipManifest['project'] | undefined {
  if (!isRecord(manifest)) {
    addIssue(result.errors, 'error', 'Source Zip manifest must be an object.', 'cicada.project.json');
    return undefined;
  }
  if (manifest.kind !== SOURCE_MANIFEST_KIND || (manifest.version !== 1 && manifest.version !== 2)) {
    addIssue(result.errors, 'error', 'Zip is not a supported Cicada Studio Source Zip.', 'cicada.project.json');
    return undefined;
  }
  const project = isRecord(manifest.project) ? manifest.project : {};
  const now = nowIso();
  let id = optionalString(project.id);
  if (!id) {
    id = createId('project');
    addIssue(result.repairs, 'repair', `Missing project id was generated as ${id}.`, 'cicada.project.json');
  }
  return {
    schemaVersion: 2,
    id,
    name: optionalString(project.name) ?? 'Imported Source Project',
    createdAt: optionalString(project.createdAt) ?? now,
    updatedAt: optionalString(project.updatedAt) ?? now,
    scriptPreviewEnabled: optionalBoolean(project.scriptPreviewEnabled) ?? false,
    storyNamespace: optionalString(project.storyNamespace),
    primarySiteId: optionalString(project.primarySiteId)
  };
}

function normalizeSitePathPrefix(value: unknown): string {
  const raw = optionalString(value)?.replace(/^\/+|\/+$/g, '') ?? '';
  if (!raw) {
    return '';
  }
  return normalizePublicPath(`${raw}/index.html`, 'index.html').replace(/\/?index\.html$/i, '');
}

async function sourceSitesFromManifest(zip: JSZip, manifest: unknown, result: SourceZipDryRunResult): Promise<SourceZipSite[]> {
  if (!isRecord(manifest)) {
    return [];
  }
  const rawSites = Array.isArray(manifest.sites) ? manifest.sites : [];
  if (rawSites.length) {
    const sites: SourceZipSite[] = [];
    const ids = new Set<string>();
    for (const [index, rawSite] of rawSites.entries()) {
      const record = isRecord(rawSite) ? rawSite : {};
      const id = optionalString(record.id) ?? (index === 0 ? DEFAULT_SITE_ID : createId('site'));
      if (ids.has(id)) {
        addIssue(result.errors, 'error', `Duplicate site id "${id}" is ambiguous.`, 'cicada.project.json');
        continue;
      }
      ids.add(id);
      const slug = safeSlug(optionalString(record.slug) ?? optionalString(record.name) ?? id, index === 0 ? DEFAULT_SITE_ID : `site-${index + 1}`);
      const root = optionalString(record.root) ?? `sites/${slug}`;
      const siteJson = await readOptionalJsonFile<SourceZipSite>(zip, `${root}/site.json`, result);
      sites.push({
        id,
        slug,
        name: optionalString(record.name) ?? siteJson?.name ?? `Site ${index + 1}`,
        pathPrefix: normalizeSitePathPrefix(record.pathPrefix ?? siteJson?.pathPrefix),
        root,
        pageFiles: Array.isArray(record.pageFiles) ? record.pageFiles.map(String) : siteJson?.pageFiles ?? [],
        themeFiles: Array.isArray(record.themeFiles) ? record.themeFiles.map(String) : siteJson?.themeFiles ?? []
      });
    }
    return sites;
  }

  const legacySite = isRecord(manifest.site) ? manifest.site : {};
  const site = await readOptionalJsonFile<SourceZipSite>(zip, `${DEFAULT_SITE_ROOT}/site.json`, result);
  if (!site) {
    addIssue(result.warnings, 'warning', 'Default site metadata is missing; files will be discovered from directories.', `${DEFAULT_SITE_ROOT}/site.json`);
  }
  return [
    {
      id: optionalString(legacySite.id) ?? site?.id ?? DEFAULT_SITE_ID,
      slug: safeSlug(optionalString(legacySite.slug) ?? site?.slug ?? DEFAULT_SITE_ID, DEFAULT_SITE_ID),
      name: optionalString(legacySite.name) ?? site?.name ?? 'Default Site',
      pathPrefix: normalizeSitePathPrefix(site?.pathPrefix),
      root: DEFAULT_SITE_ROOT,
      pageFiles: site?.pageFiles ?? [],
      themeFiles: site?.themeFiles ?? []
    }
  ];
}

async function loadZip(input: Blob | ArrayBuffer, result: SourceZipDryRunResult): Promise<JSZip | undefined> {
  try {
    const zip = await JSZip.loadAsync(await readableZipInput(input));
    for (const path of Object.keys(zip.files)) {
      const entry = zip.files[path] as JSZip.JSZipObject & { unsafeOriginalName?: string };
      const originalPath = entry.unsafeOriginalName ?? path;
      if (hasTraversalPath(path) || hasTraversalPath(originalPath)) {
        addIssue(result.errors, 'error', 'Source Zip contains an unsafe path.', originalPath);
      }
    }
    return zip;
  } catch {
    addIssue(result.errors, 'error', 'Source Zip could not be opened.');
    return undefined;
  }
}

export async function dryRunImportProjectSourceZip(input: Blob | ArrayBuffer): Promise<SourceZipDryRunResult> {
  const result = emptyDryRunResult();
  const zip = await loadZip(input, result);
  if (!zip) {
    return result;
  }
  if (result.errors.length) {
    return result;
  }

  const manifest = await readJsonFile<unknown>(zip, 'cicada.project.json', result);
  const projectMetadata = parsedManifestProject(manifest, result);
  if (!projectMetadata) {
    return result;
  }

  const sourceSites = await sourceSitesFromManifest(zip, manifest, result);
  const sites: StudioSite[] = [];
  const pageIds = new Set<string>();
  const pageSites = new Map<string, string>();
  const siteIds = new Set<string>();
  for (const sourceSite of sourceSites) {
    if (siteIds.has(sourceSite.id)) {
      addIssue(result.errors, 'error', `Duplicate site id "${sourceSite.id}" is ambiguous.`, sourceSite.root);
      continue;
    }
    siteIds.add(sourceSite.id);
    const themes = await importThemes(zip, sourceSite, result);
    let pages = await importPages(zip, sourceSite, result);
    pages = repairPageThemeReferences(pages, themes, result);
    for (const page of pages) {
      if (pageIds.has(page.id)) {
        addIssue(result.errors, 'error', `Duplicate page id "${page.id}" is ambiguous across sites.`, sourceSite.root);
        continue;
      }
      pageIds.add(page.id);
      pageSites.set(page.id, sourceSite.id);
    }
    sites.push({
      id: sourceSite.id,
      name: sourceSite.name,
      slug: sourceSite.slug,
      pathPrefix: sourceSite.pathPrefix ?? '',
      pages,
      themes
    });
  }

  if (!sites.length || !Array.from(sites.values()).some((site) => site.pages.length)) {
    return result;
  }

  const storyMapsJson = await readOptionalJsonFile<unknown>(zip, 'story/story-maps.json', result);
  const legacyFlowchartJson = storyMapsJson ? undefined : await readOptionalJsonFile<unknown>(zip, 'story/flowcharts.json', result);
  const storyStateJson = await readOptionalJsonFile<unknown>(zip, 'story/story-state.json', result);
  const searchJson = await readOptionalJsonFile<unknown>(zip, 'search/rules.json', result);
  const conditionsJson = await readOptionalJsonFile<unknown>(zip, 'conditions.json', result);
  const messengerJson = await readOptionalJsonFile<unknown>(zip, 'messenger/threads.json', result);
  const fallbackSite = sites[0];

  const project: StudioProject = {
    schemaVersion: 2,
    id: projectMetadata.id,
    name: projectMetadata.name,
    createdAt: projectMetadata.createdAt,
    updatedAt: projectMetadata.updatedAt,
    scriptPreviewEnabled: projectMetadata.scriptPreviewEnabled,
    storyNamespace: projectMetadata.storyNamespace || safeSlug(projectMetadata.id || projectMetadata.name, 'story'),
    primarySiteId: projectMetadata.primarySiteId && siteIds.has(projectMetadata.primarySiteId) ? projectMetadata.primarySiteId : fallbackSite.id,
    sites,
    assets: await importAssets(zip, result),
    storyMaps: storyMapsJson
      ? parseStoryMaps(storyMapsJson, pageIds, pageSites, result, fallbackSite)
      : migrateLegacyFlowcharts(legacyFlowchartJson, pageIds, pageSites, result, fallbackSite),
    searchRules: parseSearchRules(searchJson, pageIds, result),
    conditions: parseConditions(conditionsJson, pageIds, result),
    messengerThreads: parseMessengerThreads(messengerJson),
    storyState: parseStoryState(storyStateJson),
    importedScripts: await importScripts(zip, result),
    snapshots: []
  };

  result.project = project;
  result.ok = result.errors.length === 0;
  return result;
}

export async function importProjectSourceZip(input: Blob | ArrayBuffer): Promise<StudioProject> {
  const result = await dryRunImportProjectSourceZip(input);
  if (!result.ok || !result.project) {
    throw new Error(result.errors.map((item) => item.message).join('; ') || 'Source Zip import failed.');
  }
  return result.project;
}
