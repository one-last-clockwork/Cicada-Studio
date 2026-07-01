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
import { createId, createPage, createProject, nowIso, touchProject } from './lib/projects/createProject';
import { deleteProject as deleteStoredProject, listProjects, saveProject } from './lib/db/projectsDb';
import { normalizeAssetPath, normalizePublicPath, safeSlug } from './lib/path-safety/pathSafety';
import { downloadBlob } from './lib/zip/blob';
import { splitTermList } from './lib/crypto/normalization';
import type {
  FlowEdge,
  FlowNode,
  MatchMode,
  RevealBlock,
  SearchRule,
  StudioAsset,
  StudioCondition,
  StudioFlowchart,
  StudioPage,
  StudioProject,
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
  const [selectedPageId, setSelectedPageId] = useState(project.pages[0]?.id ?? '');
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

  useEffect(() => {
    let alive = true;
    listProjects()
      .then(async (projects) => {
        if (!alive) return;
        const active = projects[0] ?? createProject(UI_TEXT.ja.defaultProjectName);
        setProject(active);
        setKnownProjects(projects.length ? projects : [active]);
        setSelectedPageId(active.pages[0]?.id ?? '');
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
    () => project.pages.find((page) => page.id === selectedPageId) ?? project.pages[0],
    [project.pages, selectedPageId]
  );

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
    updateProject((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === pageId ? updater(page) : page))
    }));
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
    setSelectedPageId(next.pages[0]?.id ?? '');
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
      setSelectedPageId(next.pages[0]?.id ?? '');
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
      setSelectedPageId(next.pages[0]?.id ?? '');
      setLoadState(text.loaded(next.name));
      setSaveState(text.deletedProject(deletedName));
    } catch (error: unknown) {
      setSaveState(error instanceof Error ? error.message : text.autosaveFailed);
    }
  }

  function addPage(): void {
    const slug = uniquePageSlug(`page-${project.pages.length + 1}`, project.pages, `page-${project.pages.length + 1}`);
    const page = createPage({
      title: text.newPageTitle(project.pages.length + 1),
      slug,
      path: uniquePagePath(`${slug}.html`, project.pages, `${slug}.html`),
      pageNumber: project.pages.length + 1,
      themeId: project.themes[0]?.id
    });
    updateProject((current) => ({ ...current, pages: [...current.pages, page] }));
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
    const slug = uniquePageSlug(`${page.slug}-copy`, project.pages, 'copy');
    const copy = {
      ...page,
      id: createId('page'),
      title: `${page.title} ${text.duplicateSuffix}`,
      slug,
      path: uniquePagePath(`${slug}.html`, project.pages, 'copy.html'),
      pageNumber: project.pages.length + 1
    };
    updateProject((current) => ({ ...current, pages: [...current.pages, copy] }));
    setSelectedPageId(copy.id);
  }

  async function deletePage(pageId: string): Promise<void> {
    if (project.pages.length === 1) {
      return;
    }
    const targetPage = project.pages.find((page) => page.id === pageId);
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
      const pages = current.pages.filter((page) => page.id !== pageId).map((page, index) => ({ ...page, pageNumber: index + 1 }));
      return {
        ...current,
        pages,
        searchRules: current.searchRules.filter((rule) => rule.targetPageId !== pageId),
        conditions: current.conditions.filter((condition) => condition.sourcePageId !== pageId && condition.targetPageId !== pageId),
        flowcharts: current.flowcharts.map((flowchart) => ({
          ...flowchart,
          nodes: flowchart.nodes.map((node) => (node.pageId === pageId ? { ...node, pageId: undefined } : node))
        }))
      };
    });
    setSelectedPageId(project.pages.find((page) => page.id !== pageId)?.id ?? '');
  }

  function movePage(pageId: string, direction: -1 | 1): void {
    updateProject((current) => {
      const pages = [...current.pages];
      const index = pages.findIndex((page) => page.id === pageId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= pages.length) {
        return current;
      }
      [pages[index], pages[next]] = [pages[next], pages[index]];
      return { ...current, pages: pages.map((page, pageIndex) => ({ ...page, pageNumber: pageIndex + 1 })) };
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
      name: text.themeName(project.themes.length + 1),
      css: 'body { background: #fffdf8; color: #24272d; }'
    };
    updateProject((current) => ({ ...current, themes: [...current.themes, theme] }));
    return theme;
  }

  function updateTheme(themeId: string, patch: Partial<StudioTheme>): void {
    updateProject((current) => ({
      ...current,
      themes: current.themes.map((theme) => (theme.id === themeId ? { ...theme, ...patch } : theme))
    }));
  }

  function addFlowNode(flow: StudioFlowchart): void {
    const node: FlowNode = {
      id: createId('node'),
      label: text.flowNode(flow.nodes.length + 1),
      pageId: selectedPage?.id,
      x: 90 + (flow.nodes.length % 4) * 220,
      y: 100 + Math.floor(flow.nodes.length / 4) * 130
    };
    updateProject((current) => ({
      ...current,
      flowcharts: current.flowcharts.map((item) => (item.id === flow.id ? { ...item, nodes: [...item.nodes, node] } : item))
    }));
  }

  function addFlowEdge(flow: StudioFlowchart, sourceId: string, targetId: string): void {
    if (!sourceId || !targetId || sourceId === targetId || flow.edges.some((edge) => edge.source === sourceId && edge.target === targetId)) return;
    const edge: FlowEdge = {
      id: createId('edge'),
      source: sourceId,
      target: targetId,
      label: text.routeLabel
    };
    updateProject((current) => ({
      ...current,
      flowcharts: current.flowcharts.map((item) => (item.id === flow.id ? { ...item, edges: [...item.edges, edge] } : item))
    }));
  }

  function addSearchRule(): void {
    const targetPageId = selectedPage?.id ?? project.pages[0]?.id ?? '';
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
    const first = project.pages[0]?.id ?? '';
    const second = project.pages[1]?.id ?? first;
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
    setSelectedPageId(imported.pages[0]?.id ?? '');
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
      setSelectedPageId(next.pages[0]?.id ?? '');
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
      setSelectedPageId(next.pages[0]?.id ?? '');
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
    setSelectedPageId(imported.pages[0]?.id ?? '');
    setExportState(text.importedYacho(file.name));
  }

  async function exportPublic(): Promise<void> {
    setExportState(text.buildingPublicZip);
    const blob = await buildPublicExportZip(project);
    const check = await checkPublicExportZip(blob, project);
    if (!check.ok) {
      setExportState(text.publicExportBlocked(check.findings.map((finding) => finding.reason).join('; ')));
      return;
    }
    downloadBlob(blob, `${safeSlug(project.name, 'public-site')}-public.zip`);
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
                selectedPageId={selectedPage?.id ?? ''}
                onSelectPage={setSelectedPageId}
                onAddPage={addPage}
                setTab={setSelectedTab}
              />
            )}
            {selectedTab === 'pages' && (
              <PagesPanel
                project={project}
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
            {selectedTab === 'themes' && <ThemesPanel project={project} addTheme={addTheme} updateTheme={updateTheme} updateProject={updateProject} />}
            {selectedTab === 'flowchart' && (
              <FlowchartPanel
                project={project}
                addFlowNode={addFlowNode}
                addFlowEdge={addFlowEdge}
                updateProject={updateProject}
                requestConfirmation={requestConfirmation}
              />
            )}
            {selectedTab === 'search' && (
              <SearchPanel project={project} addSearchRule={addSearchRule} updateSearchRule={updateSearchRule} updateProject={updateProject} />
            )}
            {selectedTab === 'conditions' && (
              <ConditionsPanel project={project} addCondition={addCondition} updateCondition={updateCondition} updateProject={updateProject} />
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
  pages: FileText,
  editor: FilePlus,
  assets: Image,
  themes: Palette,
  flowchart: GitBranch,
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
    { label: text.navOverview, tabs: ['intro', 'projects', 'dashboard', 'pages', 'flowchart'] },
    { label: text.navWriting, tabs: ['editor', 'assets', 'themes'] },
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
      <div className="local-card">
        <strong>
          <ShieldCheck size={18} /> {text.localFirst}
        </strong>
        <span>{text.localFirstCopy}</span>
        <ul>
          <li>
            <CheckCircle2 size={15} /> {text.noNetwork}
          </li>
          <li>
            <CheckCircle2 size={15} /> {text.manualExport}
          </li>
        </ul>
        <button type="button" onClick={() => onSelectTab('export')}>
          {text.securityAbout}
        </button>
      </div>
    </aside>
  );
}

function getTabCount(project: StudioProject, tab: StudioTab): number | null {
  switch (tab) {
    case 'pages':
      return project.pages.length;
    case 'assets':
      return project.assets.length;
    case 'flowchart':
      return project.flowcharts[0]?.nodes.length ?? 0;
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
                    {item.pages.length} {text.metricPages} · {text.projectUpdated(formatDate(item.updatedAt))}
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
  selectedPageId,
  onSelectPage,
  onAddPage,
  setTab
}: {
  project: StudioProject;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  setTab: (tab: StudioTab) => void;
}): JSX.Element {
  const text = useUiText();
  const selectedPage = project.pages.find((page) => page.id === selectedPageId) ?? project.pages[0];
  const published = project.pages.filter((page) => page.status === 'published').length;
  const draft = project.pages.length - published;
  const unlockCount = project.pages.reduce((count, page) => count + page.unlockPages.length, 0);
  const clueCount = project.searchRules.length + project.conditions.length + project.pages.reduce((count, page) => count + page.revealBlocks.length, 0);
  const checks = [
    project.pages.every((page) => page.title.trim() && stripHtml(page.bodyHtml).length > 0),
    project.searchRules.length > 0 || project.conditions.length > 0 || project.pages.some((page) => page.revealBlocks.length > 0 || page.unlockPages.length > 0),
    project.pages.every((page) => page.path.trim().endsWith('.html')),
    project.snapshots.length > 0
  ];
  const readiness = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const selectedRules = selectedPage ? project.searchRules.filter((rule) => rule.targetPageId === selectedPage.id) : [];
  const selectedConditions = selectedPage
    ? project.conditions.filter((condition) => condition.sourcePageId === selectedPage.id || condition.targetPageId === selectedPage.id)
    : [];
  const flowNodes = project.flowcharts[0]?.nodes ?? [];

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
        <Metric icon={FileText} label={text.totalPages} value={`${project.pages.length}`} detail={text.metricPages} />
        <Metric icon={Globe2} label={text.publishablePages} value={`${published}`} detail={`${Math.round((published / Math.max(project.pages.length, 1)) * 100)}%`} />
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
                {project.pages.length} {text.metricPages}
              </p>
            </div>
            <button type="button" onClick={onAddPage}>
              <Plus size={16} /> {text.newPageShort}
            </button>
          </div>
          <div className="page-ledger-list">
            {project.pages.map((page) => (
              <button
                type="button"
                key={page.id}
                className={page.id === selectedPage?.id ? 'page-ledger-row active' : 'page-ledger-row'}
                onClick={() => onSelectPage(page.id)}
              >
                <span className="drag-handle">{String(page.pageNumber).padStart(2, '0')}</span>
                <span>
                  <strong>{page.title}</strong>
                  <small>{page.path}</small>
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
            <button type="button" onClick={() => setTab('flowchart')}>
              <GitBranch size={16} /> {text.tabs.flowchart}
            </button>
          </div>
          {flowNodes.length ? (
            <ol className="route-stack">
              {flowNodes.slice(0, 7).map((node, index) => {
                const linkedPage = project.pages.find((page) => page.id === node.pageId);
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
                  <dd>{project.themes.find((theme) => theme.id === selectedPage.themeId)?.name ?? text.noPage}</dd>
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

function PagesPanel(props: {
  project: StudioProject;
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
        <h2>{text.tabs.pages}</h2>
        <button type="button" onClick={props.onAdd}>
          <Plus size={16} /> {text.addPage}
        </button>
      </div>
      <div className="table-list">
        {props.project.pages.map((page) => (
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
        <label>
          {text.page}
          <select value={props.page.id} onChange={(event) => props.setSelectedPageId(event.target.value)}>
            {props.project.pages.map((page) => (
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
            {props.project.themes.map((theme) => (
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
        <h2>{text.tabs.assets}</h2>
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
  addTheme: () => StudioTheme;
  updateTheme: (themeId: string, patch: Partial<StudioTheme>) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
}): JSX.Element {
  const text = useUiText();
  const [selectedThemeId, setSelectedThemeId] = useState(props.project.themes[0]?.id ?? '');
  const selectedTheme = useMemo(
    () => props.project.themes.find((theme) => theme.id === selectedThemeId) ?? props.project.themes[0],
    [props.project.themes, selectedThemeId]
  );
  const defaultThemeId = props.project.themes[0]?.id;
  const themePages = useMemo(() => {
    if (!selectedTheme) return [];
    return props.project.pages.filter((page) => page.themeId === selectedTheme.id || (!page.themeId && selectedTheme.id === defaultThemeId));
  }, [defaultThemeId, props.project.pages, selectedTheme]);

  useEffect(() => {
    if (!selectedTheme && props.project.themes[0]) {
      setSelectedThemeId(props.project.themes[0].id);
    }
  }, [props.project.themes, selectedTheme]);

  function handleAddTheme(): void {
    const theme = props.addTheme();
    setSelectedThemeId(theme.id);
  }

  if (!selectedTheme) {
    return (
      <section className="panel">
        <div className="section-head">
          <h2>{text.cssThemes}</h2>
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
        <label>
          {text.themeSelector}
          <select value={selectedTheme.id} onChange={(event) => setSelectedThemeId(event.target.value)}>
            {props.project.themes.map((theme) => (
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
        {props.project.themes.map((theme) => (
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

function FlowchartPanel(props: {
  project: StudioProject;
  addFlowNode: (flow: StudioFlowchart) => void;
  addFlowEdge: (flow: StudioFlowchart, sourceId: string, targetId: string) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
  requestConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
}): JSX.Element {
  const text = useUiText();
  const flow = props.project.flowcharts[0];
  const [selectedFlowNodeId, setSelectedFlowNodeId] = useState(flow.nodes[0]?.id ?? '');
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [edgeDraft, setEdgeDraft] = useState({
    sourceId: flow.nodes[0]?.id ?? '',
    targetId: flow.nodes[1]?.id ?? flow.nodes[0]?.id ?? ''
  });
  const selectedFlowNode = flow.nodes.find((node) => node.id === selectedFlowNodeId);

  useEffect(() => {
    setNodePositions((positions) => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const node of flow.nodes) {
        next[node.id] = positions[node.id] ?? { x: node.x, y: node.y };
      }
      return next;
    });
    if (!flow.nodes.some((node) => node.id === selectedFlowNodeId)) {
      setSelectedFlowNodeId(flow.nodes[0]?.id ?? '');
    }
  }, [flow.nodes, selectedFlowNodeId]);

  useEffect(() => {
    setEdgeDraft((current) => {
      const nodeIds = flow.nodes.map((node) => node.id);
      const sourceId = nodeIds.includes(current.sourceId) ? current.sourceId : nodeIds[0] ?? '';
      let targetId = nodeIds.includes(current.targetId) ? current.targetId : (nodeIds.find((id) => id !== sourceId) ?? nodeIds[0] ?? '');
      if (sourceId === targetId && nodeIds.length > 1) {
        targetId = nodeIds.find((id) => id !== sourceId) ?? targetId;
      }
      return sourceId === current.sourceId && targetId === current.targetId ? current : { sourceId, targetId };
    });
  }, [flow.nodes]);

  const nodes: Node[] = flow.nodes.map((node) => ({
    id: node.id,
    position: nodePositions[node.id] ?? { x: node.x, y: node.y },
    data: { label: node.label },
    type: 'default',
    selected: node.id === selectedFlowNodeId,
    className: getFlowNodeClassName(node.id)
  }));
  const edges: Edge[] = flow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    markerEnd: { type: MarkerType.ArrowClosed },
    className: 'flow-edge'
  }));
  const edgeSourceNode = flow.nodes.find((node) => node.id === edgeDraft.sourceId);
  const edgeTargetNode = flow.nodes.find((node) => node.id === edgeDraft.targetId);
  const selectedDraftEdge = flow.edges.find((edge) => edge.source === edgeDraft.sourceId && edge.target === edgeDraft.targetId);
  const edgeAlreadyExists = Boolean(selectedDraftEdge);
  const canCreateEdge = Boolean(edgeSourceNode && edgeTargetNode && edgeDraft.sourceId !== edgeDraft.targetId && !edgeAlreadyExists);
  const edgeStatus =
    flow.nodes.length < 2
      ? text.edgeNeedsTwoNodes
      : edgeDraft.sourceId === edgeDraft.targetId
        ? text.edgeSelectDifferentNodes
        : edgeAlreadyExists
          ? text.edgeAlreadyExists
          : edgeSourceNode && edgeTargetNode
            ? text.edgeReady(edgeSourceNode.label, edgeTargetNode.label)
            : text.edgeNeedsTwoNodes;
  function getFlowNodeClassName(nodeId: string): string {
    return [
      'flow-node',
      nodeId === selectedFlowNodeId ? 'selected' : '',
      nodeId === edgeDraft.sourceId ? 'edge-source' : '',
      nodeId === edgeDraft.targetId ? 'edge-target' : ''
    ]
      .filter(Boolean)
      .join(' ');
  }
  function getFlowRowClassName(nodeId: string): string {
    return [
      'row',
      nodeId === selectedFlowNodeId ? 'active' : '',
      nodeId === edgeDraft.sourceId ? 'edge-source' : '',
      nodeId === edgeDraft.targetId ? 'edge-target' : ''
    ]
      .filter(Boolean)
      .join(' ');
  }
  async function deleteFlowNode(node: FlowNode): Promise<void> {
    const confirmed = await props.requestConfirmation({
      title: text.deleteFlowNode(node.label),
      message: text.deleteFlowNodeConfirm(node.label),
      confirmLabel: text.delete,
      tone: 'danger'
    });
    if (!confirmed) {
      return;
    }
    setNodePositions((positions) => {
      const next = { ...positions };
      delete next[node.id];
      return next;
    });
    props.updateProject((current) => ({
      ...current,
      flowcharts: current.flowcharts.map((item) =>
        item.id === flow.id
          ? {
              ...item,
              nodes: item.nodes.filter((target) => target.id !== node.id),
              edges: item.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id)
            }
          : item
      )
    }));
  }
  async function deleteSelectedEdge(): Promise<void> {
    if (!selectedDraftEdge || !edgeSourceNode || !edgeTargetNode) {
      return;
    }
    const confirmed = await props.requestConfirmation({
      title: text.deleteEdge,
      message: text.deleteEdgeConfirm(edgeSourceNode.label, edgeTargetNode.label),
      confirmLabel: text.deleteEdge,
      tone: 'danger'
    });
    if (!confirmed) {
      return;
    }
    props.updateProject((current) => ({
      ...current,
      flowcharts: current.flowcharts.map((item) =>
        item.id === flow.id ? { ...item, edges: item.edges.filter((edge) => edge.id !== selectedDraftEdge.id) } : item
      )
    }));
  }
  return (
    <section className="flow-layout">
      <div className="section-head">
        <div>
          <h2>{text.tabs.flowchart}</h2>
          <p>{selectedFlowNode ? text.selectedFlowNode(selectedFlowNode.label) : text.noFlowNodeSelected}</p>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => props.addFlowNode(flow)}>
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
          onNodeClick={(_, node) => setSelectedFlowNodeId(node.id)}
          onNodeDrag={(_, node) => {
            setSelectedFlowNodeId(node.id);
            setNodePositions((positions) => ({ ...positions, [node.id]: node.position }));
          }}
          onNodeDragStop={(_, node) => {
            setSelectedFlowNodeId(node.id);
            setNodePositions((positions) => ({ ...positions, [node.id]: node.position }));
            props.updateProject((current) => ({
              ...current,
              flowcharts: current.flowcharts.map((item) =>
                item.id === flow.id
                  ? {
                      ...item,
                      nodes: item.nodes.map((target) =>
                        target.id === node.id ? { ...target, x: Math.round(node.position.x), y: Math.round(node.position.y) } : target
                      )
                    }
                  : item
              )
            }));
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
                targetId: current.targetId === sourceId ? (flow.nodes.find((node) => node.id !== sourceId)?.id ?? current.targetId) : current.targetId
              }));
            }}
          >
            {flow.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.id === edgeDraft.sourceId ? text.edgeSourceOption(node.label) : node.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flow-edge-field target">
          <span>{text.edgeTarget}</span>
          <select
            value={edgeDraft.targetId}
            aria-label={text.edgeTarget}
            onChange={(event) => setEdgeDraft((current) => ({ ...current, targetId: event.target.value }))}
          >
            {flow.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.id === edgeDraft.targetId ? text.edgeTargetOption(node.label) : node.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flow-edge-actions">
          <button type="button" disabled={!canCreateEdge} onClick={() => props.addFlowEdge(flow, edgeDraft.sourceId, edgeDraft.targetId)}>
            <Plus size={16} /> {text.addEdge}
          </button>
          <button type="button" className="danger-action" disabled={!selectedDraftEdge} onClick={() => void deleteSelectedEdge()}>
            <Trash2 size={16} /> {text.deleteEdge}
          </button>
        </div>
      </div>
      <div className="flow-table">
        {flow.nodes.map((node) => (
          <div key={node.id} className={getFlowRowClassName(node.id)} onFocus={() => setSelectedFlowNodeId(node.id)}>
            <input
              value={node.label}
              aria-label={text.flowNodeLabel(node.label)}
              onChange={(event) =>
                props.updateProject((current) => ({
                  ...current,
                  flowcharts: current.flowcharts.map((item) =>
                    item.id === flow.id
                      ? { ...item, nodes: item.nodes.map((target) => (target.id === node.id ? { ...target, label: event.target.value } : target)) }
                      : item
                  )
                }))
              }
            />
            <select
              value={node.pageId ?? ''}
              aria-label={text.flowNodePage(node.label)}
              onChange={(event) =>
                props.updateProject((current) => ({
                  ...current,
                  flowcharts: current.flowcharts.map((item) =>
                    item.id === flow.id
                      ? { ...item, nodes: item.nodes.map((target) => (target.id === node.id ? { ...target, pageId: event.target.value } : target)) }
                      : item
                  )
                }))
              }
            >
              <option value="">{text.noPage}</option>
              {props.project.pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title}
                </option>
              ))}
            </select>
            <div className="icon-actions">
              <button type="button" className="danger-action" title={text.deleteFlowNode(node.label)} aria-label={text.deleteFlowNode(node.label)} onClick={() => void deleteFlowNode(node)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SearchPanel(props: {
  project: StudioProject;
  addSearchRule: () => void;
  updateSearchRule: (ruleId: string, patch: Partial<SearchRule>) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="panel">
      <div className="section-head">
        <h2>{text.encryptedSearch}</h2>
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
              {props.project.pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title}
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
  addCondition: () => void;
  updateCondition: (conditionId: string, patch: Partial<StudioCondition>) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="panel">
      <div className="section-head">
        <h2>{text.conditionsRoutes}</h2>
        <button type="button" onClick={props.addCondition}>
          <Plus size={16} /> {text.addRoute}
        </button>
      </div>
      <div className="rule-grid">
        {props.project.conditions.map((condition) => (
          <article key={condition.id} className="rule-editor">
            <input value={condition.label} onChange={(event) => props.updateCondition(condition.id, { label: event.target.value })} />
            <select value={condition.sourcePageId} onChange={(event) => props.updateCondition(condition.id, { sourcePageId: event.target.value })}>
              {props.project.pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {text.fromPage(page.title)}
                </option>
              ))}
            </select>
            <select value={condition.targetPageId} onChange={(event) => props.updateCondition(condition.id, { targetPageId: event.target.value })}>
              {props.project.pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {text.toPage(page.title)}
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
  exportState: string;
  exportBackup: () => Promise<void>;
  exportSourceBackup: () => Promise<void>;
  importBackup: (file?: File) => Promise<void>;
  importSource: (file?: File) => Promise<void>;
  importYacho: (file?: File) => Promise<void>;
  exportPublic: () => Promise<void>;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="export-grid">
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
        <h2>{text.publicStaticSite}</h2>
        <p>{text.publicStaticSiteCopy}</p>
        <button type="button" onClick={() => void props.exportPublic()}>
          <ShieldCheck size={16} /> {text.exportPublicZip}
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
