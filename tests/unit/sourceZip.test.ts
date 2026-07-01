import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { dryRunImportProjectSourceZip, exportProjectSourceZip } from '../../src/features/backup/sourceZip';
import { createId, createProject } from '../../src/lib/projects/createProject';
import type { SourceZipPageMetadata, SourceZipScriptMetadata } from '../../src/features/backup/sourceZipTypes';
import type { StudioProject, StudioStoryMap } from '../../src/types/project';

async function loadZip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(blob);
}

async function zipToBlob(zip: JSZip): Promise<Blob> {
  return new Blob([await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })], { type: 'application/zip' });
}

async function readJson<T>(zip: JSZip, path: string): Promise<T> {
  const text = await zip.file(path)?.async('text');
  if (!text) {
    throw new Error(`${path} is missing`);
  }
  return JSON.parse(text) as T;
}

function firstSite(project: StudioProject) {
  return project.sites[0];
}

function firstPage(project: StudioProject) {
  return firstSite(project).pages[0];
}

describe('Source Zip backup format', () => {
  it('exports human-editable source files and imports author data without snapshots', async () => {
    const project = createProject('Source Roundtrip');
    const page = firstPage(project);
    page.bodyHtml = '<main><h1>Opening clue</h1></main>';
    page.memo = 'author memo stays in source backup';
    page.revealBlocks.push({
      id: createId('reveal'),
      label: 'Desk reveal',
      prompt: 'Desk code',
      answerAliases: ['midsummer'],
      secretHtml: '<p>hidden source payload</p>',
      failureMessage: 'no'
    });
    project.searchRules.push({
      id: createId('search'),
      label: 'Archive search',
      terms: ['archive'],
      aliases: ['archives'],
      mode: 'contains',
      targetPageId: page.id,
      hint: 'Search the archive.',
      failureMessage: 'no'
    });
    project.conditions.push({
      id: createId('condition'),
      label: 'Opening branch',
      sourcePageId: page.id,
      targetPageId: page.id,
      publicHint: 'follow the branch',
      internalNote: 'internal route note'
    });
    project.assets.push({
      id: createId('asset'),
      name: 'note.txt',
      safeName: 'note.txt',
      mime: 'text/plain',
      dataUrl: `data:text/plain;base64,${Buffer.from('asset source body').toString('base64')}`,
      bytes: 17
    });
    project.importedScripts.push({
      id: createId('script'),
      name: 'Legacy Script',
      path: 'legacy/script.js',
      enabled: false,
      source: 'console.log("source script");',
      metadata: { origin: 'test' }
    });
    project.snapshots.push({
      id: createId('snapshot'),
      label: 'Local snapshot',
      createdAt: project.createdAt,
      project: { ...project, snapshots: [] }
    });

    const zip = await loadZip(await exportProjectSourceZip(project));
    const files = Object.keys(zip.files).filter((path) => !zip.files[path]?.dir);
    expect(files).toEqual(
      expect.arrayContaining([
        'cicada.project.json',
        'sites/default/site.json',
        'sites/default/pages/opening-page.html',
        'sites/default/pages/opening-page.json',
        'sites/default/themes/default-case-file.css',
        'sites/default/themes/default-case-file.json',
        'story/story-maps.json',
        'story/story-state.json',
        'search/rules.json',
        'conditions.json',
        'messenger/threads.json',
        'assets/manifest.json',
        'assets/files/note.txt',
        'scripts/metadata.json',
        'scripts/files/script.js'
      ])
    );
    expect(files.some((path) => path.includes('snapshot'))).toBe(false);
    const manifest = await readJson<Record<string, unknown>>(zip, 'cicada.project.json');
    expect(manifest).not.toHaveProperty('snapshots');

    const result = await dryRunImportProjectSourceZip(await zipToBlob(zip));
    expect(result.ok).toBe(true);
    expect(result.project?.snapshots).toEqual([]);
    expect(result.project?.sites[0].pages[0].memo).toBe('author memo stays in source backup');
    expect(result.project?.sites[0].pages[0].bodyHtml).toContain('Opening clue');
    expect(result.project?.sites[0].pages[0].revealBlocks[0].answerAliases).toContain('midsummer');
    expect(result.project?.assets[0].name).toBe('note.txt');
    expect(result.project?.importedScripts[0].source).toContain('source script');
  });

  it('imports hand-edited HTML and repairs missing page ids and missing theme references', async () => {
    const project = createProject('Editable Source');
    const zip = await loadZip(await exportProjectSourceZip(project));
    const metadataPath = 'sites/default/pages/opening-page.json';
    const metadata = await readJson<SourceZipPageMetadata>(zip, metadataPath);
    delete metadata.id;
    delete metadata.themeId;
    zip.file(metadata.bodyFile ?? 'sites/default/pages/opening-page.html', '<main><h1>Edited by hand</h1></main>');
    zip.file(metadataPath, JSON.stringify(metadata, null, 2));

    const result = await dryRunImportProjectSourceZip(await zipToBlob(zip));
    expect(result.ok).toBe(true);
    expect(result.project?.sites[0].pages[0].bodyHtml).toContain('Edited by hand');
    expect(result.project?.sites[0].pages[0].id).not.toBe(firstPage(project).id);
    expect(result.project?.sites[0].pages[0].themeId).toBe(result.project?.sites[0].themes[0].id);
    expect(result.repairs.map((item) => item.message).join('\n')).toContain('Missing page id was generated');
    expect(result.repairs.map((item) => item.message).join('\n')).toContain('changed to the default theme');
  });

  it('exports a clean source zip even when the project has duplicate page paths and stale Story Map page refs', async () => {
    const project = createProject('Canonical Source');
    const site = firstSite(project);
    const duplicatePage = {
      ...firstPage(project),
      id: createId('page'),
      title: 'Duplicate Path',
      slug: 'page-3',
      path: 'page-3.html',
      pageNumber: 2
    };
    const duplicatePageTwo = {
      ...duplicatePage,
      id: createId('page'),
      title: 'Duplicate Path Two',
      pageNumber: 3
    };
    site.pages.push(duplicatePage, duplicatePageTwo);
    project.storyMaps[0].nodes.push({
      id: createId('node'),
      label: 'Stale page ref',
      type: 'page',
      siteId: site.id,
      pageId: 'missing-page',
      notes: '',
      tags: [],
      x: 160,
      y: 160
    });

    const zip = await loadZip(await exportProjectSourceZip(project));
    const result = await dryRunImportProjectSourceZip(await zipToBlob(zip));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.repairs).toEqual([]);
    expect(result.project?.sites[0].pages.map((page) => page.slug)).toEqual(['opening-page', 'page-3', 'page-3-2']);
    expect(result.project?.sites[0].pages.map((page) => page.path)).toEqual(['index.html', 'page-3.html', 'page-3-2.html']);
    expect(result.project?.storyMaps[0].nodes.find((node) => node.label === 'Stale page ref')?.pageId).toBeUndefined();
  });

  it('removes broken Story Map edges but blocks search and condition refs to missing pages', async () => {
    const project = createProject('Broken References');
    const nodeId = project.storyMaps[0].nodes[0].id;
    project.searchRules.push({
      id: createId('search'),
      label: 'Broken search',
      terms: ['broken'],
      aliases: [],
      mode: 'exact',
      targetPageId: 'missing-page',
      hint: '',
      failureMessage: 'no'
    });
    project.conditions.push({
      id: createId('condition'),
      label: 'Broken condition',
      sourcePageId: firstPage(project).id,
      targetPageId: 'missing-page',
      publicHint: '',
      internalNote: ''
    });

    const zip = await loadZip(await exportProjectSourceZip(project));
    const storyMaps = await readJson<StudioStoryMap[]>(zip, 'story/story-maps.json');
    storyMaps[0].edges.push({
      id: createId('edge'),
      source: nodeId,
      target: 'missing-node',
      label: 'Broken',
      action: 'read',
      pathRole: 'intended',
      prerequisiteMode: 'permissive',
      notes: '',
      tags: [],
      effects: []
    });
    zip.file('story/story-maps.json', JSON.stringify(storyMaps, null, 2));

    const result = await dryRunImportProjectSourceZip(await zipToBlob(zip));
    expect(result.ok).toBe(false);
    expect(result.errors.map((item) => item.message).join('\n')).toContain('Search rule "Broken search" references a missing target page');
    expect(result.errors.map((item) => item.message).join('\n')).toContain('Condition "Broken condition" references a missing target page');
    expect(result.repairs.map((item) => item.message).join('\n')).toContain('Story Map edge with a missing node reference was removed');
  });

  it('forces imported scripts disabled even when hand-edited metadata enables them', async () => {
    const project = createProject('Script Source');
    project.importedScripts.push({
      id: createId('script'),
      name: 'Legacy Script',
      path: 'legacy/script.js',
      enabled: false,
      source: 'window.legacy = true;',
      metadata: { legacy: true }
    });
    const zip = await loadZip(await exportProjectSourceZip(project));
    const scripts = await readJson<SourceZipScriptMetadata[]>(zip, 'scripts/metadata.json');
    scripts[0].enabled = true;
    zip.file('scripts/metadata.json', JSON.stringify(scripts, null, 2));

    const result = await dryRunImportProjectSourceZip(await zipToBlob(zip));
    expect(result.ok).toBe(true);
    expect(result.project?.importedScripts[0].enabled).toBe(false);
    expect(result.project?.importedScripts[0].source).toBe('window.legacy = true;');
    expect(result.repairs.map((item) => item.message).join('\n')).toContain('Imported script was forced to disabled');
  });

  it('rejects source zips that contain path traversal entries', async () => {
    const zip = new JSZip();
    zip.file('../outside.json', '{}');

    const result = await dryRunImportProjectSourceZip(await zipToBlob(zip));
    expect(result.ok).toBe(false);
    expect(result.errors.map((item) => item.path)).toContain('../outside.json');
  });
});
