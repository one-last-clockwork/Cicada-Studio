import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPublicExportZip } from '../../src/lib/export-public/publicExport';
import { checkPublicExportZip } from '../../src/lib/export-public/checkLeaks';
import { decryptText, tryDecryptText } from '../../src/lib/crypto/browserCrypto';
import { createId, createPage, createProject } from '../../src/lib/projects/createProject';
import { PUBLIC_EXPORT_LICENSE_FILENAME } from '../../src/public-runtime/outputLicense';
import type { PublicRuntimePayload } from '../../src/types/project';

async function firstDecrypted(secret: string, entries: Array<{ salt: string; iv: string; ciphertext: string }>): Promise<string | null> {
  for (const entry of entries) {
    const decrypted = await tryDecryptText(secret, entry);
    if (decrypted) {
      return decrypted;
    }
  }
  return null;
}

describe('public export', () => {
  it('does not treat the generated output license notice as leaked project text', async () => {
    const project = createProject('License Notice');
    project.pages[0].revealBlocks.push({
      id: createId('reveal'),
      label: 'License phrase',
      prompt: 'Phrase',
      answerAliases: ['MIT License'],
      secretHtml: '<p>licensed output</p>',
      failureMessage: 'no'
    });

    const check = await checkPublicExportZip(await buildPublicExportZip(project), project);
    expect(check.ok).toBe(true);
  });

  it('exports a static site without drafts, flowcharts, answers, or plaintext encrypted payloads', async () => {
    const project = createProject('Leakage Test');
    project.themes[0].css = 'body{color:#111}</style><script>window.__css_breakout="theme leak"</script><style>';
    project.pages[0] = {
      ...project.pages[0],
      bodyHtml: '<main><h1>Visible Page</h1><div data-search-widget="default"></div></main>',
      revealBlocks: [
        {
          id: createId('reveal'),
          label: 'Desk code',
          prompt: 'Desk code',
          answerAliases: ['silver moth', '銀の蛾'],
          secretHtml: '<p>hidden observatory</p><img src=x onerror="window.bad=1"><script>window.bad=2</script>',
          failureMessage: 'no'
        }
      ],
      unlockPages: [
        {
          id: createId('unlock'),
          label: 'Archive',
          path: 'index.html',
          prompt: 'Archive key',
          answerAliases: ['long archive passphrase', '長い合言葉'],
          payloadHtml: '<main>classified archive payload<a href="javascript:alert(1)">bad</a></main>',
          failureMessage: 'no'
        }
      ]
    };
    project.pages.push(
      createPage({
        title: 'Draft Only',
        status: 'draft',
        bodyHtml: '<main>draft body leak marker</main>',
        memo: 'draft memo leak marker',
        pageNumber: 2
      })
    );
    project.searchRules.push({
      id: createId('search'),
      label: 'Door',
      terms: ['blue door'],
      aliases: ['青いドア'],
      mode: 'contains',
      targetPageId: project.pages[0].id,
      hint: 'Look for a door.',
      failureMessage: 'no'
    });
    project.conditions.push({
      id: createId('condition'),
      label: 'Internal route',
      sourcePageId: project.pages[0].id,
      targetPageId: project.pages[0].id,
      publicHint: 'public',
      internalNote: 'internal condition leak marker'
    });
    project.importedScripts.push({
      id: createId('script'),
      name: 'Legacy Script',
      path: 'scripts/legacy.js',
      enabled: false,
      source: 'legacy script leak marker'
    });
    project.flowcharts[0].name = 'flowchart leak marker';
    project.assets.push(
      {
        id: createId('asset'),
        name: 'private-note.txt',
        safeName: 'private-note.txt',
        mime: 'text/plain',
        dataUrl: `data:text/plain;base64,${btoa('private asset leak marker')}`,
        bytes: 25
      },
      {
        id: createId('asset'),
        name: 'public-note.txt',
        safeName: 'public-note.txt',
        mime: 'text/plain',
        dataUrl: `data:text/plain;base64,${btoa('public asset body')}`,
        bytes: 17
      }
    );
    project.pages[0].bodyHtml += '<a href="assets/public-note.txt">public note</a>';

    const blob = await buildPublicExportZip(project);
    const check = await checkPublicExportZip(blob, project);
    expect(check.ok).toBe(true);

    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files)).not.toContain('structure.json');
    expect(Object.keys(zip.files)).not.toContain('flowchart.json');
    expect(Object.keys(zip.files)).toContain(PUBLIC_EXPORT_LICENSE_FILENAME);
    expect(Object.keys(zip.files)).toContain('assets/public-note.txt');
    expect(Object.keys(zip.files)).not.toContain('assets/private-note.txt');
    const outputLicense = await zip.file(PUBLIC_EXPORT_LICENSE_FILENAME)?.async('text');
    expect(outputLicense).toContain('MIT License');
    expect(outputLicense).toContain('user or other rights holder may license those works under any terms they choose');
    const indexHtml = await zip.file('index.html')?.async('text');
    const payloadJson = indexHtml?.match(/<script type="application\/json" id="arg-payload">([\s\S]*?)<\/script>/)?.[1];
    expect(payloadJson).toBeTruthy();
    const payload = JSON.parse(payloadJson as string) as PublicRuntimePayload;
    await expect(decryptText('silver moth', payload.reveal[0])).resolves.toContain('hidden observatory');
    await expect(decryptText('silver moth', payload.reveal[0])).resolves.not.toContain('onerror');
    await expect(decryptText('silver moth', payload.reveal[0])).resolves.not.toContain('<script>');
    await expect(firstDecrypted('銀の蛾', payload.reveal)).resolves.toContain('hidden observatory');
    expect(payload.unlock[0].path).toBe('index-2.html');
    expect(Object.keys(zip.files)).toContain('index-2.html');
    await expect(decryptText('long archive passphrase', payload.unlock[0])).resolves.not.toContain('javascript:');
    await expect(firstDecrypted('長い合言葉', payload.unlock)).resolves.toContain('classified archive payload');
    await expect(firstDecrypted('青いドア', payload.search)).resolves.toContain('index.html');
    project.pages[0].path = 'nested/deep/index.html';
    const nestedBlob = await buildPublicExportZip(project);
    const nestedZip = await JSZip.loadAsync(nestedBlob);
    const nestedHtml = await nestedZip.file('nested/deep/index.html')?.async('text');
    expect(nestedHtml).toContain('src="../../runtime.js"');
    expect(nestedHtml).toContain('href="../../assets/public-note.txt"');

    const combined = (
      await Promise.all(
        Object.values(zip.files)
          .filter((file) => !file.dir)
          .map((file) => file.async('text').catch(() => ''))
      )
    ).join('\n');
    expect(combined).toContain('Visible Page');
    expect(combined).not.toContain('silver moth');
    expect(combined).not.toContain('hidden observatory');
    expect(combined).not.toContain('classified archive payload');
    expect(combined).not.toContain('blue door');
    expect(combined).not.toContain('draft body leak marker');
    expect(combined).not.toContain('flowchart leak marker');
    expect(combined).not.toContain('internal condition leak marker');
    expect(combined).not.toContain('legacy script leak marker');
    expect(combined).not.toContain('private asset leak marker');
    expect(combined).not.toContain('<script>window.__css_breakout');
    expect(combined).not.toContain('</style><script>');
  });
});
