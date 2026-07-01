import { createContext, useContext, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Copy,
  Download,
  FilePlus,
  FileText,
  FolderOpen,
  GitBranch,
  Globe2,
  Image,
  Info,
  KeyRound,
  Languages,
  LayoutDashboard,
  LockKeyhole,
  Maximize2,
  MessageCircle,
  MoveDown,
  MoveUp,
  Palette,
  Plus,
  RotateCcw,
  Route,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  type LucideIcon
} from 'lucide-react';
import { type StudioTab } from './app/routes';
import { isLanguage, LANGUAGE_STORAGE_KEY, UI_TEXT, type Language, type UiText } from './app/i18n';
import { exportProjectBackupZip, importProjectBackupZip } from './features/backup/backupZip';
import { dryRunImportProjectSourceZip, exportProjectSourceZip } from './features/backup/sourceZip';
import type { SourceZipDryRunResult, SourceZipIssue } from './features/backup/sourceZipTypes';
import { importYachoProjectZip } from './features/import-yacho/importYacho';
import { getPreviewHtml, getPreviewSandbox } from './features/preview/previewPolicy';
import { buildPublicExportZip } from './lib/export-public/publicExport';
import { checkPublicExportZip } from './lib/export-public/checkLeaks';
import { escapeHtml, renderThemeDocument } from './lib/html/sanitize';
import { createDefaultSite, createId, createPage, createProject, nowIso, touchProject } from './lib/projects/createProject';
import { allPageRefs, allPages, findPageRef, primarySite, siteById, updatePageInProject, updateSite, updateThemeInProject } from './lib/projects/projectAccess';
import { deleteProject as deleteStoredProject, listProjects, saveProject } from './lib/db/projectsDb';
import { normalizeAssetPath, normalizePublicPath, safeSlug } from './lib/path-safety/pathSafety';
import { downloadBlob } from './lib/zip/blob';
import { splitTermList } from './lib/crypto/normalization';
import type {
  MatchMode,
  MessengerNode,
  MessengerThread,
  RevealBlock,
  SearchRule,
  StoryEffect,
  StoryMapEdge,
  StoryMapNode,
  StoryTrigger,
  StudioAsset,
  StudioCondition,
  StudioPage,
  StudioProject,
  StudioSite,
  StudioStoryMap,
  StudioTheme,
  UnlockPage
} from './types/project';

const AUTOSAVE_DELAY_MS = 650;
const PREVIEW_MIN_WIDTH = 240;
const PREVIEW_MAX_WIDTH = 2400;
const PREVIEW_MIN_HEIGHT = 240;
const PREVIEW_MAX_HEIGHT = 2000;
const SOURCE_CODE_URL = 'https://github.com/one-last-clockwork/Cicada-Studio';
const OUTPUT_LICENSE_URL = `${SOURCE_CODE_URL}/blob/main/LICENCE-OUTPUT.md`;

interface ConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
}

type SourceImportMode = 'new' | 'overwrite';

interface SourceImportReview {
  fileName: string;
  result: SourceZipDryRunResult;
  mode: SourceImportMode;
}

const I18nContext = createContext<UiText>(UI_TEXT.ja);

function useUiText(): UiText {
  return useContext(I18nContext);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result?.toString() ?? '');
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

function cloneProjectForSnapshot(project: StudioProject): StudioProject {
  return { ...project, snapshots: [] };
}

function uniquePageSlug(base: string, pages: StudioPage[], fallback: string): string {
  const used = new Set(pages.map((page) => page.slug));
  const normalized = safeSlug(base, fallback);
  let candidate = normalized;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${normalized}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function uniquePagePath(base: string, pages: StudioPage[], fallback: string): string {
  const used = new Set(pages.map((page) => page.path));
  const normalized = normalizePublicPath(base, fallback);
  let candidate = normalized;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = normalized.replace(/\.html$/i, `-${suffix}.html`);
    suffix += 1;
  }
  return candidate;
}

function normalizeSitePathPrefix(value: string, fallback: string): string {
  const raw = value.replace(/^\/+|\/+$/g, '');
  if (!raw) {
    return '';
  }
  return normalizePublicPath(`${raw}/index.html`, `${fallback}/index.html`).replace(/\/?index\.html$/i, '');
}

function parseList(value: string): string[] {
  return splitTermList(value);
}

function textareaList(values: string[]): string {
  return values.join('\n');
}

interface PreviewSize {
  width: number;
  height: number;
}

interface PreviewResizeDrag {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
}

function clampPreviewDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.min(Math.max(value, min), max));
}

function ResizablePreviewFrame(props: {
  title: string;
  srcDoc: string;
  sandbox: string;
  initialWidth: number;
  initialHeight: number;
}): JSX.Element {
  const text = useUiText();
  const initialSize = useMemo<PreviewSize>(
    () => ({
      width: clampPreviewDimension(props.initialWidth, PREVIEW_MIN_WIDTH, PREVIEW_MAX_WIDTH),
      height: clampPreviewDimension(props.initialHeight, PREVIEW_MIN_HEIGHT, PREVIEW_MAX_HEIGHT)
    }),
    [props.initialHeight, props.initialWidth]
  );
  const [size, setSize] = useState<PreviewSize>(initialSize);
  const [autoWidth, setAutoWidth] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<PreviewResizeDrag | null>(null);

  function getAvailableWidth(): number {
    return clampPreviewDimension((scrollRef.current?.clientWidth ?? props.initialWidth) - 4, PREVIEW_MIN_WIDTH, PREVIEW_MAX_WIDTH);
  }

  function clampPreviewWidth(value: number): number {
    return clampPreviewDimension(value, PREVIEW_MIN_WIDTH, getAvailableWidth());
  }

  function updateSize(patch: Partial<PreviewSize>, options: { widthMode?: 'auto' | 'manual' } = {}): void {
    if (patch.width !== undefined && options.widthMode !== 'auto') {
      setAutoWidth(false);
    }
    setSize((current) => {
      const width = patch.width === undefined ? current.width : clampPreviewWidth(patch.width);
      const height = clampPreviewDimension(patch.height ?? current.height, PREVIEW_MIN_HEIGHT, PREVIEW_MAX_HEIGHT);
      return current.width === width && current.height === height ? current : { width, height };
    });
  }

  function resetSize(): void {
    setAutoWidth(true);
    setSize({
      width: getAvailableWidth(),
      height: initialSize.height
    });
  }

  useEffect(() => {
    if (!scrollRef.current) return;
    const target = scrollRef.current;
    const syncWidthToContainer = () => {
      const availableWidth = clampPreviewDimension(target.clientWidth - 4, PREVIEW_MIN_WIDTH, PREVIEW_MAX_WIDTH);
      setSize((current) => {
        const width = autoWidth || current.width > availableWidth ? availableWidth : current.width;
        return current.width === width ? current : { ...current, width };
      });
    };
    syncWidthToContainer();

    const observer = new ResizeObserver(syncWidthToContainer);
    observer.observe(target);
    return () => observer.disconnect();
  }, [autoWidth, props.initialWidth]);

  function startResize(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    setAutoWidth(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: size.width,
      height: size.height
    };
  }

  function moveResize(event: PointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateSize({
      width: drag.width + event.clientX - drag.startX,
      height: drag.height + event.clientY - drag.startY
    });
  }

  function endResize(event: PointerEvent<HTMLButtonElement>): void {
    if (dragRef.current?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  return (
    <>
      <div className="preview-resize-controls">
        <label className="preview-size-field">
          <span>{text.previewWidth}</span>
          <input
            aria-label={text.previewWidth}
            type="number"
            min={PREVIEW_MIN_WIDTH}
            max={PREVIEW_MAX_WIDTH}
            value={size.width}
            onChange={(event) => updateSize({ width: Number(event.target.value) })}
          />
          <span>px</span>
        </label>
        <label className="preview-size-field">
          <span>{text.previewHeight}</span>
          <input
            aria-label={text.previewHeight}
            type="number"
            min={PREVIEW_MIN_HEIGHT}
            max={PREVIEW_MAX_HEIGHT}
            value={size.height}
            onChange={(event) => updateSize({ height: Number(event.target.value) })}
          />
          <span>px</span>
        </label>
        <button type="button" className="icon-button" title={text.resetPreviewSize} aria-label={text.resetPreviewSize} onClick={resetSize}>
          <RotateCcw size={16} />
        </button>
      </div>
      <div ref={scrollRef} className="preview-frame-scroll">
        <div className="preview-frame-shell" style={{ width: `${size.width}px`, height: `${size.height}px` }}>
          <iframe title={props.title} sandbox={props.sandbox} srcDoc={props.srcDoc} />
          <button
            type="button"
            className="preview-resize-handle"
            title={text.resizePreview}
            aria-label={text.resizePreview}
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </>
  );
}

export default function App(): JSX.Element {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : 'ja';
  });
  const text = UI_TEXT[language];
  const [project, setProject] = useState<StudioProject>(() => createProject(UI_TEXT.ja.defaultProjectName));
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedTab, setSelectedTab] = useState<StudioTab>('intro');
  const [knownProjects, setKnownProjects] = useState<StudioProject[]>([]);
  const [loadState, setLoadState] = useState<string>(UI_TEXT.ja.loading);
  const [saveState, setSaveState] = useState<string>(UI_TEXT.ja.notSaved);
  const [exportState, setExportState] = useState<string>('');
  const [sourceImportReview, setSourceImportReview] = useState<SourceImportReview | null>(null);
  const [projectsChangedSinceBackup, setProjectsChangedSinceBackup] = useState<Record<string, boolean>>({});
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
  const firstSave = useRef(true);
  const confirmationResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const showProjectTopbar = selectedTab !== 'intro' && selectedTab !== 'projects';
  const hasChangesSinceBackup = useMemo(() => Object.values(projectsChangedSinceBackup).some(Boolean), [projectsChangedSinceBackup]);
  const currentProjectChangedSinceBackup = Boolean(projectsChangedSinceBackup[project.id]);
  const changedSinceBackupProjectCount = useMemo(
    () => Object.values(projectsChangedSinceBackup).filter(Boolean).length,
    [projectsChangedSinceBackup]
  );
  const activeSite = useMemo(() => siteById(project, selectedSiteId || project.primarySiteId), [project, selectedSiteId]);
  const activePages = activeSite.pages;
  const activeThemes = activeSite.themes;
  const projectPageRefs = useMemo(() => allPageRefs(project), [project]);
  const projectPages = useMemo(() => projectPageRefs.map((ref) => ref.page), [projectPageRefs]);

  useEffect(() => {
    let alive = true;
    listProjects()
      .then(async (projects) => {
        if (!alive) return;
        const active = projects[0] ?? createProject(UI_TEXT.ja.defaultProjectName);
        setProject(active);
        setKnownProjects(projects.length ? projects : [active]);
        setSelectedSiteId(primarySite(active).id);
        setSelectedPageId(primarySite(active).pages[0]?.id ?? '');
        if (!projects.length) {
          await saveProject(active);
        }
        setLoadState(UI_TEXT.ja.loaded(active.name));
      })
      .catch((error: unknown) => setLoadState(error instanceof Error ? error.message : UI_TEXT.ja.failedLoad));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!hasChangesSinceBackup) {
      return undefined;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = text.backupBeforeCloseWarning;
      return text.backupBeforeCloseWarning;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasChangesSinceBackup, text.backupBeforeCloseWarning]);

  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    setSaveState(text.autosavePending);
    const timer = window.setTimeout(() => {
      saveProject(project)
        .then(() => setSaveState(text.autosaved(new Date().toLocaleTimeString())))
        .then(() => setKnownProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]))
        .catch((error: unknown) => setSaveState(error instanceof Error ? error.message : text.autosaveFailed));
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [project, text]);

  const selectedPage = useMemo(
    () => activePages.find((page) => page.id === selectedPageId) ?? activePages[0],
    [activePages, selectedPageId]
  );

  useEffect(() => {
    if (!project.sites.some((site) => site.id === activeSite.id)) {
      setSelectedSiteId(primarySite(project).id);
      return;
    }
    if (!activePages.some((page) => page.id === selectedPageId)) {
      setSelectedPageId(activePages[0]?.id ?? '');
    }
  }, [activePages, activeSite.id, project, selectedPageId]);

  function updateProject(updater: (draft: StudioProject) => StudioProject): void {
    markProjectChangedSinceBackup(project.id);
    setProject((current) => touchProject(updater(current)));
  }

  function markProjectChangedSinceBackup(projectId: string): void {
    setProjectsChangedSinceBackup((current) => (current[projectId] ? current : { ...current, [projectId]: true }));
  }

  function clearProjectChangedSinceBackup(projectId: string): void {
    setProjectsChangedSinceBackup((current) => {
      if (!current[projectId]) {
        return current;
      }
      const next = { ...current };
      delete next[projectId];
      return next;
    });
  }

  function updatePage(pageId: string, updater: (page: StudioPage) => StudioPage): void {
    updateProject((current) => updatePageInProject(current, pageId, updater));
  }

  function requestConfirmation(request: ConfirmationRequest): Promise<boolean> {
    if (confirmationResolver.current) {
      confirmationResolver.current(false);
    }
    return new Promise((resolve) => {
      confirmationResolver.current = resolve;
      setConfirmationRequest(request);
    });
  }

  function resolveConfirmation(confirmed: boolean): void {
    confirmationResolver.current?.(confirmed);
    confirmationResolver.current = null;
    setConfirmationRequest(null);
  }

  function createNewProject(targetTab: StudioTab = 'dashboard'): void {
    const next = createProject(text.newProjectName(knownProjects.length + 1));
    setProject(next);
    setKnownProjects((projects) => [next, ...projects]);
    markProjectChangedSinceBackup(next.id);
    setSelectedSiteId(primarySite(next).id);
    setSelectedPageId(primarySite(next).pages[0]?.id ?? '');
    setSelectedTab(targetTab);
    setSaveState(text.newProjectCreated);
  }

  async function switchProject(projectId: string): Promise<void> {
    if (projectId === project.id) {
      return;
    }
    try {
      await saveProject(project);
      const stored = await listProjects();
      const mergedProjects = [...stored, ...knownProjects.filter((item) => !stored.some((storedProject) => storedProject.id === item.id))];
      const next = mergedProjects.find((item) => item.id === projectId);
      if (!next) {
        return;
      }
      setKnownProjects(mergedProjects);
      setProject(next);
      setSelectedSiteId(primarySite(next).id);
      setSelectedPageId(primarySite(next).pages[0]?.id ?? '');
      setSaveState(text.loaded(next.name));
    } catch (error: unknown) {
      setSaveState(error instanceof Error ? error.message : text.autosaveFailed);
    }
  }

  async function deleteCurrentProject(): Promise<void> {
    const confirmed = await requestConfirmation({
      title: text.deleteProject,
      message: text.deleteProjectConfirm(project.name),
      confirmLabel: text.deleteProject,
      tone: 'danger'
    });
    if (!confirmed) {
      return;
    }
    const deletedName = project.name;
    try {
      await deleteStoredProject(project.id);
      const remaining = await listProjects();
      const next = remaining[0] ?? createProject(text.defaultProjectName);
      if (!remaining.length) {
        await saveProject(next);
      }
      setKnownProjects(remaining.length ? remaining : [next]);
      clearProjectChangedSinceBackup(project.id);
      firstSave.current = true;
      setProject(next);
      setSelectedSiteId(primarySite(next).id);
      setSelectedPageId(primarySite(next).pages[0]?.id ?? '');
      setLoadState(text.loaded(next.name));
      setSaveState(text.deletedProject(deletedName));
    } catch (error: unknown) {
      setSaveState(error instanceof Error ? error.message : text.autosaveFailed);
    }
  }

  function addPage(): void {
    const slug = uniquePageSlug(`page-${activePages.length + 1}`, activePages, `page-${activePages.length + 1}`);
    const page = createPage({
      title: text.newPageTitle(activePages.length + 1),
      slug,
      path: uniquePagePath(`${slug}.html`, activePages, `${slug}.html`),
      pageNumber: activePages.length + 1,
      themeId: activeThemes[0]?.id
    });
    updateProject((current) => updateSite(current, activeSite.id, (site) => ({ ...site, pages: [...site.pages, page] })));
    setSelectedPageId(page.id);
    setSelectedTab('editor');
  }

  async function duplicatePage(page: StudioPage): Promise<void> {
    const confirmed = await requestConfirmation({
      title: text.duplicate,
      message: text.duplicatePageConfirm(page.title),
      confirmLabel: text.duplicate
    });
    if (!confirmed) {
      return;
    }
    const slug = uniquePageSlug(`${page.slug}-copy`, activePages, 'copy');
    const copy = {
      ...page,
      id: createId('page'),
      title: `${page.title} ${text.duplicateSuffix}`,
      slug,
      path: uniquePagePath(`${slug}.html`, activePages, 'copy.html'),
      pageNumber: activePages.length + 1
    };
    updateProject((current) => updateSite(current, activeSite.id, (site) => ({ ...site, pages: [...site.pages, copy] })));
    setSelectedPageId(copy.id);
  }

  async function deletePage(pageId: string): Promise<void> {
    if (activePages.length === 1) {
      return;
    }
    const targetPage = activePages.find((page) => page.id === pageId);
    if (!targetPage) {
      return;
    }
    const confirmed = await requestConfirmation({
      title: text.delete,
      message: text.deletePageConfirm(targetPage.title),
      confirmLabel: text.delete,
      tone: 'danger'
    });
    if (!confirmed) {
      return;
    }
    updateProject((current) => {
      const withoutPage = updateSite(current, activeSite.id, (site) => ({
        ...site,
        pages: site.pages.filter((page) => page.id !== pageId).map((page, index) => ({ ...page, pageNumber: index + 1 }))
      }));
      return {
        ...withoutPage,
        searchRules: current.searchRules.filter((rule) => rule.targetPageId !== pageId),
        conditions: current.conditions.filter((condition) => condition.sourcePageId !== pageId && condition.targetPageId !== pageId),
        storyMaps: current.storyMaps.map((storyMap) => ({
          ...storyMap,
          nodes: storyMap.nodes.map((node) =>
            node.pageId === pageId ? { ...node, pageId: undefined, linkedEntity: undefined, type: node.type === 'page' ? 'discovery' : node.type } : node
          )
        }))
      };
    });
    setSelectedPageId(activePages.find((page) => page.id !== pageId)?.id ?? '');
  }

  function movePage(pageId: string, direction: -1 | 1): void {
    updateProject((current) => {
      const site = siteById(current, activeSite.id);
      const pages = [...site.pages];
      const index = pages.findIndex((page) => page.id === pageId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= pages.length) {
        return current;
      }
      [pages[index], pages[next]] = [pages[next], pages[index]];
      return updateSite(current, site.id, (target) => ({ ...target, pages: pages.map((page, pageIndex) => ({ ...page, pageNumber: pageIndex + 1 })) }));
    });
  }

  function addRevealBlock(page: StudioPage): void {
    const block: RevealBlock = {
      id: createId('reveal'),
      label: text.newReveal,
      prompt: text.revealPromptDefault,
      answerAliases: [text.answerDefault],
      secretHtml: text.revealedContent,
      failureMessage: text.genericFailure
    };
    updatePage(page.id, (current) => ({
      ...current,
      bodyHtml: `${current.bodyHtml}\n<div data-reveal-id="${block.id}"></div>`,
      revealBlocks: [...current.revealBlocks, block]
    }));
  }

  function updateReveal(page: StudioPage, revealId: string, patch: Partial<RevealBlock>): void {
    updatePage(page.id, (current) => ({
      ...current,
      revealBlocks: current.revealBlocks.map((block) => (block.id === revealId ? { ...block, ...patch } : block))
    }));
  }

  function addUnlockPage(page: StudioPage): void {
    const unlock: UnlockPage = {
      id: createId('unlock'),
      label: text.lockedPage,
      path: `unlock-${page.unlockPages.length + 1}.html`,
      prompt: text.unlockPromptDefault,
      answerAliases: [text.keyDefault],
      payloadHtml: text.unlockedPayload,
      failureMessage: text.genericFailure
    };
    updatePage(page.id, (current) => ({ ...current, unlockPages: [...current.unlockPages, unlock] }));
  }

  function updateUnlock(page: StudioPage, unlockId: string, patch: Partial<UnlockPage>): void {
    updatePage(page.id, (current) => ({
      ...current,
      unlockPages: current.unlockPages.map((unlock) => (unlock.id === unlockId ? { ...unlock, ...patch } : unlock))
    }));
  }

  async function addAssets(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    const assets: StudioAsset[] = [];
    for (const file of [...files]) {
      const dataUrl = await readFileAsDataUrl(file);
      assets.push({
        id: createId('asset'),
        name: file.name,
        safeName: normalizeAssetPath(file.name).replace(/^assets\//, ''),
        mime: file.type || 'application/octet-stream',
        dataUrl,
        bytes: file.size
      });
    }
    updateProject((current) => ({ ...current, assets: [...current.assets, ...assets] }));
  }

  function addTheme(): StudioTheme {
    const theme: StudioTheme = {
      id: createId('theme'),
      name: text.themeName(activeThemes.length + 1),
      css: 'body { background: #fffdf8; color: #24272d; }'
    };
    updateProject((current) => updateSite(current, activeSite.id, (site) => ({ ...site, themes: [...site.themes, theme] })));
    return theme;
  }

  function updateTheme(themeId: string, patch: Partial<StudioTheme>): void {
    updateProject((current) => updateThemeInProject(current, themeId, (theme) => ({ ...theme, ...patch })));
  }

  function addStoryMapNode(storyMap: StudioStoryMap): void {
    const node: StoryMapNode = {
      id: createId('node'),
      label: text.flowNode(storyMap.nodes.length + 1),
      type: selectedPage ? 'page' : 'discovery',
      linkedEntity: selectedPage ? { kind: 'page', siteId: activeSite.id, pageId: selectedPage.id, id: selectedPage.id } : undefined,
      siteId: selectedPage ? activeSite.id : undefined,
      pageId: selectedPage?.id,
      notes: '',
      tags: [],
      x: 90 + (storyMap.nodes.length % 4) * 220,
      y: 100 + Math.floor(storyMap.nodes.length / 4) * 130
    };
    updateProject((current) => ({
      ...current,
      storyMaps: current.storyMaps.map((item) => (item.id === storyMap.id ? { ...item, nodes: [...item.nodes, node] } : item))
    }));
  }

  function addStoryMapEdge(storyMap: StudioStoryMap, sourceId: string, targetId: string): void {
    if (!sourceId || !targetId || sourceId === targetId || storyMap.edges.some((edge) => edge.source === sourceId && edge.target === targetId)) return;
    const edge: StoryMapEdge = {
      id: createId('edge'),
      source: sourceId,
      target: targetId,
      label: text.routeLabel,
      action: 'read',
      pathRole: 'intended',
      prerequisiteMode: 'permissive',
      notes: '',
      tags: [],
      effects: []
    };
    updateProject((current) => ({
      ...current,
      storyMaps: current.storyMaps.map((item) => (item.id === storyMap.id ? { ...item, edges: [...item.edges, edge] } : item))
    }));
  }

  function addSearchRule(): void {
    const targetPageId = selectedPage?.id ?? projectPages[0]?.id ?? '';
    const rule: SearchRule = {
      id: createId('search'),
      label: text.searchRuleLabel(project.searchRules.length + 1),
      terms: [text.secretPhrase],
      aliases: [text.secretPhraseAlias],
      mode: 'exact',
      targetPageId,
      hint: '',
      failureMessage: text.genericFailure
    };
    updateProject((current) => ({ ...current, searchRules: [...current.searchRules, rule] }));
  }

  function updateSearchRule(ruleId: string, patch: Partial<SearchRule>): void {
    updateProject((current) => ({
      ...current,
      searchRules: current.searchRules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule))
    }));
  }

  function addCondition(): void {
    const first = projectPages[0]?.id ?? '';
    const second = projectPages[1]?.id ?? first;
    const condition: StudioCondition = {
      id: createId('condition'),
      label: text.routeName(project.conditions.length + 1),
      sourcePageId: first,
      targetPageId: second,
      publicHint: text.followClue,
      internalNote: ''
    };
    updateProject((current) => ({ ...current, conditions: [...current.conditions, condition] }));
  }

  function updateCondition(conditionId: string, patch: Partial<StudioCondition>): void {
    updateProject((current) => ({
      ...current,
      conditions: current.conditions.map((condition) => (condition.id === conditionId ? { ...condition, ...patch } : condition))
    }));
  }

  function addSite(): void {
    const site = createDefaultSite({
      name: `${text.tabs.sites} ${project.sites.length + 1}`,
      slug: safeSlug(`site-${project.sites.length + 1}`, `site-${project.sites.length + 1}`),
      pathPrefix: `sites/site-${project.sites.length + 1}`
    });
    updateProject((current) => ({ ...current, sites: [...current.sites, site] }));
    setSelectedSiteId(site.id);
    setSelectedPageId(site.pages[0]?.id ?? '');
  }

  function updateSiteDetails(siteId: string, patch: Partial<Pick<StudioSite, 'name' | 'slug' | 'pathPrefix'>>): void {
    updateProject((current) => updateSite(current, siteId, (site) => ({ ...site, ...patch })));
  }

  async function duplicateSite(site: StudioSite): Promise<void> {
    const confirmed = await requestConfirmation({
      title: text.duplicateSite,
      message: text.duplicateSiteConfirm(site.name),
      confirmLabel: text.duplicateSite
    });
    if (!confirmed) return;
    const suffix = project.sites.length + 1;
    const pageIdMap = new Map<string, string>();
    const themeIdMap = new Map<string, string>();
    const themes = site.themes.map((theme) => {
      const id = createId('theme');
      themeIdMap.set(theme.id, id);
      return { ...theme, id, name: `${theme.name} ${text.duplicateSuffix}` };
    });
    const pages = site.pages.map((page, index) => {
      const id = createId('page');
      pageIdMap.set(page.id, id);
      return {
        ...page,
        id,
        title: `${page.title} ${text.duplicateSuffix}`,
        slug: safeSlug(`${page.slug}-copy`, `page-${index + 1}`),
        path: normalizePublicPath(`${page.slug}-copy.html`, `page-${index + 1}.html`),
        pageNumber: index + 1,
        themeId: page.themeId ? themeIdMap.get(page.themeId) : undefined
      };
    });
    const copy: StudioSite = {
      ...site,
      id: createId('site'),
      name: `${site.name} ${text.duplicateSuffix}`,
      slug: safeSlug(`${site.slug}-copy-${suffix}`, `site-${suffix}`),
      pathPrefix: `sites/${safeSlug(`${site.slug}-copy-${suffix}`, `site-${suffix}`)}`,
      pages,
      themes
    };
    updateProject((current) => ({ ...current, sites: [...current.sites, copy] }));
    setSelectedSiteId(copy.id);
    setSelectedPageId(copy.pages[0]?.id ?? '');
  }

  async function deleteSite(siteId: string): Promise<void> {
    if (project.sites.length <= 1) {
      return;
    }
    const targetSite = project.sites.find((site) => site.id === siteId);
    if (!targetSite) {
      return;
    }
    const confirmed = await requestConfirmation({
      title: text.deleteSite,
      message: text.deleteSiteConfirm(targetSite.name),
      confirmLabel: text.deleteSite,
      tone: 'danger'
    });
    if (!confirmed) {
      return;
    }
    const removedPageIds = new Set(targetSite.pages.map((page) => page.id));
    updateProject((current) => {
      const sites = current.sites.filter((site) => site.id !== siteId);
      const nextPrimarySiteId = current.primarySiteId === siteId ? sites[0]?.id ?? current.primarySiteId : current.primarySiteId;
      return {
        ...current,
        primarySiteId: nextPrimarySiteId,
        sites,
        searchRules: current.searchRules.filter((rule) => !removedPageIds.has(rule.targetPageId)),
        conditions: current.conditions.filter((condition) => !removedPageIds.has(condition.sourcePageId) && !removedPageIds.has(condition.targetPageId)),
        storyMaps: current.storyMaps.map((storyMap) => ({
          ...storyMap,
          nodes: storyMap.nodes.map((node) =>
            node.siteId === siteId || (node.pageId && removedPageIds.has(node.pageId))
              ? { ...node, siteId: undefined, pageId: undefined, linkedEntity: undefined, type: node.type === 'site' || node.type === 'page' ? 'discovery' : node.type }
              : node
          )
        }))
      };
    });
    const nextSite = project.sites.find((site) => site.id !== siteId) ?? activeSite;
    setSelectedSiteId(nextSite.id);
    setSelectedPageId(nextSite.pages[0]?.id ?? '');
  }

  async function manualSave(): Promise<void> {
    await saveProject(project);
    setKnownProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
    setSaveState(text.saved(new Date().toLocaleTimeString()));
  }

  function createSnapshot(): void {
    const snapshotProject = cloneProjectForSnapshot(project);
    updateProject((current) => ({
      ...current,
      snapshots: [
        ...current.snapshots,
        {
          id: createId('snapshot'),
          label: `${text.snapshot} ${current.snapshots.length + 1}`,
          createdAt: nowIso(),
          project: snapshotProject
        }
      ]
    }));
  }

  async function exportBackup(): Promise<void> {
    const blob = await exportProjectBackupZip(project);
    downloadBlob(blob, `${safeSlug(project.name, 'cicada-project')}-backup.zip`);
    clearProjectChangedSinceBackup(project.id);
  }

  async function exportSourceBackup(): Promise<void> {
    const blob = await exportProjectSourceZip(project);
    downloadBlob(blob, `${safeSlug(project.name, 'cicada-project')}-source.zip`);
    clearProjectChangedSinceBackup(project.id);
  }

  async function importBackup(file: File | undefined): Promise<void> {
    if (!file) return;
    const imported = await importProjectBackupZip(await readFileAsArrayBuffer(file));
    setProject(touchProject(imported));
    setKnownProjects((projects) => [imported, ...projects.filter((item) => item.id !== imported.id)]);
    clearProjectChangedSinceBackup(imported.id);
    setSelectedSiteId(primarySite(imported).id);
    setSelectedPageId(primarySite(imported).pages[0]?.id ?? '');
    setExportState(text.importedBackup(file.name));
  }

  async function dryRunImportSource(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const result = await dryRunImportProjectSourceZip(await readFileAsArrayBuffer(file));
      setSourceImportReview({ fileName: file.name, result, mode: 'new' });
      setExportState(result.ok ? text.sourceImportReady(file.name) : text.sourceImportHasErrors(file.name, result.errors.length));
    } catch (error: unknown) {
      setSourceImportReview(null);
      setExportState(error instanceof Error ? text.sourceImportDryRunFailed(error.message) : text.sourceImportDryRunFailed(text.genericError));
    }
  }

  function updateSourceImportMode(mode: SourceImportMode): void {
    setSourceImportReview((review) => (review ? { ...review, mode } : review));
  }

  function cancelSourceImport(): void {
    setSourceImportReview(null);
    setExportState('');
  }

  async function applySourceImport(): Promise<void> {
    if (!sourceImportReview?.result.project || sourceImportReview.result.errors.length) {
      return;
    }
    const imported = sourceImportReview.result.project;
    if (sourceImportReview.mode === 'overwrite') {
      const snapshot = {
        id: createId('snapshot'),
        label: text.sourceImportSnapshotLabel(sourceImportReview.fileName),
        createdAt: nowIso(),
        project: cloneProjectForSnapshot(project)
      };
      const next = touchProject({
        ...imported,
        id: project.id,
        createdAt: project.createdAt,
        snapshots: [snapshot]
      });
      await saveProject(next);
      firstSave.current = true;
      setProject(next);
      setKnownProjects((projects) => [next, ...projects.filter((item) => item.id !== project.id)]);
      markProjectChangedSinceBackup(next.id);
      setSelectedSiteId(primarySite(next).id);
      setSelectedPageId(primarySite(next).pages[0]?.id ?? '');
      setExportState(text.sourceImportedOverwrite(sourceImportReview.fileName));
    } else {
      const next = touchProject({
        ...imported,
        id: createId('project'),
        createdAt: nowIso(),
        snapshots: []
      });
      await saveProject(project);
      await saveProject(next);
      firstSave.current = true;
      setProject(next);
      setKnownProjects((projects) => [next, project, ...projects.filter((item) => item.id !== next.id && item.id !== project.id)]);
      markProjectChangedSinceBackup(next.id);
      setSelectedSiteId(primarySite(next).id);
      setSelectedPageId(primarySite(next).pages[0]?.id ?? '');
      setExportState(text.sourceImportedNew(sourceImportReview.fileName));
    }
    setSourceImportReview(null);
    setSelectedTab('dashboard');
  }

  async function importYacho(file: File | undefined): Promise<void> {
    if (!file) return;
    const imported = await importYachoProjectZip(await readFileAsArrayBuffer(file));
    setProject(imported);
    setKnownProjects((projects) => [imported, ...projects]);
    markProjectChangedSinceBackup(imported.id);
    setSelectedSiteId(primarySite(imported).id);
    setSelectedPageId(primarySite(imported).pages[0]?.id ?? '');
    setExportState(text.importedYacho(file.name));
  }

  async function exportPublic(siteId?: string): Promise<void> {
    setExportState(text.buildingPublicZip);
    const blob = await buildPublicExportZip(project, siteId ? { siteId } : undefined);
    const check = await checkPublicExportZip(blob, project);
    if (!check.ok) {
      setExportState(text.publicExportBlocked(check.findings.map((finding) => finding.reason).join('; ')));
      return;
    }
    const site = siteId ? siteById(project, siteId) : undefined;
    const baseName = site ? `${project.name}-${site.name}` : project.name;
    downloadBlob(blob, `${safeSlug(baseName, 'public-site')}-public.zip`);
    setExportState(text.publicZipPassed(check.files.length));
  }

  return (
    <I18nContext.Provider value={text}>
      <div className="app-shell">
        <Sidebar project={project} selectedTab={selectedTab} onSelectTab={setSelectedTab} />
        <div className={showProjectTopbar ? 'app-main' : 'app-main no-topbar-main'}>
          {showProjectTopbar && (
            <header className="topbar">
              <div className="topbar-project">
                <label className="project-name-field">
                  <span>{text.projectName}</span>
                  <input
                    className="project-title"
                    value={project.name}
                    aria-label={text.projectName}
                    onChange={(event) => updateProject((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <select className="project-switcher" value={project.id} aria-label={text.openProject} onChange={(event) => void switchProject(event.target.value)}>
                  {knownProjects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="topbar-meta">
                <label className="language-select">
                  <Languages size={16} />
                  <span>{text.languageLabel}</span>
                  <select value={language} aria-label={text.languageLabel} onChange={(event) => setLanguage(event.target.value as Language)}>
                    <option value="ja">{text.japanese}</option>
                    <option value="en">{text.english}</option>
                  </select>
                </label>
                <div className="save-summary" aria-live="polite">
                  <CheckCircle2 size={18} />
                  <strong>{saveState}</strong>
                  <span>{loadState}</span>
                </div>
              </div>
              <div className="topbar-actions">
                <button type="button" onClick={manualSave} title={text.manualSave}>
                  <Save size={16} /> {text.save}
                </button>
                <button type="button" onClick={() => createNewProject()} title={text.newProject}>
                  <FilePlus size={16} /> {text.newProject}
                </button>
                <button type="button" onClick={createSnapshot} title={text.createSnapshot}>
                  <Archive size={16} /> {text.snapshot}
                </button>
              </div>
            </header>
          )}

          <main className="workspace">
            {hasChangesSinceBackup && (
              <BackupReminderBanner
                currentProjectChangedSinceBackup={currentProjectChangedSinceBackup}
                changedProjectCount={changedSinceBackupProjectCount}
                exportBackup={exportBackup}
                openProjectManagement={() => setSelectedTab('projects')}
              />
            )}
            {selectedTab === 'intro' && <SystemIntro setTab={setSelectedTab} />}
            {selectedTab === 'projects' && (
              <ProjectManagementPanel
                project={project}
                knownProjects={knownProjects}
                loadState={loadState}
                saveState={saveState}
                language={language}
                setLanguage={setLanguage}
                updateProject={updateProject}
                switchProject={switchProject}
                createNewProject={createNewProject}
                manualSave={manualSave}
                deleteCurrentProject={deleteCurrentProject}
              />
            )}
            {selectedTab === 'dashboard' && (
              <Dashboard
                project={project}
                pageRefs={projectPageRefs}
                selectedPageId={selectedPage?.id ?? ''}
                onSelectPage={setSelectedPageId}
                onAddPage={addPage}
                setTab={setSelectedTab}
              />
            )}
            {selectedTab === 'sites' && (
              <SitesPanel
                project={project}
                selectedSiteId={activeSite.id}
                onSelectSite={(siteId) => {
                  const site = siteById(project, siteId);
                  setSelectedSiteId(site.id);
                  setSelectedPageId(site.pages[0]?.id ?? '');
                }}
                onAddSite={addSite}
                onDuplicateSite={duplicateSite}
                onDeleteSite={deleteSite}
                onUpdateSite={updateSiteDetails}
              />
            )}
            {selectedTab === 'pages' && (
              <PagesPanel
                site={activeSite}
                selectedPageId={selectedPage?.id ?? ''}
                onAdd={addPage}
                onDuplicate={duplicatePage}
                onDelete={deletePage}
                onMove={movePage}
                onSelect={(id) => {
                  setSelectedPageId(id);
                  setSelectedTab('editor');
                }}
                onUpdate={updatePage}
              />
            )}
            {selectedTab === 'editor' && selectedPage && (
              <EditorPanel
                project={project}
                site={activeSite}
                page={selectedPage}
                setSelectedPageId={setSelectedPageId}
                updatePage={updatePage}
                addRevealBlock={addRevealBlock}
                updateReveal={updateReveal}
                addUnlockPage={addUnlockPage}
                updateUnlock={updateUnlock}
              />
            )}
            {selectedTab === 'assets' && (
              <AssetsPanel project={project} selectedPage={selectedPage} addAssets={addAssets} updateProject={updateProject} updatePage={updatePage} />
            )}
            {selectedTab === 'themes' && <ThemesPanel project={project} site={activeSite} addTheme={addTheme} updateTheme={updateTheme} updateProject={updateProject} />}
            {selectedTab === 'storyMap' && (
              <StoryMapPanel
                project={project}
                pageRefs={projectPageRefs}
                addStoryMapNode={addStoryMapNode}
                addStoryMapEdge={addStoryMapEdge}
                updateProject={updateProject}
                requestConfirmation={requestConfirmation}
              />
            )}
            {selectedTab === 'messenger' && <MessengerPanel project={project} updateProject={updateProject} />}
            {selectedTab === 'search' && (
              <SearchPanel project={project} pageRefs={projectPageRefs} addSearchRule={addSearchRule} updateSearchRule={updateSearchRule} updateProject={updateProject} />
            )}
            {selectedTab === 'conditions' && (
              <ConditionsPanel project={project} pageRefs={projectPageRefs} addCondition={addCondition} updateCondition={updateCondition} updateProject={updateProject} />
            )}
            {selectedTab === 'export' && (
              <ExportPanel
                project={project}
                exportState={exportState}
                exportBackup={exportBackup}
                exportSourceBackup={exportSourceBackup}
                importBackup={importBackup}
                importSource={dryRunImportSource}
                importYacho={importYacho}
                selectedSite={activeSite}
                updateStoryNamespace={(storyNamespace) => updateProject((current) => ({ ...current, storyNamespace }))}
                exportPublic={exportPublic}
              />
            )}
          </main>
        </div>
      </div>
      <ConfirmationDialog
        request={confirmationRequest}
        text={text}
        onCancel={() => resolveConfirmation(false)}
        onConfirm={() => resolveConfirmation(true)}
      />
      <SourceImportWizard
        review={sourceImportReview}
        onModeChange={updateSourceImportMode}
        onCancel={cancelSourceImport}
        onApply={applySourceImport}
      />
    </I18nContext.Provider>
  );
}

const TAB_ICONS: Record<StudioTab, LucideIcon> = {
  intro: Info,
  projects: FolderOpen,
  dashboard: LayoutDashboard,
  sites: Globe2,
  pages: FileText,
  editor: FilePlus,
  assets: Image,
  themes: Palette,
  storyMap: GitBranch,
  messenger: MessageCircle,
  search: Search,
  conditions: LockKeyhole,
  export: Download
};

function Sidebar({
  project,
  selectedTab,
  onSelectTab
}: {
  project: StudioProject;
  selectedTab: StudioTab;
  onSelectTab: (tab: StudioTab) => void;
}): JSX.Element {
  const text = useUiText();
  const groups: Array<{ label: string; tabs: StudioTab[] }> = [
    { label: text.navOverview, tabs: ['intro', 'projects', 'dashboard', 'sites', 'storyMap'] },
    { label: text.navWriting, tabs: ['pages', 'editor', 'assets', 'themes', 'messenger'] },
    { label: text.navPublishing, tabs: ['search', 'conditions', 'export'] }
  ];

  return (
    <aside className="app-sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <img src="/favicon.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <strong>Cicada Studio</strong>
          <span>{text.appEyebrow}</span>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label={text.tabsLabel}>
        {groups.map((group) => (
          <div key={group.label} className="nav-group">
            <span className="nav-group-label">{group.label}</span>
            {group.tabs.map((tab) => {
              const Icon = TAB_ICONS[tab];
              const count = getTabCount(project, tab);
              return (
                <button type="button" key={tab} className={selectedTab === tab ? 'active' : ''} onClick={() => onSelectTab(tab)}>
                  <Icon size={18} />
                  <span>{text.tabs[tab]}</span>
                  {count !== null && <em>{count}</em>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function getTabCount(project: StudioProject, tab: StudioTab): number | null {
  switch (tab) {
    case 'sites':
      return project.sites.length;
    case 'pages':
      return allPages(project).length;
    case 'assets':
      return project.assets.length;
    case 'storyMap':
      return project.storyMaps[0]?.nodes.length ?? 0;
    case 'messenger':
      return project.messengerThreads.length;
    case 'search':
      return project.searchRules.length;
    case 'conditions':
      return project.conditions.length;
    default:
      return null;
  }
}

function SystemIntro({ setTab }: { setTab: (tab: StudioTab) => void }): JSX.Element {
  const text = useUiText();
  return (
    <section className="intro-page" aria-labelledby="system-intro-title">
      <section className="intro-overview">
        <div className="intro-copy">
          <span className="section-kicker">{text.introKicker}</span>
          <h1 id="system-intro-title">
            {text.introTitleSegments.map((segment, index) => (
              <span key={segment}>
                {index > 0 && ' '}
                {segment}
              </span>
            ))}
          </h1>
          <p>
            {text.introLeadSegments.map((segment, index) => (
              <span key={`${segment}-${index}`}>{segment}</span>
            ))}
          </p>
          <div className="intro-summary-box">
            <strong>{text.introWhatTitle}</strong>
            <span>{text.introWhatCopy}</span>
          </div>
          <div className="intro-actions">
            <button type="button" className="primary-action" onClick={() => setTab('dashboard')}>
              <LayoutDashboard size={17} /> {text.introOpenDashboard}
            </button>
            <button type="button" onClick={() => setTab('projects')}>
              <FolderOpen size={17} /> {text.introOpenProjects}
            </button>
            <button type="button" onClick={() => setTab('editor')}>
              <FilePlus size={17} /> {text.introOpenEditor}
            </button>
            <a className="button-link" href={SOURCE_CODE_URL} target="_blank" rel="noreferrer">
              <Globe2 size={17} /> {text.introSourceCode}
            </a>
          </div>
        </div>
        <div className="intro-signal-list" aria-label={text.introKicker}>
          <div>
            <ShieldCheck size={19} />
            <span>{text.localFirst}</span>
            <strong>{text.noNetwork}</strong>
          </div>
          <div>
            <Download size={19} />
            <span>{text.publicStaticSite}</span>
            <strong>{text.manualExport}</strong>
          </div>
        </div>
      </section>

      <div className="intro-feature-grid">
        {text.introHighlights.map((item) => (
          <article key={item.title} className="intro-card">
            <CheckCircle2 size={20} />
            <h2>{item.title}</h2>
            <p>{item.copy}</p>
          </article>
        ))}
      </div>

      <section className="intro-panel intro-workflow-panel">
        <div className="panel-head">
          <div>
            <h2>{text.introWorkflowTitle}</h2>
            <p>{text.introWorkflowCopy}</p>
          </div>
        </div>
        <ol className="intro-workflow-list">
          {text.introWorkflowSteps.map((step, index) => (
            <li key={step.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step.title}</strong>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="intro-detail-grid">
        <section className="intro-panel">
          <div className="panel-head">
            <div>
              <h2>{text.introLicenseTitle}</h2>
              <p>{text.introLicenseLead}</p>
            </div>
            <a className="button-link" href={OUTPUT_LICENSE_URL} target="_blank" rel="noreferrer">
              <FileText size={17} /> {text.introLicenseDocs}
            </a>
          </div>
          <dl className="intro-license-list">
            {text.introLicenseRows.map((row) => (
              <div key={row.title}>
                <dt>{row.title}</dt>
                <dd>{row.copy}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="intro-panel intro-note-panel">
          <div>
            <Globe2 size={21} />
            <h2>{text.introCommercialTitle}</h2>
            <p>{text.introCommercialCopy}</p>
          </div>
          <div>
            <ClipboardCheck size={21} />
            <h2>{text.introCreditTitle}</h2>
            <p>{text.introCreditCopy}</p>
          </div>
        </section>
      </div>
    </section>
  );
}

function ProjectManagementPanel({
  project,
  knownProjects,
  loadState,
  saveState,
  language,
  setLanguage,
  updateProject,
  switchProject,
  createNewProject,
  manualSave,
  deleteCurrentProject
}: {
  project: StudioProject;
  knownProjects: StudioProject[];
  loadState: string;
  saveState: string;
  language: Language;
  setLanguage: (language: Language) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
  switchProject: (projectId: string) => Promise<void>;
  createNewProject: (targetTab?: StudioTab) => void;
  manualSave: () => Promise<void>;
  deleteCurrentProject: () => Promise<void>;
}): JSX.Element {
  const text = useUiText();
  const projectOptions = useMemo(
    () => [project, ...knownProjects.filter((item) => item.id !== project.id)],
    [knownProjects, project]
  );

  return (
    <section className="panel project-manager-page">
      <div className="section-head">
        <div>
          <span className="section-kicker">{text.tabs.projects}</span>
          <h2>{text.projectManagementTitle}</h2>
          <p>{text.projectManagementCopy}</p>
        </div>
        <StatusBadge tone="neutral">{text.projectCount(projectOptions.length)}</StatusBadge>
      </div>
      <div className="project-manager-grid">
        <label className="project-name-field">
          <span>{text.projectName}</span>
          <input
            className="project-title"
            value={project.name}
            aria-label={text.projectName}
            onChange={(event) => updateProject((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label className="language-select project-language-select">
          <Languages size={16} />
          <span>{text.languageLabel}</span>
          <select value={language} aria-label={text.languageLabel} onChange={(event) => setLanguage(event.target.value as Language)}>
            <option value="ja">{text.japanese}</option>
            <option value="en">{text.english}</option>
          </select>
        </label>
      </div>
      <section className="project-list-panel" aria-labelledby="project-list-heading">
        <div className="project-list-head">
          <div>
            <h3 id="project-list-heading">{text.projectListTitle}</h3>
            <p>{text.projectListCopy}</p>
          </div>
          <StatusBadge tone="neutral">{text.projectCount(projectOptions.length)}</StatusBadge>
        </div>
        <div className="project-list">
          {projectOptions.map((item) => {
            const active = item.id === project.id;
            return (
              <button
                key={item.id}
                type="button"
                className={active ? 'project-list-row active' : 'project-list-row'}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  if (!active) {
                    void switchProject(item.id);
                  }
                }}
              >
                <FolderOpen size={18} aria-hidden="true" />
                <span className="project-list-copy">
                  <strong>{item.name}</strong>
                  <small>
                    {allPages(item).length} {text.metricPages} · {text.projectUpdated(formatDate(item.updatedAt))}
                  </small>
                </span>
                {active ? <StatusBadge tone="green">{text.activeProject}</StatusBadge> : <ChevronRight size={17} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>
      <div className="project-manager-actions">
        <button type="button" onClick={() => void manualSave()} title={text.manualSave}>
          <Save size={16} /> {text.save}
        </button>
        <button type="button" onClick={() => createNewProject('projects')} title={text.newProject}>
          <FilePlus size={16} /> {text.newProject}
        </button>
        <button type="button" className="danger-action" onClick={() => void deleteCurrentProject()} title={text.deleteProject}>
          <Trash2 size={16} /> {text.deleteProject}
        </button>
      </div>
      <div className="project-manager-status" aria-live="polite">
        <CheckCircle2 size={18} />
        <strong>{saveState}</strong>
        <span>{loadState}</span>
      </div>
    </section>
  );
}

function Dashboard({
  project,
  pageRefs,
  selectedPageId,
  onSelectPage,
  onAddPage,
  setTab
}: {
  project: StudioProject;
  pageRefs: ReturnType<typeof allPageRefs>;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  setTab: (tab: StudioTab) => void;
}): JSX.Element {
  const text = useUiText();
  const pages = pageRefs.map((ref) => ref.page);
  const selectedRef = pageRefs.find((ref) => ref.page.id === selectedPageId) ?? pageRefs[0];
  const selectedPage = selectedRef?.page;
  const published = pages.filter((page) => page.status === 'published').length;
  const draft = pages.length - published;
  const unlockCount = pages.reduce((count, page) => count + page.unlockPages.length, 0);
  const clueCount = project.searchRules.length + project.conditions.length + pages.reduce((count, page) => count + page.revealBlocks.length, 0);
  const checks = [
    pages.every((page) => page.title.trim() && stripHtml(page.bodyHtml).length > 0),
    project.searchRules.length > 0 || project.conditions.length > 0 || pages.some((page) => page.revealBlocks.length > 0 || page.unlockPages.length > 0),
    pages.every((page) => page.path.trim().endsWith('.html')),
    project.snapshots.length > 0
  ];
  const readiness = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const selectedRules = selectedPage ? project.searchRules.filter((rule) => rule.targetPageId === selectedPage.id) : [];
  const selectedConditions = selectedPage
    ? project.conditions.filter((condition) => condition.sourcePageId === selectedPage.id || condition.targetPageId === selectedPage.id)
    : [];
  const storyMapNodes = project.storyMaps[0]?.nodes ?? [];

  return (
    <section className="case-board">
      <div className="case-board-head">
        <div>
          <span className="section-kicker">{text.studioNav}</span>
          <h1>{text.caseBoardTitle}</h1>
          <p>{text.caseBoardCopy}</p>
        </div>
        <button type="button" className="primary-action" onClick={() => setTab('export')}>
          <ClipboardCheck size={17} /> {text.exportChecks}
        </button>
      </div>

      <div className="metric-row">
        <Metric icon={FileText} label={text.totalPages} value={`${pages.length}`} detail={text.metricPages} />
        <Metric icon={Globe2} label={text.publishablePages} value={`${published}`} detail={`${Math.round((published / Math.max(pages.length, 1)) * 100)}%`} />
        <Metric icon={LockKeyhole} label={text.secretPages} value={`${draft}`} detail={text.draft} />
        <Metric icon={KeyRound} label={text.clueCount} value={`${clueCount}`} detail={text.searchRules} />
        <Metric icon={Route} label={text.unlockCount} value={`${unlockCount}`} detail={text.conditionsRoutes} />
        <Metric icon={ClipboardCheck} label={text.exportReadiness} value={`${readiness}%`} detail={readiness >= 75 ? text.ready : text.needsWork} />
      </div>

      <div className="case-board-grid">
        <section className="board-panel pages-ledger">
          <div className="panel-head">
            <div>
              <h2>{text.allPages}</h2>
              <p>
                {pages.length} {text.metricPages}
              </p>
            </div>
            <button type="button" onClick={onAddPage}>
              <Plus size={16} /> {text.newPageShort}
            </button>
          </div>
          <div className="page-ledger-list">
            {pageRefs.map(({ site, page }) => (
              <button
                type="button"
                key={page.id}
                className={page.id === selectedPage?.id ? 'page-ledger-row active' : 'page-ledger-row'}
                onClick={() => onSelectPage(page.id)}
              >
                <span className="drag-handle">{String(page.pageNumber).padStart(2, '0')}</span>
                <span>
                  <strong>{page.title}</strong>
                  <small>{site.name} / {page.path}</small>
                </span>
                <StatusBadge tone={page.status === 'published' ? 'green' : 'amber'}>{page.status === 'published' ? text.published : text.draft}</StatusBadge>
              </button>
            ))}
          </div>
        </section>

        <section className="board-panel flow-overview">
          <div className="panel-head">
            <div>
              <h2>{text.flowOverview}</h2>
              <p>{text.revealAndUnlock}</p>
            </div>
            <button type="button" onClick={() => setTab('storyMap')}>
              <GitBranch size={16} /> {text.tabs.storyMap}
            </button>
          </div>
          {storyMapNodes.length ? (
            <ol className="route-stack">
              {storyMapNodes.slice(0, 7).map((node, index) => {
                const linkedPage = node.pageId ? pageRefs.find((ref) => ref.page.id === node.pageId)?.page : undefined;
                return (
                  <li key={node.id} className={node.pageId === selectedPage?.id ? 'active' : ''}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{node.label}</strong>
                    <small>{linkedPage?.path ?? text.noPage}</small>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="empty-state">
              <GitBranch size={28} />
              <span>{text.noFlowNodes}</span>
            </div>
          )}
        </section>

        <section className="board-panel page-inspector">
          <div className="panel-head">
            <div>
              <h2>{text.selectedPage}</h2>
              <p>{selectedPage?.title}</p>
            </div>
            <StatusBadge tone={selectedPage?.status === 'published' ? 'green' : 'amber'}>
              {selectedPage?.status === 'published' ? text.published : text.draft}
            </StatusBadge>
          </div>
          {selectedPage && (
            <>
              <dl className="inspector-list">
                <div>
                  <dt>{text.fileName}</dt>
                  <dd>{selectedPage.path}</dd>
                </div>
                <div>
                  <dt>{text.theme}</dt>
                  <dd>{selectedRef?.site.themes.find((theme) => theme.id === selectedPage.themeId)?.name ?? text.noPage}</dd>
                </div>
                <div>
                  <dt>{text.updatedAt}</dt>
                  <dd>{formatDate(project.updatedAt)}</dd>
                </div>
                <div>
                  <dt>{text.htmlBody}</dt>
                  <dd>{text.bodyChars(stripHtml(selectedPage.bodyHtml).length)}</dd>
                </div>
              </dl>
              <div className="tag-stack">
                <strong>{text.visibleConditions}</strong>
                {selectedConditions.length ? (
                  selectedConditions.map((condition) => <span key={condition.id}>{condition.label}</span>)
                ) : (
                  <small>{text.noConditions}</small>
                )}
              </div>
              <div className="tag-stack">
                <strong>{text.relatedClues}</strong>
                {selectedRules.length ? selectedRules.map((rule) => <span key={rule.id}>{rule.label}</span>) : <small>{text.noSearchRules}</small>}
              </div>
              <div className="quick-actions">
                <button type="button" className="primary-action" onClick={() => setTab('editor')}>
                  <FilePlus size={16} /> {text.editThisPage}
                </button>
                <button type="button" onClick={() => setTab('editor')}>
                  <ChevronRight size={16} /> {text.previewThisPage}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="board-panel checklist-panel">
        <div className="panel-head">
          <div>
            <h2>{text.productionChecklist}</h2>
            <p>{text.encryptionBoundaryCopy}</p>
          </div>
        </div>
        <div className="checklist">
          <ChecklistRow done={checks[0]} label={text.checklistTitles} />
          <ChecklistRow done={checks[1]} label={text.checklistSearch} />
          <ChecklistRow done={checks[2]} label={text.checklistExportPath} />
          <ChecklistRow done={checks[3]} label={text.checklistBackup} />
        </div>
      </section>
    </section>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }): JSX.Element {
  return (
    <div className="metric">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function StatusBadge({ children, tone }: { children: string; tone: 'green' | 'amber' | 'neutral' }): JSX.Element {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

function BackupReminderBanner({
  currentProjectChangedSinceBackup,
  changedProjectCount,
  exportBackup,
  openProjectManagement
}: {
  currentProjectChangedSinceBackup: boolean;
  changedProjectCount: number;
  exportBackup: () => Promise<void>;
  openProjectManagement: () => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="backup-reminder-banner" aria-live="polite">
      <span className="backup-reminder-icon">
        <AlertTriangle size={19} aria-hidden="true" />
      </span>
      <div>
        <strong>{text.backupReminderTitle}</strong>
        <p>{currentProjectChangedSinceBackup ? text.backupReminderCopy : text.backupReminderOtherProjectCopy(changedProjectCount)}</p>
      </div>
      {currentProjectChangedSinceBackup ? (
        <button type="button" className="primary-action" onClick={() => void exportBackup()}>
          <Download size={16} /> {text.backupReminderAction}
        </button>
      ) : (
        <button type="button" onClick={openProjectManagement}>
          <FolderOpen size={16} /> {text.tabs.projects}
        </button>
      )}
    </section>
  );
}

function ConfirmationDialog({
  request,
  text,
  onCancel,
  onConfirm
}: {
  request: ConfirmationRequest | null;
  text: UiText;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element | null {
  useEffect(() => {
    if (!request) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, request]);

  if (!request) {
    return null;
  }

  const Icon = request.tone === 'danger' ? AlertTriangle : Info;

  return (
    <div className="confirmation-backdrop" role="presentation">
      <section
        className={request.tone === 'danger' ? 'confirmation-dialog danger' : 'confirmation-dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
      >
        <div className="confirmation-head">
          <span className="confirmation-icon">
            <Icon size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="confirmation-title">{request.title}</h2>
            <p>{request.message}</p>
          </div>
        </div>
        <div className="confirmation-actions">
          <button type="button" onClick={onCancel}>
            {text.cancelAction}
          </button>
          <button type="button" className={request.tone === 'danger' ? 'danger-action' : 'primary-action'} onClick={onConfirm}>
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function SourceImportWizard({
  review,
  onModeChange,
  onCancel,
  onApply
}: {
  review: SourceImportReview | null;
  onModeChange: (mode: SourceImportMode) => void;
  onCancel: () => void;
  onApply: () => Promise<void>;
}): JSX.Element | null {
  const text = useUiText();
  const sourceImportReady = Boolean(review?.result.project && review.result.errors.length === 0);
  const applyLabel = review?.result.repairs.length ? text.sourceImportApply : text.sourceImportApplyClean;

  useEffect(() => {
    if (!review) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, review]);

  if (!review) {
    return null;
  }

  return (
    <div className="confirmation-backdrop source-import-backdrop" role="presentation">
      <section className="source-import-dialog" role="dialog" aria-modal="true" aria-labelledby="source-import-title">
        <header className="source-import-head">
          <span className={sourceImportReady ? 'source-import-icon ok' : 'source-import-icon error'}>
            {sourceImportReady ? <CheckCircle2 size={20} aria-hidden="true" /> : <AlertTriangle size={20} aria-hidden="true" />}
          </span>
          <div>
            <h2 id="source-import-title">{text.sourceImportReview}</h2>
            <p>{text.sourceImportReviewCopy(review.fileName)}</p>
          </div>
        </header>
        <div className="source-import-body">
          <div className={sourceImportReady ? 'source-import-status ok' : 'source-import-status error'}>
            {sourceImportReady ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            <strong>{sourceImportReady ? text.sourceImportReady(review.fileName) : text.sourceImportHasErrors(review.fileName, review.result.errors.length)}</strong>
          </div>
          <fieldset className="source-import-modes">
            <legend>{text.sourceImportMode}</legend>
            <label className={review.mode === 'new' ? 'mode-option selected' : 'mode-option'}>
              <input type="radio" name="source-import-mode" checked={review.mode === 'new'} onChange={() => onModeChange('new')} />
              <span>
                <strong>{text.sourceImportModeNew}</strong>
                <small>{text.sourceImportModeNewCopy}</small>
              </span>
            </label>
            <label className={review.mode === 'overwrite' ? 'mode-option selected' : 'mode-option'}>
              <input type="radio" name="source-import-mode" checked={review.mode === 'overwrite'} onChange={() => onModeChange('overwrite')} />
              <span>
                <strong>{text.sourceImportModeOverwrite}</strong>
                <small>{text.sourceImportModeOverwriteCopy}</small>
              </span>
            </label>
          </fieldset>
          <div className="source-import-issues">
            <SourceImportIssueGroup title={text.sourceImportErrors(review.result.errors.length)} emptyText={text.sourceImportNoErrors} issues={review.result.errors} tone="error" />
            <SourceImportIssueGroup title={text.sourceImportRepairs(review.result.repairs.length)} emptyText={text.sourceImportNoRepairs} issues={review.result.repairs} tone="repair" />
            <SourceImportIssueGroup title={text.sourceImportWarnings(review.result.warnings.length)} emptyText={text.sourceImportNoWarnings} issues={review.result.warnings} tone="warning" />
          </div>
        </div>
        <footer className="source-import-actions">
          <button type="button" onClick={onCancel}>
            <RotateCcw size={16} /> {text.sourceImportCancel}
          </button>
          <button type="button" className="primary-action" disabled={!sourceImportReady} onClick={() => void onApply()}>
            <CheckCircle2 size={16} /> {sourceImportReady ? applyLabel : text.sourceImportBlocked}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ChecklistRow({ done, label }: { done: boolean; label: string }): JSX.Element {
  const text = useUiText();
  return (
    <div className={done ? 'check-row-item done' : 'check-row-item'}>
      {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      <span>{label}</span>
      <strong>{done ? text.ready : text.needsWork}</strong>
    </div>
  );
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}

function SitesPanel(props: {
  project: StudioProject;
  selectedSiteId: string;
  onSelectSite: (siteId: string) => void;
  onAddSite: () => void;
  onDuplicateSite: (site: StudioSite) => void | Promise<void>;
  onDeleteSite: (siteId: string) => void | Promise<void>;
  onUpdateSite: (siteId: string, patch: Partial<Pick<StudioSite, 'name' | 'slug' | 'pathPrefix'>>) => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>{text.siteManagementTitle}</h2>
          <p>{text.siteManagementCopy}</p>
        </div>
        <button type="button" onClick={props.onAddSite}>
          <Plus size={16} /> {text.addSite}
        </button>
      </div>
      <div className="table-list">
        {props.project.sites.map((site) => (
          <article key={site.id} className={site.id === props.selectedSiteId ? 'row active' : 'row'}>
            <button type="button" className="link-button" onClick={() => props.onSelectSite(site.id)}>
              {site.name}
            </button>
            <input value={site.name} aria-label={text.siteName} onChange={(event) => props.onUpdateSite(site.id, { name: event.target.value })} />
            <input
              value={site.slug}
              aria-label={text.siteSlug}
              onChange={(event) => props.onUpdateSite(site.id, { slug: safeSlug(event.target.value, site.slug) })}
            />
            <input
              value={site.pathPrefix}
              aria-label={text.sitePathPrefix}
              onChange={(event) => props.onUpdateSite(site.id, { pathPrefix: event.target.value.replace(/^\/+/, '') })}
              onBlur={(event) => props.onUpdateSite(site.id, { pathPrefix: normalizeSitePathPrefix(event.target.value, `sites/${site.slug}`) })}
            />
            <StatusBadge tone={site.id === props.project.primarySiteId ? 'green' : 'neutral'}>
              {site.id === props.project.primarySiteId ? text.primarySite : text.projectCount(site.pages.length)}
            </StatusBadge>
            <div className="icon-actions">
              <button type="button" title={text.duplicateSite} onClick={() => void props.onDuplicateSite(site)}>
                <Copy size={16} />
              </button>
              <button type="button" className="danger-action" title={text.deleteSite} disabled={props.project.sites.length <= 1} onClick={() => void props.onDeleteSite(site.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PagesPanel(props: {
  site: StudioSite;
  selectedPageId: string;
  onAdd: () => void;
  onDuplicate: (page: StudioPage) => void | Promise<void>;
  onDelete: (pageId: string) => void | Promise<void>;
  onMove: (pageId: string, direction: -1 | 1) => void;
  onSelect: (pageId: string) => void;
  onUpdate: (pageId: string, updater: (page: StudioPage) => StudioPage) => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>{text.tabs.pages}</h2>
          <p>{text.pagesPanelCopy}</p>
        </div>
        <button type="button" onClick={props.onAdd}>
          <Plus size={16} /> {text.addPage}
        </button>
      </div>
      <div className="table-list">
        {props.site.pages.map((page) => (
          <article key={page.id} className={page.id === props.selectedPageId ? 'row active' : 'row'}>
            <button type="button" className="link-button" onClick={() => props.onSelect(page.id)}>
              #{page.pageNumber} {page.title}
            </button>
            <input
              value={page.path}
              aria-label={text.publicPath(page.title)}
              onChange={(event) => props.onUpdate(page.id, (current) => ({ ...current, path: event.target.value }))}
              onBlur={(event) =>
                props.onUpdate(page.id, (current) => ({ ...current, path: normalizePublicPath(event.target.value, `${current.slug}.html`) }))
              }
            />
            <select
              value={page.status}
              onChange={(event) => props.onUpdate(page.id, (current) => ({ ...current, status: event.target.value as StudioPage['status'] }))}
            >
              <option value="published">{text.published}</option>
              <option value="draft">{text.draft}</option>
            </select>
            <div className="icon-actions">
              <button type="button" title={text.moveUp} onClick={() => props.onMove(page.id, -1)}>
                <MoveUp size={16} />
              </button>
              <button type="button" title={text.moveDown} onClick={() => props.onMove(page.id, 1)}>
                <MoveDown size={16} />
              </button>
              <button type="button" title={text.duplicate} onClick={() => void props.onDuplicate(page)}>
                <Copy size={16} />
              </button>
              <button type="button" title={text.delete} onClick={() => void props.onDelete(page.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EditorPanel(props: {
  project: StudioProject;
  site: StudioSite;
  page: StudioPage;
  setSelectedPageId: (id: string) => void;
  updatePage: (pageId: string, updater: (page: StudioPage) => StudioPage) => void;
  addRevealBlock: (page: StudioPage) => void;
  updateReveal: (page: StudioPage, revealId: string, patch: Partial<RevealBlock>) => void;
  addUnlockPage: (page: StudioPage) => void;
  updateUnlock: (page: StudioPage, unlockId: string, patch: Partial<UnlockPage>) => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="editor-grid">
      <aside className="editor-side">
        <h2>{text.tabs.editor}</h2>
        <p className="field-hint">{text.editorPanelCopy}</p>
        <label>
          {text.page}
          <select value={props.page.id} onChange={(event) => props.setSelectedPageId(event.target.value)}>
            {props.site.pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.pageNumber}. {page.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.title}
          <input
            value={props.page.title}
            onChange={(event) =>
              props.updatePage(props.page.id, (page) => ({
                ...page,
                title: event.target.value,
                slug: safeSlug(event.target.value, page.slug)
              }))
            }
          />
        </label>
        <label>
          {text.slug}
          <input
            value={props.page.slug}
            onChange={(event) => props.updatePage(props.page.id, (page) => ({ ...page, slug: safeSlug(event.target.value, page.slug) }))}
          />
        </label>
        <label>
          {text.theme}
          <select
            value={props.page.themeId ?? ''}
            onChange={(event) => props.updatePage(props.page.id, (page) => ({ ...page, themeId: event.target.value }))}
          >
            {props.site.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={props.page.allowScripts}
            onChange={(event) => props.updatePage(props.page.id, (page) => ({ ...page, allowScripts: event.target.checked }))}
          />
          {text.pageScriptOptIn}
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={props.project.scriptPreviewEnabled}
            disabled
          />
          {text.projectScriptPreview(props.project.scriptPreviewEnabled)}
        </label>
        <button type="button" onClick={() => props.addRevealBlock(props.page)}>
          <KeyRound size={16} /> {text.insertReveal}
        </button>
        <button type="button" onClick={() => props.addUnlockPage(props.page)}>
          <ShieldCheck size={16} /> {text.addUnlockPage}
        </button>
      </aside>

      <section className="editor-main">
        <textarea
          className="html-editor"
          value={props.page.bodyHtml}
          aria-label={text.htmlBody}
          onChange={(event) => props.updatePage(props.page.id, (page) => ({ ...page, bodyHtml: event.target.value }))}
        />
        <div className="sub-editor-grid">
          <RevealEditor page={props.page} updateReveal={props.updateReveal} />
          <UnlockEditor page={props.page} updateUnlock={props.updateUnlock} />
        </div>
      </section>

      <aside className="preview-pane">
        <h3>{text.safePreview}</h3>
        <ResizablePreviewFrame
          title={text.pagePreview}
          sandbox={getPreviewSandbox(props.project, props.page)}
          srcDoc={getPreviewHtml(props.project, props.page)}
          initialWidth={420}
          initialHeight={560}
        />
      </aside>
    </section>
  );
}

function RevealEditor({ page, updateReveal }: { page: StudioPage; updateReveal: (page: StudioPage, revealId: string, patch: Partial<RevealBlock>) => void }): JSX.Element {
  const text = useUiText();
  return (
    <section className="sub-panel">
      <h3>{text.revealBlocks}</h3>
      {page.revealBlocks.map((block) => (
        <div key={block.id} className="stack">
          <input value={block.label} onChange={(event) => updateReveal(page, block.id, { label: event.target.value })} aria-label={text.revealLabel} />
          <input value={block.prompt} onChange={(event) => updateReveal(page, block.id, { prompt: event.target.value })} aria-label={text.revealPrompt} />
          <textarea
            value={textareaList(block.answerAliases)}
            onChange={(event) => updateReveal(page, block.id, { answerAliases: parseList(event.target.value) })}
            aria-label={text.revealAliases}
          />
          <textarea
            value={block.secretHtml}
            onChange={(event) => updateReveal(page, block.id, { secretHtml: event.target.value })}
            aria-label={text.revealSecretHtml}
          />
        </div>
      ))}
    </section>
  );
}

function UnlockEditor({ page, updateUnlock }: { page: StudioPage; updateUnlock: (page: StudioPage, unlockId: string, patch: Partial<UnlockPage>) => void }): JSX.Element {
  const text = useUiText();
  return (
    <section className="sub-panel">
      <h3>{text.unlockPages}</h3>
      {page.unlockPages.map((unlock) => (
        <div key={unlock.id} className="stack">
          <input value={unlock.label} onChange={(event) => updateUnlock(page, unlock.id, { label: event.target.value })} aria-label={text.unlockLabel} />
          <input
            value={unlock.path}
            onChange={(event) => updateUnlock(page, unlock.id, { path: event.target.value })}
            onBlur={(event) => updateUnlock(page, unlock.id, { path: normalizePublicPath(event.target.value, 'unlock.html') })}
            aria-label={text.unlockPath}
          />
          <input value={unlock.prompt} onChange={(event) => updateUnlock(page, unlock.id, { prompt: event.target.value })} aria-label={text.unlockPrompt} />
          <textarea
            value={textareaList(unlock.answerAliases)}
            onChange={(event) => updateUnlock(page, unlock.id, { answerAliases: parseList(event.target.value) })}
            aria-label={text.unlockAliases}
          />
          <textarea
            value={unlock.payloadHtml}
            onChange={(event) => updateUnlock(page, unlock.id, { payloadHtml: event.target.value })}
            aria-label={text.unlockPayloadHtml}
          />
        </div>
      ))}
    </section>
  );
}

function AssetsPanel(props: {
  project: StudioProject;
  selectedPage?: StudioPage;
  addAssets: (files: FileList | null) => Promise<void>;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
  updatePage: (pageId: string, updater: (page: StudioPage) => StudioPage) => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>{text.tabs.assets}</h2>
          <p>{text.assetsPanelCopy}</p>
        </div>
        <label className="file-button">
          <Upload size={16} /> {text.uploadAssets}
          <input type="file" multiple onChange={(event) => void props.addAssets(event.currentTarget.files)} />
        </label>
      </div>
      <div className="asset-grid">
        {props.project.assets.map((asset) => (
          <article key={asset.id} className="asset-item">
            {asset.mime.startsWith('image/') ? <img src={asset.dataUrl} alt={asset.name} /> : <div className="file-icon">{asset.mime}</div>}
            <input
              value={asset.safeName}
              onChange={(event) =>
                props.updateProject((current) => ({
                  ...current,
                  assets: current.assets.map((item) => (item.id === asset.id ? { ...item, safeName: event.target.value } : item))
                }))
              }
            />
            <button
              type="button"
              disabled={!props.selectedPage}
              onClick={() =>
                props.selectedPage &&
                props.updatePage(props.selectedPage.id, (page) => ({
                  ...page,
                  bodyHtml: `${page.bodyHtml}\n<img src="assets/${asset.safeName}" alt="${asset.name}">`
                }))
              }
            >
              {text.insert}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ThemesPanel(props: {
  project: StudioProject;
  site: StudioSite;
  addTheme: () => StudioTheme;
  updateTheme: (themeId: string, patch: Partial<StudioTheme>) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
}): JSX.Element {
  const text = useUiText();
  const [selectedThemeId, setSelectedThemeId] = useState(props.site.themes[0]?.id ?? '');
  const selectedTheme = useMemo(
    () => props.site.themes.find((theme) => theme.id === selectedThemeId) ?? props.site.themes[0],
    [props.site.themes, selectedThemeId]
  );
  const defaultThemeId = props.site.themes[0]?.id;
  const themePages = useMemo(() => {
    if (!selectedTheme) return [];
    return props.site.pages.filter((page) => page.themeId === selectedTheme.id || (!page.themeId && selectedTheme.id === defaultThemeId));
  }, [defaultThemeId, props.site.pages, selectedTheme]);

  useEffect(() => {
    if (!selectedTheme && props.site.themes[0]) {
      setSelectedThemeId(props.site.themes[0].id);
    }
  }, [props.site.themes, selectedTheme]);

  function handleAddTheme(): void {
    const theme = props.addTheme();
    setSelectedThemeId(theme.id);
  }

  if (!selectedTheme) {
    return (
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>{text.cssThemes}</h2>
            <p>{text.themesPanelCopy}</p>
          </div>
          <button type="button" onClick={handleAddTheme}>
            <Plus size={16} /> {text.addTheme}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="editor-grid theme-editor-grid">
      <aside className="editor-side">
        <h2>{text.cssThemes}</h2>
        <p className="field-hint">{text.themesPanelCopy}</p>
        <label>
          {text.themeSelector}
          <select value={selectedTheme.id} onChange={(event) => setSelectedThemeId(event.target.value)}>
            {props.site.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.themeNameLabel}
          <input value={selectedTheme.name} onChange={(event) => props.updateTheme(selectedTheme.id, { name: event.target.value })} />
        </label>
        <button type="button" onClick={handleAddTheme}>
          <Plus size={16} /> {text.addTheme}
        </button>
        {props.site.themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`theme-select-item${theme.id === selectedTheme.id ? ' active' : ''}`}
            onClick={() => setSelectedThemeId(theme.id)}
          >
            <Palette size={16} />
            <span>{theme.name}</span>
          </button>
        ))}
        <label className="check-row">
          <input
            type="checkbox"
            checked={props.project.scriptPreviewEnabled}
            onChange={(event) => props.updateProject((current) => ({ ...current, scriptPreviewEnabled: event.target.checked }))}
          />
          {text.enableAdvancedScriptPreview}
        </label>
      </aside>

      <section className="editor-main">
        <label className="code-editor-label">
          {text.themeCssCode}
          <textarea
            className="html-editor css-editor"
            value={selectedTheme.css}
            aria-label={text.themeCssCode}
            spellCheck={false}
            onChange={(event) => props.updateTheme(selectedTheme.id, { css: event.target.value })}
          />
        </label>
      </section>

      <aside className="preview-pane theme-preview-pane">
        <h3>{text.themePreview}</h3>
        <ResizablePreviewFrame title={text.themePreview} sandbox="" srcDoc={getThemePreviewHtml(selectedTheme, text)} initialWidth={420} initialHeight={390} />
        <section className="theme-usage">
          <h3>{text.themeUsage}</h3>
          {themePages.length ? (
            <ul className="theme-usage-list">
              {themePages.map((page) => (
                <li key={page.id}>
                  <span>{page.pageNumber}</span>
                  <strong>{page.title}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>{text.noThemeUsage}</p>
          )}
        </section>
      </aside>
    </section>
  );
}

function getThemePreviewHtml(theme: StudioTheme, text: UiText): string {
  const body = `<main>
  <h1>${escapeHtml(text.themePreviewTitle)}</h1>
  <p>${escapeHtml(text.themePreviewLead)}</p>
  <section class="arg-widget">
    <form>
      <label>${escapeHtml(text.themePreviewPrompt)} <input autocomplete="off" value="${escapeHtml(text.themePreviewInput)}"></label>
      <button type="button">${escapeHtml(text.themePreviewButton)}</button>
    </form>
    <div aria-live="polite">${escapeHtml(text.themePreviewResult)}</div>
  </section>
  <p><a href="#">${escapeHtml(text.themePreviewLink)}</a></p>
</main>`;
  return renderThemeDocument(theme.name, body, theme.css);
}

function StoryMapPanel(props: {
  project: StudioProject;
  pageRefs: ReturnType<typeof allPageRefs>;
  addStoryMapNode: (storyMap: StudioStoryMap) => void;
  addStoryMapEdge: (storyMap: StudioStoryMap, sourceId: string, targetId: string) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
  requestConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
}): JSX.Element {
  const text = useUiText();
  const storyMap = props.project.storyMaps[0];
  const [selectedNodeId, setSelectedNodeId] = useState(storyMap.nodes[0]?.id ?? '');
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [edgeDraft, setEdgeDraft] = useState({
    sourceId: storyMap.nodes[0]?.id ?? '',
    targetId: storyMap.nodes[1]?.id ?? storyMap.nodes[0]?.id ?? ''
  });
  const selectedNode = storyMap.nodes.find((node) => node.id === selectedNodeId);
  const edgeSourceNode = storyMap.nodes.find((node) => node.id === edgeDraft.sourceId);
  const edgeTargetNode = storyMap.nodes.find((node) => node.id === edgeDraft.targetId);
  const selectedDraftEdge = storyMap.edges.find((edge) => edge.source === edgeDraft.sourceId && edge.target === edgeDraft.targetId);
  const edgeAlreadyExists = Boolean(selectedDraftEdge);
  const canCreateEdge = Boolean(edgeSourceNode && edgeTargetNode && edgeDraft.sourceId !== edgeDraft.targetId && !edgeAlreadyExists);
  const edgeStatus =
    storyMap.nodes.length < 2
      ? text.edgeNeedsTwoNodes
      : edgeDraft.sourceId === edgeDraft.targetId
        ? text.edgeSelectDifferentNodes
        : edgeAlreadyExists
          ? text.edgeAlreadyExists
          : edgeSourceNode && edgeTargetNode
            ? text.edgeReady(edgeSourceNode.label, edgeTargetNode.label)
            : text.edgeNeedsTwoNodes;

  useEffect(() => {
    setNodePositions((positions) => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const node of storyMap.nodes) {
        next[node.id] = positions[node.id] ?? { x: node.x, y: node.y };
      }
      return next;
    });
    if (!storyMap.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(storyMap.nodes[0]?.id ?? '');
    }
  }, [storyMap.nodes, selectedNodeId]);

  useEffect(() => {
    setEdgeDraft((current) => {
      const nodeIds = storyMap.nodes.map((node) => node.id);
      const sourceId = nodeIds.includes(current.sourceId) ? current.sourceId : nodeIds[0] ?? '';
      let targetId = nodeIds.includes(current.targetId) ? current.targetId : (nodeIds.find((id) => id !== sourceId) ?? nodeIds[0] ?? '');
      if (sourceId === targetId && nodeIds.length > 1) {
        targetId = nodeIds.find((id) => id !== sourceId) ?? targetId;
      }
      return sourceId === current.sourceId && targetId === current.targetId ? current : { sourceId, targetId };
    });
  }, [storyMap.nodes]);

  const nodes: Node[] = storyMap.nodes.map((node) => ({
    id: node.id,
    position: nodePositions[node.id] ?? { x: node.x, y: node.y },
    data: { label: `${node.label} · ${node.type}` },
    type: 'default',
    selected: node.id === selectedNodeId,
    className: getNodeClassName(node.id)
  }));
  const edges: Edge[] = storyMap.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: `${edge.label} · ${edge.pathRole}`,
    markerEnd: { type: MarkerType.ArrowClosed },
    className: `flow-edge path-role-${edge.pathRole}`
  }));

  function updateStoryMap(updater: (target: StudioStoryMap) => StudioStoryMap): void {
    props.updateProject((current) => ({
      ...current,
      storyMaps: current.storyMaps.map((item) => (item.id === storyMap.id ? updater(item) : item))
    }));
  }

  function updateNode(nodeId: string, patch: Partial<StoryMapNode>): void {
    updateStoryMap((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
    }));
  }

  function updateEdge(edgeId: string, patch: Partial<StoryMapEdge>): void {
    updateStoryMap((current) => ({
      ...current,
      edges: current.edges.map((edge) => (edge.id === edgeId ? { ...edge, ...patch } : edge))
    }));
  }

  function pageRefForTrigger(edge: StoryMapEdge) {
    const targetNode = storyMap.nodes.find((node) => node.id === edge.target);
    const sourceNode = storyMap.nodes.find((node) => node.id === edge.source);
    return props.pageRefs.find((ref) => ref.page.id === targetNode?.pageId) ?? props.pageRefs.find((ref) => ref.page.id === sourceNode?.pageId) ?? props.pageRefs[0];
  }

  function messengerTarget() {
    const thread = props.project.messengerThreads[0];
    return { thread, node: thread?.nodes[0] };
  }

  function defaultTrigger(edge: StoryMapEdge, type: StoryTrigger['type']): StoryTrigger {
    const ref = pageRefForTrigger(edge);
    const reveal = ref?.page.revealBlocks[0];
    const unlock = ref?.page.unlockPages[0];
    const searchRule = props.project.searchRules[0];
    const { thread, node } = messengerTarget();
    return {
      id: createId('trigger'),
      type,
      siteId: ref?.site.id,
      pageId: ref?.page.id,
      revealId: type === 'revealSolved' ? reveal?.id : undefined,
      unlockId: type === 'unlockSolved' ? unlock?.id : undefined,
      searchRuleId: type === 'searchSolved' ? searchRule?.id : undefined,
      threadId: type.startsWith('messenger') ? thread?.id : undefined,
      nodeId: type.startsWith('messenger') ? node?.id : undefined
    };
  }

  function updateTrigger(edge: StoryMapEdge, patch: Partial<StoryTrigger>): void {
    const trigger = edge.trigger ?? defaultTrigger(edge, (patch.type as StoryTrigger['type'] | undefined) ?? 'pageVisited');
    updateEdge(edge.id, { trigger: { ...trigger, ...patch } });
  }

  function updateTriggerPage(edge: StoryMapEdge, pageId: string): void {
    const ref = props.pageRefs.find((item) => item.page.id === pageId);
    updateTrigger(edge, { siteId: ref?.site.id, pageId: ref?.page.id });
  }

  function updateTriggerReveal(edge: StoryMapEdge, revealId: string): void {
    const ref = props.pageRefs.find((item) => item.page.revealBlocks.some((reveal) => reveal.id === revealId));
    updateTrigger(edge, { siteId: ref?.site.id, pageId: ref?.page.id, revealId });
  }

  function updateTriggerUnlock(edge: StoryMapEdge, unlockId: string): void {
    const ref = props.pageRefs.find((item) => item.page.unlockPages.some((unlock) => unlock.id === unlockId));
    updateTrigger(edge, { siteId: ref?.site.id, pageId: ref?.page.id, unlockId });
  }

  function defaultEffect(type: StoryEffect['type']): StoryEffect {
    const ref = props.pageRefs[0];
    const { thread, node } = messengerTarget();
    return {
      id: createId('effect'),
      type,
      flagId: type === 'setFlag' ? 'flag-1' : undefined,
      siteId: ref?.site.id,
      pageId: type === 'unlockPage' ? ref?.page.id : undefined,
      threadId: type.includes('Messenger') ? thread?.id : undefined,
      nodeId: type.includes('Messenger') ? node?.id : undefined,
      delayMs: type === 'scheduleMessengerNode' ? 3000 : undefined,
      count: type === 'setMessengerUnread' ? 1 : undefined
    };
  }

  function updateFirstEffect(edge: StoryMapEdge, patch: Partial<StoryEffect>): void {
    const effect = edge.effects[0] ?? defaultEffect((patch.type as StoryEffect['type'] | undefined) ?? 'setFlag');
    updateEdge(edge.id, { effects: [{ ...effect, ...patch }, ...edge.effects.slice(1)] });
  }

  function getNodeClassName(nodeId: string): string {
    return [
      'flow-node',
      nodeId === selectedNodeId ? 'selected' : '',
      nodeId === edgeDraft.sourceId ? 'edge-source' : '',
      nodeId === edgeDraft.targetId ? 'edge-target' : ''
    ]
      .filter(Boolean)
      .join(' ');
  }

  function getRowClassName(nodeId: string): string {
    return [
      'row',
      nodeId === selectedNodeId ? 'active' : '',
      nodeId === edgeDraft.sourceId ? 'edge-source' : '',
      nodeId === edgeDraft.targetId ? 'edge-target' : ''
    ]
      .filter(Boolean)
      .join(' ');
  }

  async function deleteNode(node: StoryMapNode): Promise<void> {
    const confirmed = await props.requestConfirmation({
      title: text.deleteFlowNode(node.label),
      message: text.deleteFlowNodeConfirm(node.label),
      confirmLabel: text.delete,
      tone: 'danger'
    });
    if (!confirmed) return;
    setNodePositions((positions) => {
      const next = { ...positions };
      delete next[node.id];
      return next;
    });
    updateStoryMap((current) => ({
      ...current,
      nodes: current.nodes.filter((target) => target.id !== node.id),
      edges: current.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id)
    }));
  }

  async function deleteSelectedEdge(): Promise<void> {
    if (!selectedDraftEdge || !edgeSourceNode || !edgeTargetNode) return;
    const confirmed = await props.requestConfirmation({
      title: text.deleteEdge,
      message: text.deleteEdgeConfirm(edgeSourceNode.label, edgeTargetNode.label),
      confirmLabel: text.deleteEdge,
      tone: 'danger'
    });
    if (!confirmed) return;
    updateStoryMap((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== selectedDraftEdge.id) }));
  }

  return (
    <section className="flow-layout">
      <div className="section-head">
        <div>
          <h2>{text.tabs.storyMap}</h2>
          <p>{text.storyMapPanelCopy}</p>
          <small className="field-hint">{selectedNode ? text.selectedFlowNode(selectedNode.label) : text.noFlowNodeSelected}</small>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => props.addStoryMapNode(storyMap)}>
            <Plus size={16} /> {text.addNode}
          </button>
        </div>
      </div>
      <div className="flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          nodesDraggable
          nodesConnectable={false}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onNodeDrag={(_, node) => {
            setSelectedNodeId(node.id);
            setNodePositions((positions) => ({ ...positions, [node.id]: node.position }));
          }}
          onNodeDragStop={(_, node) => {
            setSelectedNodeId(node.id);
            setNodePositions((positions) => ({ ...positions, [node.id]: node.position }));
            updateNode(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) });
          }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <div className="flow-edge-editor" aria-label={text.edgeEditorTitle}>
        <div className="flow-edge-copy">
          <strong>{text.edgeEditorTitle}</strong>
          <span>{edgeStatus}</span>
        </div>
        <label className="flow-edge-field source">
          <span>{text.edgeSource}</span>
          <select
            value={edgeDraft.sourceId}
            aria-label={text.edgeSource}
            onChange={(event) => {
              const sourceId = event.target.value;
              setEdgeDraft((current) => ({
                sourceId,
                targetId: current.targetId === sourceId ? (storyMap.nodes.find((node) => node.id !== sourceId)?.id ?? current.targetId) : current.targetId
              }));
            }}
          >
            {storyMap.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.id === edgeDraft.sourceId ? text.edgeSourceOption(node.label) : node.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flow-edge-field target">
          <span>{text.edgeTarget}</span>
          <select value={edgeDraft.targetId} aria-label={text.edgeTarget} onChange={(event) => setEdgeDraft((current) => ({ ...current, targetId: event.target.value }))}>
            {storyMap.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.id === edgeDraft.targetId ? text.edgeTargetOption(node.label) : node.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flow-edge-actions">
          <button type="button" disabled={!canCreateEdge} onClick={() => props.addStoryMapEdge(storyMap, edgeDraft.sourceId, edgeDraft.targetId)}>
            <Plus size={16} /> {text.addEdge}
          </button>
          <button type="button" className="danger-action" disabled={!selectedDraftEdge} onClick={() => void deleteSelectedEdge()}>
            <Trash2 size={16} /> {text.deleteEdge}
          </button>
        </div>
      </div>
      <div className="flow-table">
        {storyMap.nodes.map((node) => (
          <div key={node.id} className={getRowClassName(node.id)} onFocus={() => setSelectedNodeId(node.id)}>
            <input value={node.label} aria-label={text.flowNodeLabel(node.label)} onChange={(event) => updateNode(node.id, { label: event.target.value })} />
            <select value={node.type} aria-label={text.storyMapNodeType} onChange={(event) => updateNode(node.id, { type: event.target.value as StoryMapNode['type'] })}>
              {['site', 'page', 'clue', 'discovery', 'action', 'gate', 'external_surface', 'messenger', 'state_change', 'custom'].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              value={node.pageId ?? ''}
              aria-label={text.flowNodePage(node.label)}
              onChange={(event) => {
                const ref = props.pageRefs.find((item) => item.page.id === event.target.value);
                updateNode(node.id, {
                  type: ref ? 'page' : node.type,
                  siteId: ref?.site.id,
                  pageId: ref?.page.id,
                  linkedEntity: ref ? { kind: 'page', siteId: ref.site.id, pageId: ref.page.id, id: ref.page.id } : undefined
                });
              }}
            >
              <option value="">{text.noPage}</option>
              {props.pageRefs.map(({ site, page }) => (
                <option key={page.id} value={page.id}>
                  {site.name} / {page.title}
                </option>
              ))}
            </select>
            <input value={node.tags.join(', ')} aria-label={text.storyMapTags} onChange={(event) => updateNode(node.id, { tags: parseList(event.target.value) })} />
            <textarea value={node.notes} aria-label={text.storyMapNotes} onChange={(event) => updateNode(node.id, { notes: event.target.value })} />
            <div className="icon-actions">
              <button type="button" className="danger-action" title={text.deleteFlowNode(node.label)} aria-label={text.deleteFlowNode(node.label)} onClick={() => void deleteNode(node)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {storyMap.edges.length > 0 && (
        <div className="flow-table">
          {storyMap.edges.map((edge) => {
            const effect = edge.effects[0];
            return (
              <div key={edge.id} className={`row path-role-${edge.pathRole}`}>
                <input value={edge.label} onChange={(event) => updateEdge(edge.id, { label: event.target.value })} />
                <select value={edge.action} aria-label={text.storyMapEdgeAction} onChange={(event) => updateEdge(edge.id, { action: event.target.value as StoryMapEdge['action'] })}>
                  {['read', 'notice', 'search_web', 'search_social', 'enter_url', 'move_site', 'solve_cipher', 'submit_keyword', 'combine_clues', 'wait', 'receive_message', 'custom'].map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
                <select value={edge.pathRole} aria-label={text.storyMapPathRole} onChange={(event) => updateEdge(edge.id, { pathRole: event.target.value as StoryMapEdge['pathRole'] })}>
                  {['intended', 'alternate', 'shortcut_allowed', 'recovery', 'risk'].map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <input value={edge.fallbackHint ?? ''} placeholder={text.optionalPublicHint} onChange={(event) => updateEdge(edge.id, { fallbackHint: event.target.value })} />
                <select
                  value={edge.trigger?.type ?? ''}
                  aria-label={text.storyMapTriggerType}
                  onChange={(event) => {
                    const type = event.target.value as StoryTrigger['type'] | '';
                    updateEdge(edge.id, { trigger: type ? defaultTrigger(edge, type) : undefined });
                  }}
                >
                  <option value="">{text.storyMapNoTrigger}</option>
                  {['pageVisited', 'revealSolved', 'unlockSolved', 'searchSolved', 'messengerThreadOpened', 'messengerNodeDelivered', 'messengerNodeReached'].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                {edge.trigger?.type === 'pageVisited' && (
                  <select value={edge.trigger.pageId ?? ''} aria-label={text.storyMapTriggerPage} onChange={(event) => updateTriggerPage(edge, event.target.value)}>
                    {props.pageRefs.map(({ site, page }) => (
                      <option key={page.id} value={page.id}>
                        {site.name} / {page.title}
                      </option>
                    ))}
                  </select>
                )}
                {edge.trigger?.type === 'searchSolved' && (
                  <select value={edge.trigger.searchRuleId ?? ''} aria-label={text.storyMapTriggerSearch} onChange={(event) => updateTrigger(edge, { searchRuleId: event.target.value })}>
                    {props.project.searchRules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.label}
                      </option>
                    ))}
                  </select>
                )}
                {edge.trigger?.type === 'revealSolved' && (
                  <select value={edge.trigger.revealId ?? ''} aria-label={text.storyMapTriggerReveal} onChange={(event) => updateTriggerReveal(edge, event.target.value)}>
                    {props.pageRefs.flatMap(({ site, page }) =>
                      page.revealBlocks.map((reveal) => (
                        <option key={reveal.id} value={reveal.id}>
                          {site.name} / {page.title} / {reveal.label}
                        </option>
                      ))
                    )}
                  </select>
                )}
                {edge.trigger?.type === 'unlockSolved' && (
                  <select value={edge.trigger.unlockId ?? ''} aria-label={text.storyMapTriggerUnlock} onChange={(event) => updateTriggerUnlock(edge, event.target.value)}>
                    {props.pageRefs.flatMap(({ site, page }) =>
                      page.unlockPages.map((unlock) => (
                        <option key={unlock.id} value={unlock.id}>
                          {site.name} / {page.title} / {unlock.label}
                        </option>
                      ))
                    )}
                  </select>
                )}
                {edge.trigger?.type?.startsWith('messenger') && (
                  <>
                    <select value={edge.trigger.threadId ?? ''} aria-label={text.storyMapEffectThread} onChange={(event) => updateTrigger(edge, { threadId: event.target.value })}>
                      {props.project.messengerThreads.map((thread) => (
                        <option key={thread.id} value={thread.id}>
                          {thread.title}
                        </option>
                      ))}
                    </select>
                    <select value={edge.trigger.nodeId ?? ''} aria-label={text.storyMapEffectNode} onChange={(event) => updateTrigger(edge, { nodeId: event.target.value })}>
                      {props.project.messengerThreads
                        .find((thread) => thread.id === edge.trigger?.threadId)
                        ?.nodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.body || node.kind}
                          </option>
                        ))}
                    </select>
                  </>
                )}
                <select
                  value={effect?.type ?? ''}
                  aria-label={text.storyMapEffectType}
                  onChange={(event) => {
                    const type = event.target.value as StoryEffect['type'] | '';
                    updateEdge(edge.id, { effects: type ? [defaultEffect(type), ...edge.effects.slice(1)] : edge.effects.slice(1) });
                  }}
                >
                  <option value="">{text.storyMapNoEffect}</option>
                  {['setFlag', 'unlockPage', 'deliverMessengerNode', 'scheduleMessengerNode', 'setMessengerUnread', 'jumpMessengerNode'].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                {effect?.type === 'setFlag' && (
                  <input value={effect.flagId ?? ''} aria-label={text.storyMapEffectFlag} onChange={(event) => updateFirstEffect(edge, { flagId: event.target.value })} />
                )}
                {effect?.type === 'unlockPage' && (
                  <select value={effect.pageId ?? ''} aria-label={text.storyMapEffectPage} onChange={(event) => {
                    const ref = props.pageRefs.find((item) => item.page.id === event.target.value);
                    updateFirstEffect(edge, { siteId: ref?.site.id, pageId: ref?.page.id });
                  }}>
                    {props.pageRefs.map(({ site, page }) => (
                      <option key={page.id} value={page.id}>
                        {site.name} / {page.title}
                      </option>
                    ))}
                  </select>
                )}
                {effect?.type?.includes('Messenger') && (
                  <>
                    <select value={effect.threadId ?? ''} aria-label={text.storyMapEffectThread} onChange={(event) => updateFirstEffect(edge, { threadId: event.target.value })}>
                      {props.project.messengerThreads.map((thread) => (
                        <option key={thread.id} value={thread.id}>
                          {thread.title}
                        </option>
                      ))}
                    </select>
                    <select value={effect.nodeId ?? ''} aria-label={text.storyMapEffectNode} onChange={(event) => updateFirstEffect(edge, { nodeId: event.target.value })}>
                      {props.project.messengerThreads
                        .find((thread) => thread.id === effect.threadId)
                        ?.nodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.body || node.kind}
                          </option>
                        ))}
                    </select>
                  </>
                )}
                {effect?.type === 'scheduleMessengerNode' && (
                  <input
                    type="number"
                    min={0}
                    value={effect.delayMs ?? 0}
                    aria-label={text.storyMapEffectDelay}
                    onChange={(event) => updateFirstEffect(edge, { delayMs: Number(event.target.value) })}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MessengerPanel(props: {
  project: StudioProject;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
}): JSX.Element {
  const text = useUiText();
  function addThread(): void {
    const participantId = createId('participant');
    const thread: MessengerThread = {
      id: createId('thread'),
      title: `${text.messengerThreads} ${props.project.messengerThreads.length + 1}`,
      participants: [{ id: participantId, name: 'Unknown Contact', role: 'character' }],
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
    props.updateProject((current) => ({ ...current, messengerThreads: [...current.messengerThreads, thread] }));
  }

  function updateThread(threadId: string, patch: Partial<MessengerThread>): void {
    props.updateProject((current) => ({
      ...current,
      messengerThreads: current.messengerThreads.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread))
    }));
  }

  function updateNode(threadId: string, nodeId: string, patch: Partial<MessengerNode>): void {
    props.updateProject((current) => ({
      ...current,
      messengerThreads: current.messengerThreads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              nodes: thread.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
            }
          : thread
      )
    }));
  }

  function addMessage(thread: MessengerThread): void {
    const senderId = thread.participants[0]?.id ?? createId('participant');
    const node: MessengerNode = {
      id: createId('message'),
      senderId,
      kind: 'text',
      body: '',
      choices: [],
      matchers: [],
      effects: []
    };
    updateThread(thread.id, { nodes: [...thread.nodes, node] });
  }

  function defaultChoice(thread: MessengerThread) {
    return {
      id: createId('choice'),
      label: 'Continue',
      targetNodeId: thread.nodes[0]?.id,
      effects: []
    };
  }

  function defaultMatcher(thread: MessengerThread) {
    return {
      id: createId('match'),
      label: 'Answer',
      terms: [],
      mode: 'exact' as MatchMode,
      targetNodeId: thread.nodes[0]?.id,
      effects: []
    };
  }

  function updateNodeKind(thread: MessengerThread, node: MessengerNode, kind: MessengerNode['kind']): void {
    updateNode(thread.id, node.id, {
      kind,
      choices: kind === 'choice' || kind === 'delay' ? (node.choices.length ? node.choices : [defaultChoice(thread)]) : node.choices,
      matchers: kind === 'input' ? (node.matchers.length ? node.matchers : [defaultMatcher(thread)]) : node.matchers,
      delayMs: kind === 'delay' ? (node.delayMs ?? 3000) : node.delayMs
    });
  }

  function updateFirstChoice(thread: MessengerThread, node: MessengerNode, patch: Partial<MessengerNode['choices'][number]>): void {
    const choice = node.choices[0] ?? defaultChoice(thread);
    updateNode(thread.id, node.id, { choices: [{ ...choice, ...patch }, ...node.choices.slice(1)] });
  }

  function updateFirstMatcher(thread: MessengerThread, node: MessengerNode, patch: Partial<MessengerNode['matchers'][number]>): void {
    const matcher = node.matchers[0] ?? defaultMatcher(thread);
    updateNode(thread.id, node.id, { matchers: [{ ...matcher, ...patch }, ...node.matchers.slice(1)] });
  }

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>{text.messengerThreads}</h2>
          <p>{text.messengerPanelCopy}</p>
        </div>
        <button type="button" onClick={addThread}>
          <Plus size={16} /> {text.addThread}
        </button>
      </div>
      <div className="rule-grid">
        {props.project.messengerThreads.map((thread) => (
          <article key={thread.id} className="rule-editor">
            <input value={thread.title} onChange={(event) => updateThread(thread.id, { title: event.target.value })} />
            <button type="button" onClick={() => addMessage(thread)}>
              <Plus size={16} /> {text.addMessage}
            </button>
            {thread.nodes.map((node) => (
              <div key={node.id} className="stack">
                <select value={node.kind} onChange={(event) => updateNodeKind(thread, node, event.target.value as MessengerNode['kind'])}>
                  {['text', 'choice', 'input', 'delay', 'system'].map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
                <textarea value={node.body} aria-label={text.messageBody} onChange={(event) => updateNode(thread.id, node.id, { body: event.target.value })} />
                {(node.kind === 'choice' || node.kind === 'delay') && (
                  <div className="inline-grid">
                    {node.kind === 'choice' && (
                      <input
                        value={node.choices[0]?.label ?? ''}
                        aria-label={text.messengerChoiceLabel}
                        onChange={(event) => updateFirstChoice(thread, node, { label: event.target.value })}
                      />
                    )}
                    <select
                      value={node.choices[0]?.targetNodeId ?? ''}
                      aria-label={text.messengerChoiceTarget}
                      onChange={(event) => updateFirstChoice(thread, node, { targetNodeId: event.target.value })}
                    >
                      {thread.nodes.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.body || target.kind}
                        </option>
                      ))}
                    </select>
                    {node.kind === 'delay' && (
                      <input
                        type="number"
                        min={0}
                        value={node.delayMs ?? 0}
                        aria-label={text.messengerDelayMs}
                        onChange={(event) => updateNode(thread.id, node.id, { delayMs: Number(event.target.value) })}
                      />
                    )}
                  </div>
                )}
                {node.kind === 'input' && (
                  <div className="inline-grid">
                    <textarea
                      value={textareaList(node.matchers[0]?.terms ?? [])}
                      aria-label={text.messengerInputTerms}
                      onChange={(event) => updateFirstMatcher(thread, node, { terms: parseList(event.target.value) })}
                    />
                    <select value={node.matchers[0]?.mode ?? 'exact'} onChange={(event) => updateFirstMatcher(thread, node, { mode: event.target.value as MatchMode })}>
                      <option value="exact">{text.exactMatch}</option>
                      <option value="contains">{text.containsMatch}</option>
                    </select>
                    <select
                      value={node.matchers[0]?.targetNodeId ?? ''}
                      aria-label={text.messengerChoiceTarget}
                      onChange={(event) => updateFirstMatcher(thread, node, { targetNodeId: event.target.value })}
                    >
                      {thread.nodes.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.body || target.kind}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() =>
                      updateNode(thread.id, node.id, {
                        protectedMessage: node.protectedMessage
                          ? undefined
                          : { prompt: text.keyDefault, answerAliases: [], secretBody: '', failureMessage: text.genericFailure }
                      })
                    }
                  >
                    <KeyRound size={16} /> {node.protectedMessage ? text.messengerRemoveProtected : text.messengerAddProtected}
                  </button>
                </div>
                {node.protectedMessage && (
                  <div className="inline-grid">
                    <input
                      value={node.protectedMessage.prompt}
                      aria-label={text.messengerProtectedPrompt}
                      onChange={(event) => updateNode(thread.id, node.id, { protectedMessage: { ...node.protectedMessage!, prompt: event.target.value } })}
                    />
                    <textarea
                      value={textareaList(node.protectedMessage.answerAliases)}
                      aria-label={text.messengerProtectedAnswers}
                      onChange={(event) => updateNode(thread.id, node.id, { protectedMessage: { ...node.protectedMessage!, answerAliases: parseList(event.target.value) } })}
                    />
                    <textarea
                      value={node.protectedMessage.secretBody}
                      aria-label={text.messengerProtectedSecret}
                      onChange={(event) => updateNode(thread.id, node.id, { protectedMessage: { ...node.protectedMessage!, secretBody: event.target.value } })}
                    />
                  </div>
                )}
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

function SearchPanel(props: {
  project: StudioProject;
  pageRefs: ReturnType<typeof allPageRefs>;
  addSearchRule: () => void;
  updateSearchRule: (ruleId: string, patch: Partial<SearchRule>) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>{text.encryptedSearch}</h2>
          <p>{text.searchPanelCopy}</p>
        </div>
        <button type="button" onClick={props.addSearchRule}>
          <Plus size={16} /> {text.addRule}
        </button>
      </div>
      <div className="rule-grid">
        {props.project.searchRules.map((rule) => (
          <article key={rule.id} className="rule-editor">
            <input value={rule.label} onChange={(event) => props.updateSearchRule(rule.id, { label: event.target.value })} />
            <select value={rule.mode} onChange={(event) => props.updateSearchRule(rule.id, { mode: event.target.value as MatchMode })}>
              <option value="exact">{text.exactMatch}</option>
              <option value="contains">{text.containsMatch}</option>
            </select>
            <select value={rule.targetPageId} onChange={(event) => props.updateSearchRule(rule.id, { targetPageId: event.target.value })}>
              {props.pageRefs.map(({ site, page }) => (
                <option key={page.id} value={page.id}>
                  {site.name} / {page.title}
                </option>
              ))}
            </select>
            <textarea value={textareaList(rule.terms)} onChange={(event) => props.updateSearchRule(rule.id, { terms: parseList(event.target.value) })} />
            <textarea value={textareaList(rule.aliases)} onChange={(event) => props.updateSearchRule(rule.id, { aliases: parseList(event.target.value) })} />
            <input value={rule.hint} placeholder={text.optionalPublicHint} onChange={(event) => props.updateSearchRule(rule.id, { hint: event.target.value })} />
          </article>
        ))}
      </div>
    </section>
  );
}

function ConditionsPanel(props: {
  project: StudioProject;
  pageRefs: ReturnType<typeof allPageRefs>;
  addCondition: () => void;
  updateCondition: (conditionId: string, patch: Partial<StudioCondition>) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>{text.conditionsRoutes}</h2>
          <p>{text.conditionsPanelCopy}</p>
        </div>
        <button type="button" onClick={props.addCondition}>
          <Plus size={16} /> {text.addRoute}
        </button>
      </div>
      <div className="rule-grid">
        {props.project.conditions.map((condition) => (
          <article key={condition.id} className="rule-editor">
            <input value={condition.label} onChange={(event) => props.updateCondition(condition.id, { label: event.target.value })} />
            <select value={condition.sourcePageId} onChange={(event) => props.updateCondition(condition.id, { sourcePageId: event.target.value })}>
              {props.pageRefs.map(({ site, page }) => (
                <option key={page.id} value={page.id}>
                  {text.fromPage(`${site.name} / ${page.title}`)}
                </option>
              ))}
            </select>
            <select value={condition.targetPageId} onChange={(event) => props.updateCondition(condition.id, { targetPageId: event.target.value })}>
              {props.pageRefs.map(({ site, page }) => (
                <option key={page.id} value={page.id}>
                  {text.toPage(`${site.name} / ${page.title}`)}
                </option>
              ))}
            </select>
            <input value={condition.publicHint} onChange={(event) => props.updateCondition(condition.id, { publicHint: event.target.value })} />
            <textarea value={condition.internalNote} onChange={(event) => props.updateCondition(condition.id, { internalNote: event.target.value })} />
          </article>
        ))}
      </div>
    </section>
  );
}

function ExportPanel(props: {
  project: StudioProject;
  selectedSite: StudioSite;
  exportState: string;
  exportBackup: () => Promise<void>;
  exportSourceBackup: () => Promise<void>;
  importBackup: (file?: File) => Promise<void>;
  importSource: (file?: File) => Promise<void>;
  importYacho: (file?: File) => Promise<void>;
  updateStoryNamespace: (storyNamespace: string) => void;
  exportPublic: (siteId?: string) => Promise<void>;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="export-grid">
      <div className="notice-panel export-intro-panel">
        <div>
          <span className="section-kicker">{text.tabs.export}</span>
          <h2>{text.tabs.export}</h2>
          <p>{text.exportPanelCopy}</p>
        </div>
      </div>
      <div className="export-panel">
        <h2>{text.projectBackup}</h2>
        <p>{text.projectBackupCopy}</p>
        <button type="button" onClick={() => void props.exportBackup()}>
          <Download size={16} /> {text.exportBackupZip}
        </button>
        <button type="button" onClick={() => void props.exportSourceBackup()}>
          <Archive size={16} /> {text.exportSourceZip}
        </button>
        <label className="file-button">
          <FolderOpen size={16} /> {text.importBackupZip}
          <input type="file" accept=".zip" onChange={(event) => void props.importBackup(event.currentTarget.files?.[0])} />
        </label>
        <label className="file-button">
          <Upload size={16} /> {text.importSourceZip}
          <input
            type="file"
            accept=".zip"
            aria-label={text.importSourceZip}
            onChange={(event) => {
              void props.importSource(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </label>
        <p className="source-zip-warning">
          <AlertTriangle size={16} />
          <span>{text.sourceZipPlaintextWarning}</span>
        </p>
      </div>
      <div className="export-panel">
        <h2>{text.storyStatePanelTitle}</h2>
        <p>{text.storyStatePanelCopy}</p>
        <label>
          {text.storyNamespace}
          <input
            value={props.project.storyNamespace}
            onChange={(event) => props.updateStoryNamespace(safeSlug(event.target.value, props.project.id))}
            aria-label={text.storyNamespace}
          />
        </label>
        <p className="field-hint">{text.storyNamespaceCopy}</p>
      </div>
      <div className="export-panel">
        <h2>{text.publicStaticSite}</h2>
        <p>{text.publicStaticSiteCopy}</p>
        <button type="button" onClick={() => void props.exportPublic()}>
          <ShieldCheck size={16} /> {text.exportProjectPublicZip}
        </button>
        <button type="button" onClick={() => void props.exportPublic(props.selectedSite.id)}>
          <Globe2 size={16} /> {text.exportSelectedSitePublicZip(props.selectedSite.name)}
        </button>
      </div>
      <div className="export-panel">
        <h2>{text.yachoImport}</h2>
        <p>{text.yachoImportCopy}</p>
        <label className="file-button">
          <Upload size={16} /> {text.importYachoZip}
          <input type="file" accept=".zip" onChange={(event) => void props.importYacho(event.currentTarget.files?.[0])} />
        </label>
      </div>
      <div className="notice-panel">
        <h3>{text.cloudflareDeployment}</h3>
        <p>{text.cloudflareAppCopy}</p>
        <p>{text.cloudflarePublicCopy}</p>
        <strong>{props.exportState}</strong>
      </div>
    </section>
  );
}

function SourceImportIssueGroup(props: {
  title: string;
  emptyText: string;
  issues: SourceZipIssue[];
  tone: 'error' | 'warning' | 'repair';
}): JSX.Element {
  return (
    <div className={`source-issue-group ${props.tone}`}>
      <strong>{props.title}</strong>
      {props.issues.length ? (
        <ul>
          {props.issues.map((issue, index) => (
            <li key={`${issue.kind}-${issue.path ?? 'project'}-${index}`}>
              {issue.path && <code>{issue.path}</code>}
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{props.emptyText}</p>
      )}
    </div>
  );
}
