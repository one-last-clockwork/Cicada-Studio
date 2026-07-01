import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPublicExportZip } from '../../src/lib/export-public/publicExport';
import { checkPublicExportZip } from '../../src/lib/export-public/checkLeaks';
import { decryptText, tryDecryptText } from '../../src/lib/crypto/browserCrypto';
import { createDefaultMessengerThread, createDefaultSite, createId, createPage, createProject } from '../../src/lib/projects/createProject';
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
    const page = project.sites[0].pages[0];
    page.revealBlocks.push({
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

  it('exports a static site without drafts, Story Maps, answers, or plaintext encrypted payloads', async () => {
    const project = createProject('Leakage Test');
    const site = project.sites[0];
    site.themes[0].css = 'body{color:#111}</style><script>window.__css_breakout="theme leak"</script><style>';
    site.pages[0] = {
      ...site.pages[0],
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
    const firstPage = site.pages[0];
    site.pages.push(
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
      targetPageId: firstPage.id,
      hint: 'Look for a door.',
      failureMessage: 'no'
    });
    project.conditions.push({
      id: createId('condition'),
      label: 'Internal route',
      sourcePageId: firstPage.id,
      targetPageId: firstPage.id,
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
    project.storyMaps[0].name = 'story map leak marker';
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
    firstPage.bodyHtml += '<a href="assets/public-note.txt">public note</a>';

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
    firstPage.path = 'nested/deep/index.html';
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
    expect(combined).not.toContain('story map leak marker');
    expect(combined).not.toContain('internal condition leak marker');
    expect(combined).not.toContain('legacy script leak marker');
    expect(combined).not.toContain('private asset leak marker');
    expect(combined).not.toContain('<script>window.__css_breakout');
    expect(combined).not.toContain('</style><script>');
  });

  it('exports multi-site layouts and encrypted protected messenger messages', async () => {
    const project = createProject('Multi Site StoryState');
    const primarySite = project.sites[0];
    primarySite.pages[0].bodyHtml = '<main><h1>Primary Site</h1></main>';
    const archiveSite = createDefaultSite({
      name: 'Archive Site',
      slug: 'archive',
      pathPrefix: 'sites/archive'
    });
    archiveSite.pages[0].title = 'Archive Index';
    archiveSite.pages[0].bodyHtml = '<main><h1>Archive Site</h1></main>';
    project.sites.push(archiveSite);
    const strictSearchId = createId('search');
    project.searchRules.push({
      id: strictSearchId,
      label: 'Strict Search',
      terms: ['strict search answer'],
      aliases: [],
      mode: 'exact',
      targetPageId: primarySite.pages[0].id,
      hint: '',
      failureMessage: 'no'
    });
    const pageNode = project.storyMaps[0].nodes.find((node) => node.pageId === primarySite.pages[0].id);
    const strictTargetNode = {
      id: createId('node'),
      label: 'Strict Target',
      type: 'state_change' as const,
      notes: '',
      tags: [],
      x: 520,
      y: 140
    };
    project.storyMaps[0].nodes.push(strictTargetNode);
    project.storyMaps[0].edges.push({
      id: createId('edge'),
      source: pageNode?.id ?? project.storyMaps[0].nodes[0].id,
      target: strictTargetNode.id,
      label: 'Strict route',
      action: 'submit_keyword',
      pathRole: 'intended',
      prerequisiteMode: 'strict',
      notes: '',
      tags: [],
      trigger: {
        id: createId('trigger'),
        type: 'searchSolved',
        searchRuleId: strictSearchId
      },
      effects: [{ id: createId('effect'), type: 'setFlag', flagId: 'strict-route' }]
    });

    const thread = createDefaultMessengerThread();
    thread.nodes[0].body = 'Locked note';
    thread.nodes[0].protectedMessage = {
      prompt: 'Passphrase',
      answerAliases: ['messenger secret'],
      secretBody: '<p>protected messenger body</p>',
      failureMessage: 'no'
    };
    thread.nodes.push({
      id: createId('message'),
      senderId: thread.participants[0].id,
      kind: 'input',
      body: 'Say the phrase',
      choices: [],
      matchers: [
        {
          id: createId('match'),
          label: 'Messenger answer',
          terms: ['messenger input answer'],
          mode: 'exact',
          targetNodeId: thread.nodes[0].id,
          effects: []
        }
      ],
      effects: []
    });
    project.messengerThreads.push(thread);

    const blob = await buildPublicExportZip(project);
    const check = await checkPublicExportZip(blob, project);
    expect(check.ok).toBe(true);
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files)).toContain('index.html');
    expect(Object.keys(zip.files)).toContain('sites/archive/index.html');

    const html = await zip.file('index.html')?.async('text');
    const payloadJson = html?.match(/<script type="application\/json" id="arg-payload">([\s\S]*?)<\/script>/)?.[1];
    const payload = JSON.parse(payloadJson as string) as PublicRuntimePayload;
    expect(payload.sites.map((site) => site.slug)).toEqual(['default', 'archive']);
    expect(payload.storyEffects.find((binding) => binding.trigger.searchRuleId === strictSearchId)?.requiredEventIds).toContain(
      `pageVisited:${primarySite.id}:${primarySite.pages[0].id}`
    );
    const protectedEntry = payload.messengerThreads[0].nodes[0].protectedEntries?.[0];
    expect(protectedEntry).toBeTruthy();
    await expect(decryptText('messenger secret', protectedEntry!)).resolves.toContain('protected messenger body');
    await expect(decryptText('messenger input answer', payload.messengerThreads[0].nodes[1].matchers[0])).resolves.toContain(thread.nodes[0].id);
    const combined = (
      await Promise.all(
        Object.values(zip.files)
          .filter((file) => !file.dir)
          .map((file) => file.async('text').catch(() => ''))
      )
    ).join('\n');
    expect(combined).not.toContain('messenger input answer');
    expect(combined).not.toContain('strict search answer');

    const siteOnlyBlob = await buildPublicExportZip(project, { siteId: archiveSite.id });
    const siteOnlyZip = await JSZip.loadAsync(siteOnlyBlob);
    expect(Object.keys(siteOnlyZip.files)).toContain('index.html');
    expect(Object.keys(siteOnlyZip.files)).not.toContain('sites/archive/index.html');
    const siteOnlyHtml = await siteOnlyZip.file('index.html')?.async('text');
    expect(siteOnlyHtml).toContain('Archive Site');
  });
});
