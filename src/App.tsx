import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import {
  Archive,
  Copy,
  Download,
  FilePlus,
  FolderOpen,
  Image,
  KeyRound,
  MoveDown,
  MoveUp,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload
} from 'lucide-react';
import { studioTabs, type StudioTab } from './app/routes';
import { isLanguage, LANGUAGE_STORAGE_KEY, UI_TEXT, type Language, type UiText } from './app/i18n';
import { exportProjectBackupZip, importProjectBackupZip } from './features/backup/backupZip';
import { importYachoProjectZip } from './features/import-yacho/importYacho';
import { getPreviewHtml, getPreviewSandbox } from './features/preview/previewPolicy';
import { buildPublicExportZip } from './lib/export-public/publicExport';
import { checkPublicExportZip } from './lib/export-public/checkLeaks';
import { createId, createPage, createProject, nowIso, touchProject } from './lib/projects/createProject';
import { listProjects, saveProject } from './lib/db/projectsDb';
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

function parseList(value: string): string[] {
  return splitTermList(value);
}

function textareaList(values: string[]): string {
  return values.join('\n');
}

export default function App(): JSX.Element {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : 'ja';
  });
  const text = UI_TEXT[language];
  const [project, setProject] = useState<StudioProject>(() => createProject(UI_TEXT.ja.defaultProjectName));
  const [selectedPageId, setSelectedPageId] = useState(project.pages[0]?.id ?? '');
  const [selectedTab, setSelectedTab] = useState<StudioTab>('dashboard');
  const [knownProjects, setKnownProjects] = useState<StudioProject[]>([]);
  const [loadState, setLoadState] = useState<string>(UI_TEXT.ja.loading);
  const [saveState, setSaveState] = useState<string>(UI_TEXT.ja.notSaved);
  const [exportState, setExportState] = useState<string>('');
  const firstSave = useRef(true);

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
    setProject((current) => touchProject(updater(current)));
  }

  function updatePage(pageId: string, updater: (page: StudioPage) => StudioPage): void {
    updateProject((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === pageId ? updater(page) : page))
    }));
  }

  function createNewProject(): void {
    const next = createProject(text.newProjectName(knownProjects.length + 1));
    setProject(next);
    setKnownProjects((projects) => [next, ...projects]);
    setSelectedPageId(next.pages[0]?.id ?? '');
    setSelectedTab('dashboard');
    setSaveState(text.newProjectCreated);
  }

  async function switchProject(projectId: string): Promise<void> {
    const stored = await listProjects();
    const next = stored.find((item) => item.id === projectId) ?? knownProjects.find((item) => item.id === projectId);
    if (!next) {
      return;
    }
    setKnownProjects(stored.length ? stored : knownProjects);
    setProject(next);
    setSelectedPageId(next.pages[0]?.id ?? '');
    setSaveState(text.loaded(next.name));
  }

  function addPage(): void {
    const page = createPage({
      title: text.newPageTitle(project.pages.length + 1),
      slug: `page-${project.pages.length + 1}`,
      path: `page-${project.pages.length + 1}.html`,
      pageNumber: project.pages.length + 1,
      themeId: project.themes[0]?.id
    });
    updateProject((current) => ({ ...current, pages: [...current.pages, page] }));
    setSelectedPageId(page.id);
    setSelectedTab('editor');
  }

  function duplicatePage(page: StudioPage): void {
    const copy = {
      ...page,
      id: createId('page'),
      title: `${page.title} ${text.duplicateSuffix}`,
      slug: `${page.slug}-copy`,
      path: normalizePublicPath(`${page.slug}-copy.html`, 'copy.html'),
      pageNumber: project.pages.length + 1
    };
    updateProject((current) => ({ ...current, pages: [...current.pages, copy] }));
    setSelectedPageId(copy.id);
  }

  function deletePage(pageId: string): void {
    if (project.pages.length === 1) {
      return;
    }
    updateProject((current) => {
      const pages = current.pages.filter((page) => page.id !== pageId).map((page, index) => ({ ...page, pageNumber: index + 1 }));
      return {
        ...current,
        pages,
        searchRules: current.searchRules.filter((rule) => rule.targetPageId !== pageId),
        conditions: current.conditions.filter((condition) => condition.sourcePageId !== pageId && condition.targetPageId !== pageId)
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

  function addTheme(): void {
    const theme: StudioTheme = {
      id: createId('theme'),
      name: text.themeName(project.themes.length + 1),
      css: 'body { background: #fffdf8; color: #24272d; }'
    };
    updateProject((current) => ({ ...current, themes: [...current.themes, theme] }));
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
      x: 90 + flow.nodes.length * 80,
      y: 100
    };
    updateProject((current) => ({
      ...current,
      flowcharts: current.flowcharts.map((item) => (item.id === flow.id ? { ...item, nodes: [...item.nodes, node] } : item))
    }));
  }

  function addFlowEdge(flow: StudioFlowchart): void {
    if (flow.nodes.length < 2) return;
    const edge: FlowEdge = {
      id: createId('edge'),
      source: flow.nodes[flow.nodes.length - 2].id,
      target: flow.nodes[flow.nodes.length - 1].id,
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
  }

  async function importBackup(file: File | undefined): Promise<void> {
    if (!file) return;
    const imported = await importProjectBackupZip(await readFileAsArrayBuffer(file));
    setProject(touchProject(imported));
    setKnownProjects((projects) => [imported, ...projects.filter((item) => item.id !== imported.id)]);
    setSelectedPageId(imported.pages[0]?.id ?? '');
    setExportState(text.importedBackup(file.name));
  }

  async function importYacho(file: File | undefined): Promise<void> {
    if (!file) return;
    const imported = await importYachoProjectZip(await readFileAsArrayBuffer(file));
    setProject(imported);
    setKnownProjects((projects) => [imported, ...projects]);
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
        <header className="topbar">
        <div>
          <span className="eyebrow">{text.appEyebrow}</span>
          <input
            className="project-title"
            value={project.name}
            aria-label={text.projectName}
            onChange={(event) => updateProject((current) => ({ ...current, name: event.target.value }))}
          />
          <select className="project-switcher" value={project.id} aria-label={text.openProject} onChange={(event) => void switchProject(event.target.value)}>
            {knownProjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="topbar-actions">
          <label className="language-select">
            {text.languageLabel}
            <select value={language} aria-label={text.languageLabel} onChange={(event) => setLanguage(event.target.value as Language)}>
              <option value="ja">{text.japanese}</option>
              <option value="en">{text.english}</option>
            </select>
          </label>
          <span className="status">{loadState}</span>
          <span className="status">{saveState}</span>
          <button type="button" onClick={manualSave} title={text.manualSave}>
            <Save size={16} /> {text.save}
          </button>
          <button type="button" onClick={createNewProject} title={text.newProject}>
            <FilePlus size={16} /> {text.newProject}
          </button>
          <button type="button" onClick={createSnapshot} title={text.createSnapshot}>
            <Archive size={16} /> {text.snapshot}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label={text.tabsLabel}>
        {studioTabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={selectedTab === tab.id ? 'active' : ''}
            onClick={() => setSelectedTab(tab.id)}
          >
            {text.tabs[tab.id]}
          </button>
        ))}
      </nav>

      <main className="workspace">
        {selectedTab === 'dashboard' && <Dashboard project={project} setTab={setSelectedTab} />}
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
        {selectedTab === 'flowchart' && <FlowchartPanel project={project} addFlowNode={addFlowNode} addFlowEdge={addFlowEdge} updateProject={updateProject} />}
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
            importBackup={importBackup}
            importYacho={importYacho}
            exportPublic={exportPublic}
          />
        )}
        </main>
      </div>
    </I18nContext.Provider>
  );
}

function Dashboard({ project, setTab }: { project: StudioProject; setTab: (tab: StudioTab) => void }): JSX.Element {
  const text = useUiText();
  const published = project.pages.filter((page) => page.status === 'published').length;
  return (
    <section className="dashboard-grid">
      <div className="summary-panel">
        <h2>{text.dashboardTitle}</h2>
        <p>{text.dashboardCopy}</p>
        <div className="metric-row">
          <Metric label={text.metricPages} value={project.pages.length} />
          <Metric label={text.metricPublished} value={published} />
          <Metric label={text.metricAssets} value={project.assets.length} />
          <Metric label={text.metricRules} value={project.searchRules.length} />
          <Metric label={text.metricSnapshots} value={project.snapshots.length} />
        </div>
      </div>
      <div className="action-grid">
        <button type="button" onClick={() => setTab('editor')}>
          <FilePlus size={18} /> {text.editPages}
        </button>
        <button type="button" onClick={() => setTab('assets')}>
          <Image size={18} /> {text.manageAssets}
        </button>
        <button type="button" onClick={() => setTab('search')}>
          <Search size={18} /> {text.searchRules}
        </button>
        <button type="button" onClick={() => setTab('export')}>
          <ShieldCheck size={18} /> {text.exportChecks}
        </button>
      </div>
      <div className="notice-panel">
        <h3>{text.encryptionBoundary}</h3>
        <p>{text.encryptionBoundaryCopy}</p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PagesPanel(props: {
  project: StudioProject;
  selectedPageId: string;
  onAdd: () => void;
  onDuplicate: (page: StudioPage) => void;
  onDelete: (pageId: string) => void;
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
              <button type="button" title={text.duplicate} onClick={() => props.onDuplicate(page)}>
                <Copy size={16} />
              </button>
              <button type="button" title={text.delete} onClick={() => props.onDelete(page.id)}>
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
        <iframe
          title={text.pagePreview}
          sandbox={getPreviewSandbox(props.project, props.page)}
          srcDoc={getPreviewHtml(props.project, props.page)}
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
  addTheme: () => void;
  updateTheme: (themeId: string, patch: Partial<StudioTheme>) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
}): JSX.Element {
  const text = useUiText();
  return (
    <section className="panel">
      <div className="section-head">
        <h2>{text.cssThemes}</h2>
        <button type="button" onClick={props.addTheme}>
          <Plus size={16} /> {text.addTheme}
        </button>
      </div>
      <div className="theme-grid">
        {props.project.themes.map((theme) => (
          <article key={theme.id} className="theme-editor">
            <input value={theme.name} onChange={(event) => props.updateTheme(theme.id, { name: event.target.value })} />
            <textarea value={theme.css} onChange={(event) => props.updateTheme(theme.id, { css: event.target.value })} />
          </article>
        ))}
      </div>
      <label className="check-row wide">
        <input
          type="checkbox"
          checked={props.project.scriptPreviewEnabled}
          onChange={(event) => props.updateProject((current) => ({ ...current, scriptPreviewEnabled: event.target.checked }))}
        />
        {text.enableAdvancedScriptPreview}
      </label>
    </section>
  );
}

function FlowchartPanel(props: {
  project: StudioProject;
  addFlowNode: (flow: StudioFlowchart) => void;
  addFlowEdge: (flow: StudioFlowchart) => void;
  updateProject: (updater: (draft: StudioProject) => StudioProject) => void;
}): JSX.Element {
  const text = useUiText();
  const flow = props.project.flowcharts[0];
  const nodes: Node[] = flow.nodes.map((node) => ({
    id: node.id,
    position: { x: node.x, y: node.y },
    data: { label: node.label },
    type: 'default'
  }));
  const edges: Edge[] = flow.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label }));
  return (
    <section className="flow-layout">
      <div className="section-head">
        <h2>{text.tabs.flowchart}</h2>
        <div className="button-row">
          <button type="button" onClick={() => props.addFlowNode(flow)}>
            <Plus size={16} /> {text.addNode}
          </button>
          <button type="button" onClick={() => props.addFlowEdge(flow)}>
            <Plus size={16} /> {text.addEdge}
          </button>
        </div>
      </div>
      <div className="flow-canvas">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <div className="flow-table">
        {flow.nodes.map((node) => (
          <div key={node.id} className="row">
            <input
              value={node.label}
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
  importBackup: (file?: File) => Promise<void>;
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
        <label className="file-button">
          <FolderOpen size={16} /> {text.importBackupZip}
          <input type="file" accept=".zip" onChange={(event) => void props.importBackup(event.currentTarget.files?.[0])} />
        </label>
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
