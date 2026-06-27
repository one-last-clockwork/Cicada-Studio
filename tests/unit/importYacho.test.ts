import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { importYachoProjectZip } from '../../src/features/import-yacho/importYacho';

describe('YACHO import', () => {
  it('converts structure, content, assets, CSS themes, script metadata, and flowchart without enabling scripts', async () => {
    const zip = new JSZip();
    zip.file(
      'structure.json',
      JSON.stringify({
        title: 'Imported Case',
        pages: [{ id: 'p1', title: 'Start', slug: 'start', path: 'start.html', content: 'contents/start.html' }]
      })
    );
    zip.file('contents/start.html', '<main><h1>Start</h1><script>window.bad=true</script></main>');
    zip.file('media/photo.txt', 'asset bytes');
    zip.file('css/imported.css', 'body { color: #123456; }');
    zip.file('scripts.json', JSON.stringify([{ name: 'Legacy Script', path: 'scripts/legacy.js' }]));
    zip.file('scripts/legacy.js', 'window.legacy = true;');
    zip.file('flowchart.json', JSON.stringify({ nodes: [{ id: 'n1', label: 'Start', pageId: 'p1' }], edges: [] }));

    const project = await importYachoProjectZip(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(project.name).toBe('Imported Case');
    expect(project.pages[0].bodyHtml).toContain('<h1>Start</h1>');
    expect(project.pages[0].bodyHtml).not.toContain('<script>');
    expect(project.pages[0].allowScripts).toBe(false);
    expect(project.scriptPreviewEnabled).toBe(false);
    expect(project.assets).toHaveLength(1);
    expect(project.themes[0]).toMatchObject({ name: 'imported', css: 'body { color: #123456; }' });
    expect(project.importedScripts).toHaveLength(2);
    expect(project.importedScripts.every((script) => script.enabled === false)).toBe(true);
    expect(project.flowcharts[0].nodes[0].label).toBe('Start');
  });
});
