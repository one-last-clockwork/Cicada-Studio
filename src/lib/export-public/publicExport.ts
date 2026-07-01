import JSZip from 'jszip';
import type {
  MessengerNode,
  PublicMessengerNode,
  PublicRuntimePayload,
  SearchRule,
  StudioPage,
  StudioProject,
  StudioSite,
  StudioTheme
} from '../../types/project';
import { PUBLIC_EXPORT_LICENSE_FILENAME, PUBLIC_EXPORT_LICENSE_NOTICE } from '../../public-runtime/outputLicense';
import { PUBLIC_RUNTIME_JS } from '../../public-runtime/runtimeAsset';
import { encryptText } from '../crypto/browserCrypto';
import { uniqueNormalized } from '../crypto/normalization';
import { sanitizeHtml } from '../html/sanitize';
import { normalizeAssetPath, normalizePublicPath, safeSlug } from '../path-safety/pathSafety';
import { dataUrlToBytes } from '../zip/blob';
import {
  GENERIC_FAILURE,
  injectPublicWidgets,
  renderPublicPageDocument,
  renderRevealWidget,
  renderUnlockWidget
} from './renderPublicHtml';

export interface PublicExportOptions {
  siteId?: string;
}

interface PublicPageBuild {
  site: StudioSite;
  page: StudioPage;
  path: string;
  theme?: StudioTheme;
}

interface BuildContext {
  project: StudioProject;
  pages: PublicPageBuild[];
  pagePaths: Map<string, string>;
  unlockPaths: Map<string, string>;
  payload: PublicRuntimePayload;
}

function orderedSites(project: StudioProject, siteId?: string): StudioSite[] {
  if (siteId) {
    return project.sites.filter((site) => site.id === siteId);
  }
  const primary = project.sites.find((site) => site.id === project.primarySiteId) ?? project.sites[0];
  return [primary, ...project.sites.filter((site) => site.id !== primary.id)];
}

function sitePrefix(project: StudioProject, site: StudioSite, siteOnly: boolean): string {
  if (siteOnly || site.id === project.primarySiteId) {
    return '';
  }
  return (site.pathPrefix || `sites/${safeSlug(site.slug, site.id)}`).replace(/^\/+|\/+$/g, '');
}

function themeForPage(site: StudioSite, page: StudioPage): StudioTheme | undefined {
  return site.themes.find((theme) => theme.id === page.themeId) ?? site.themes[0];
}

function publishedPages(project: StudioProject, options: PublicExportOptions = {}): PublicPageBuild[] {
  const usedPaths = new Set<string>();
  const siteOnly = Boolean(options.siteId);
  return orderedSites(project, options.siteId).flatMap((site) =>
    site.pages
      .filter((page) => page.status === 'published')
      .sort((a, b) => a.pageNumber - b.pageNumber || a.title.localeCompare(b.title))
      .map((page) => {
        const fallback = page.pageNumber === 1 ? 'index.html' : `${page.slug || 'page'}.html`;
        const localPath = normalizePublicPath(page.path, fallback);
        const prefix = sitePrefix(project, site, siteOnly);
        const fullPath = prefix ? `${prefix}/${localPath}` : localPath;
        return {
          site,
          page,
          path: makeUniquePath(fullPath, usedPaths),
          theme: themeForPage(site, page)
        };
      })
  );
}

function normalizedTerms(rule: SearchRule): string[] {
  return uniqueNormalized([...rule.terms, ...rule.aliases]);
}

async function addRevealEntries(context: BuildContext): Promise<Map<string, string>> {
  const publicIds = new Map<string, string>();
  let index = 1;
  for (const { site, page } of context.pages) {
    for (const reveal of page.revealBlocks) {
      const publicId = `r${index}`;
      index += 1;
      publicIds.set(reveal.id, publicId);
      for (const answer of uniqueNormalized(reveal.answerAliases)) {
        context.payload.reveal.push({
          id: publicId,
          prompt: reveal.prompt,
          failureMessage: GENERIC_FAILURE,
          eventId: `revealSolved:${site.id}:${page.id}:${reveal.id}`,
          ...(await encryptText(answer, sanitizeHtml(reveal.secretHtml)))
        });
      }
    }
  }
  return publicIds;
}

async function addUnlockEntries(context: BuildContext): Promise<Map<string, string>> {
  const publicIds = new Map<string, string>();
  let index = 1;
  for (const { site, page, path: pagePath } of context.pages) {
    for (const unlock of page.unlockPages) {
      const publicId = `u${index}`;
      index += 1;
      publicIds.set(unlock.id, publicId);
      const basePath = pagePath.includes('/') ? pagePath.slice(0, pagePath.lastIndexOf('/') + 1) : '';
      for (const answer of uniqueNormalized(unlock.answerAliases)) {
        context.payload.unlock.push({
          id: publicId,
          path: context.unlockPaths.get(unlock.id) ?? normalizePublicPath(`${basePath}${unlock.path}`, `unlock-${index}.html`),
          prompt: unlock.prompt,
          failureMessage: GENERIC_FAILURE,
          eventId: `unlockSolved:${site.id}:${page.id}:${unlock.id}`,
          ...(await encryptText(answer, sanitizeHtml(unlock.payloadHtml)))
        });
      }
    }
  }
  return publicIds;
}

async function addSearchEntries(context: BuildContext): Promise<void> {
  let index = 1;
  for (const rule of context.project.searchRules) {
    const targetPath = context.pagePaths.get(rule.targetPageId);
    const target = context.pages.find((item) => item.page.id === rule.targetPageId);
    if (!targetPath || !target) {
      continue;
    }
    for (const term of normalizedTerms(rule)) {
      context.payload.search.push({
        id: `s${index}`,
        mode: rule.mode,
        hint: rule.hint,
        failureMessage: GENERIC_FAILURE,
        eventId: `searchSolved:${rule.id}`,
        ...(await encryptText(term, JSON.stringify({ path: targetPath, title: target.page.title })))
      });
      index += 1;
    }
  }
}

async function publicMessengerNode(node: MessengerNode): Promise<PublicMessengerNode> {
  const protectedEntries = [];
  if (node.protectedMessage) {
    for (const answer of uniqueNormalized(node.protectedMessage.answerAliases)) {
      protectedEntries.push({
        prompt: node.protectedMessage.prompt,
        failureMessage: node.protectedMessage.failureMessage,
        ...(await encryptText(answer, sanitizeHtml(node.protectedMessage.secretBody)))
      });
    }
  }
  const matchers = [];
  for (const matcher of node.matchers) {
    for (const term of uniqueNormalized(matcher.terms)) {
      matchers.push({
        id: matcher.id,
        label: matcher.label,
        mode: matcher.mode,
        ...(await encryptText(term, JSON.stringify({ targetNodeId: matcher.targetNodeId, effects: matcher.effects })))
      });
    }
  }
  return {
    id: node.id,
    senderId: node.senderId,
    kind: node.kind,
    body: node.body,
    protectedEntries: protectedEntries.length ? protectedEntries : undefined,
    choices: node.choices,
    matchers,
    delayMs: node.delayMs,
    effects: node.effects
  };
}

function eventIdsForSourceNode(storyMap: StudioProject['storyMaps'][number], edge: StudioProject['storyMaps'][number]['edges'][number]): string[] {
  const node = storyMap.nodes.find((item) => item.id === edge.source);
  if (!node) {
    return [];
  }
  const entity = node.linkedEntity;
  if (node.pageId && node.siteId) {
    return [`pageVisited:${node.siteId}:${node.pageId}`];
  }
  if (entity?.kind === 'page' && entity.siteId && entity.pageId) {
    return [`pageVisited:${entity.siteId}:${entity.pageId}`];
  }
  if (entity?.kind === 'reveal' && entity.siteId && entity.pageId && entity.id) {
    return [`revealSolved:${entity.siteId}:${entity.pageId}:${entity.id}`];
  }
  if (entity?.kind === 'unlock' && entity.siteId && entity.pageId && entity.id) {
    return [`unlockSolved:${entity.siteId}:${entity.pageId}:${entity.id}`];
  }
  if (entity?.kind === 'search' && entity.id) {
    return [`searchSolved:${entity.id}`];
  }
  if (entity?.kind === 'messenger_node' && entity.threadId && entity.nodeId) {
    return [`messengerNodeDelivered:${entity.threadId}:${entity.nodeId}`];
  }
  return [];
}

async function createPayload(project: StudioProject, pages: PublicPageBuild[], pagePaths: Map<string, string>): Promise<PublicRuntimePayload> {
  const payloadSites = [...new Map(pages.map(({ site }) => [site.id, site])).values()];
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    storyNamespace: project.storyNamespace,
    genericFailure: GENERIC_FAILURE,
    sites: payloadSites.map((site) => ({
      id: site.id,
      name: site.name,
      slug: site.slug,
      pathPrefix: sitePrefix(project, site, false),
      pages: pages
        .filter((item) => item.site.id === site.id)
        .map(({ page }) => ({
          siteId: site.id,
          pageId: page.id,
          title: page.title,
          path: pagePaths.get(page.id) ?? normalizePublicPath(page.path, `${page.slug}.html`),
          pageNumber: page.pageNumber
        }))
    })),
    pages: pages.map(({ site, page }) => ({
      siteId: site.id,
      pageId: page.id,
      title: page.title,
      path: pagePaths.get(page.id) ?? normalizePublicPath(page.path, `${page.slug}.html`),
      pageNumber: page.pageNumber
    })),
    storyEffects: project.storyMaps.flatMap((storyMap) =>
      storyMap.edges
        .filter((edge) => edge.trigger && edge.effects.length)
        .map((edge) => ({
          trigger: edge.trigger!,
          prerequisiteMode: edge.prerequisiteMode,
          requiredEventIds: edge.prerequisiteMode === 'strict' ? eventIdsForSourceNode(storyMap, edge) : undefined,
          effects: edge.effects
        }))
    ),
    messengerThreads: await Promise.all(
      project.messengerThreads.map(async (thread) => ({
        id: thread.id,
        title: thread.title,
        participants: thread.participants,
        nodes: await Promise.all(thread.nodes.map(publicMessengerNode))
      }))
    ),
    reveal: [],
    unlock: [],
    search: []
  };
}

function makeUniquePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const [base, extension = 'html'] = path.split(/\.([^.]+)$/);
  let index = 2;
  while (used.has(`${base}-${index}.${extension}`)) {
    index += 1;
  }
  const unique = `${base}-${index}.${extension}`;
  used.add(unique);
  return unique;
}

function referencedPublicAssetNames(pages: PublicPageBuild[]): Set<string> {
  const referenced = new Set<string>();
  const publicBodies = pages.map(({ page }) => page.bodyHtml).join('\n');
  const pattern = /\b(?:src|href)=(["'])(?:\.\.\/)*assets\/([^"']+)\1/gi;
  for (const match of publicBodies.matchAll(pattern)) {
    referenced.add(normalizeAssetPath(match[2] ?? '').replace(/^assets\//, ''));
  }
  return referenced;
}

function relativeRootPrefix(path: string): string {
  const depth = Math.max(0, path.split('/').length - 1);
  return '../'.repeat(depth);
}

function rewriteAssetReferencesForPath(bodyHtml: string, path: string): string {
  const prefix = relativeRootPrefix(path);
  if (!prefix) {
    return bodyHtml;
  }
  return bodyHtml.replace(/\b(src|href)=(["'])assets\//gi, `$1=$2${prefix}assets/`);
}

export async function buildPublicExportZip(project: StudioProject, options: PublicExportOptions = {}): Promise<Blob> {
  const zip = new JSZip();
  const pages = publishedPages(project, options);
  const pagePaths = new Map<string, string>();
  for (const item of pages) {
    pagePaths.set(item.page.id, item.path);
  }
  const unlockPaths = new Map<string, string>();
  const usedPaths = new Set(pages.map((item) => item.path));
  for (const { page, path } of pages) {
    const basePath = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    for (const unlock of page.unlockPages) {
      unlockPaths.set(unlock.id, makeUniquePath(normalizePublicPath(`${basePath}${unlock.path}`, `${unlock.id}.html`), usedPaths));
    }
  }

  const payload = await createPayload(project, pages, pagePaths);
  const context: BuildContext = { project, pages, pagePaths, unlockPaths, payload };
  const revealIds = await addRevealEntries(context);
  const unlockIds = await addUnlockEntries(context);
  await addSearchEntries(context);

  const publicAssetNames = referencedPublicAssetNames(pages);
  for (const asset of project.assets) {
    const normalizedName = normalizeAssetPath(asset.safeName || asset.name).replace(/^assets\//, '');
    if (publicAssetNames.has(normalizedName)) {
      zip.file(normalizeAssetPath(normalizedName), dataUrlToBytes(asset.dataUrl));
    }
  }

  for (const { page, path, theme } of pages) {
    const revealWidgets = page.revealBlocks.map((reveal) =>
      renderRevealWidget(revealIds.get(reveal.id) ?? '', reveal.prompt || 'Answer')
    );
    const body = rewriteAssetReferencesForPath(
      injectPublicWidgets(page.bodyHtml, revealWidgets, project.searchRules.length > 0, page.pageNumber),
      path
    );
    const runtimePath = `${relativeRootPrefix(path)}runtime.js`;
    zip.file(path, renderPublicPageDocument(project, page, theme, body, context.payload, runtimePath));

    for (const unlock of page.unlockPages) {
      const publicId = unlockIds.get(unlock.id);
      if (!publicId) {
        continue;
      }
      const unlockPath = unlockPaths.get(unlock.id) ?? normalizePublicPath(unlock.path, `${publicId}.html`);
      zip.file(
        unlockPath,
        renderPublicPageDocument(
          project,
          page,
          theme,
          renderUnlockWidget(publicId, unlock),
          context.payload,
          `${relativeRootPrefix(unlockPath)}runtime.js`
        )
      );
    }
  }

  zip.file('runtime.js', PUBLIC_RUNTIME_JS);
  zip.file(PUBLIC_EXPORT_LICENSE_FILENAME, PUBLIC_EXPORT_LICENSE_NOTICE);
  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return new Blob([buffer], { type: 'application/zip' });
}
