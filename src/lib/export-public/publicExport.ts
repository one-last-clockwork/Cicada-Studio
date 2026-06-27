import JSZip from 'jszip';
import type {
  PublicRuntimePayload,
  SearchRule,
  StudioPage,
  StudioProject
} from '../../types/project';
import { PUBLIC_RUNTIME_JS } from '../../public-runtime/runtimeAsset';
import { encryptText } from '../crypto/browserCrypto';
import { uniqueNormalized } from '../crypto/normalization';
import { sanitizeHtml } from '../html/sanitize';
import { normalizeAssetPath, normalizePublicPath } from '../path-safety/pathSafety';
import { dataUrlToBytes } from '../zip/blob';
import {
  GENERIC_FAILURE,
  injectPublicWidgets,
  renderPublicPageDocument,
  renderRevealWidget,
  renderUnlockWidget
} from './renderPublicHtml';

interface BuildContext {
  project: StudioProject;
  pagePaths: Map<string, string>;
  unlockPaths: Map<string, string>;
  payload: PublicRuntimePayload;
}

function publishedPages(project: StudioProject): StudioPage[] {
  return project.pages
    .filter((page) => page.status === 'published')
    .sort((a, b) => a.pageNumber - b.pageNumber || a.title.localeCompare(b.title));
}

function normalizedTerms(rule: SearchRule): string[] {
  return uniqueNormalized([...rule.terms, ...rule.aliases]);
}

async function addRevealEntries(context: BuildContext): Promise<Map<string, string>> {
  const publicIds = new Map<string, string>();
  let index = 1;
  for (const page of publishedPages(context.project)) {
    for (const reveal of page.revealBlocks) {
      const publicId = `r${index}`;
      index += 1;
      publicIds.set(reveal.id, publicId);
      for (const answer of uniqueNormalized(reveal.answerAliases)) {
        context.payload.reveal.push({
          id: publicId,
          prompt: reveal.prompt,
          failureMessage: GENERIC_FAILURE,
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
  for (const page of publishedPages(context.project)) {
    for (const unlock of page.unlockPages) {
      const publicId = `u${index}`;
      index += 1;
      publicIds.set(unlock.id, publicId);
      for (const answer of uniqueNormalized(unlock.answerAliases)) {
        context.payload.unlock.push({
          id: publicId,
          path: context.unlockPaths.get(unlock.id) ?? normalizePublicPath(unlock.path, `unlock-${index}.html`),
          prompt: unlock.prompt,
          failureMessage: GENERIC_FAILURE,
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
    const targetPage = context.project.pages.find((page) => page.id === rule.targetPageId);
    if (!targetPath || !targetPage) {
      continue;
    }
    for (const term of normalizedTerms(rule)) {
      context.payload.search.push({
        id: `s${index}`,
        mode: rule.mode,
        hint: rule.hint,
        failureMessage: GENERIC_FAILURE,
        ...(await encryptText(term, JSON.stringify({ path: targetPath, title: targetPage.title })))
      });
      index += 1;
    }
  }
}

function createPayload(project: StudioProject, pagePaths: Map<string, string>): PublicRuntimePayload {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    genericFailure: GENERIC_FAILURE,
    pages: publishedPages(project).map((page) => ({
      title: page.title,
      path: pagePaths.get(page.id) ?? normalizePublicPath(page.path, `${page.slug}.html`),
      pageNumber: page.pageNumber
    })),
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

function referencedPublicAssetNames(project: StudioProject): Set<string> {
  const referenced = new Set<string>();
  const publicBodies = publishedPages(project).map((page) => page.bodyHtml).join('\n');
  for (const asset of project.assets) {
    const safeName = asset.safeName || asset.name;
    const normalized = normalizeAssetPath(safeName).replace(/^assets\//, '');
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:src|href)=["'][^"']*assets/${escaped}["']`, 'i');
    if (pattern.test(publicBodies)) {
      referenced.add(normalized);
    }
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

export async function buildPublicExportZip(project: StudioProject): Promise<Blob> {
  const zip = new JSZip();
  const usedPaths = new Set<string>();
  const pagePaths = new Map<string, string>();
  for (const page of publishedPages(project)) {
    const fallback = page.pageNumber === 1 ? 'index.html' : `${page.slug || 'page'}.html`;
    pagePaths.set(page.id, makeUniquePath(normalizePublicPath(page.path, fallback), usedPaths));
  }
  const unlockPaths = new Map<string, string>();
  for (const page of publishedPages(project)) {
    for (const unlock of page.unlockPages) {
      unlockPaths.set(unlock.id, makeUniquePath(normalizePublicPath(unlock.path, `${unlock.id}.html`), usedPaths));
    }
  }

  const context: BuildContext = {
    project,
    pagePaths,
    unlockPaths,
    payload: createPayload(project, pagePaths)
  };
  const revealIds = await addRevealEntries(context);
  const unlockIds = await addUnlockEntries(context);
  await addSearchEntries(context);

  const publicAssetNames = referencedPublicAssetNames(project);
  for (const asset of project.assets) {
    const normalizedName = normalizeAssetPath(asset.safeName || asset.name).replace(/^assets\//, '');
    if (publicAssetNames.has(normalizedName)) {
      zip.file(normalizeAssetPath(normalizedName), dataUrlToBytes(asset.dataUrl));
    }
  }

  for (const page of publishedPages(project)) {
    const revealWidgets = page.revealBlocks.map((reveal) =>
      renderRevealWidget(revealIds.get(reveal.id) ?? '', reveal.prompt || 'Answer')
    );
    const path = pagePaths.get(page.id) ?? 'index.html';
    const body = rewriteAssetReferencesForPath(
      injectPublicWidgets(page.bodyHtml, revealWidgets, project.searchRules.length > 0, page.pageNumber),
      path
    );
    const runtimePath = `${relativeRootPrefix(path)}runtime.js`;
    zip.file(path, renderPublicPageDocument(project, page, body, context.payload, runtimePath));

    for (const unlock of page.unlockPages) {
      const publicId = unlockIds.get(unlock.id);
      if (!publicId) {
        continue;
      }
      const unlockPath = unlockPaths.get(unlock.id) ?? normalizePublicPath(unlock.path, `${publicId}.html`);
      zip.file(unlockPath, renderPublicPageDocument(
        project,
        page,
        renderUnlockWidget(publicId, unlock),
        context.payload,
        `${relativeRootPrefix(unlockPath)}runtime.js`
      ));
    }
  }

  zip.file('runtime.js', PUBLIC_RUNTIME_JS);
  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return new Blob([buffer], { type: 'application/zip' });
}
