import { createServer, type Server } from 'node:http';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { buildPublicExportZip } from '../../src/lib/export-public/publicExport';
import { createId, createProject } from '../../src/lib/projects/createProject';
import { PUBLIC_EXPORT_LICENSE_FILENAME } from '../../src/public-runtime/outputLicense';

async function servePublicZip(blob: Blob): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const files = new Map<string, { body: Uint8Array; type: string }>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    files.set(`/${path}`, {
      body: await entry.async('uint8array'),
      type: path.endsWith('.js') ? 'text/javascript' : path.endsWith('.html') ? 'text/html' : 'application/octet-stream'
    });
  }

  const server: Server = createServer((request, response) => {
    const path = request.url === '/' ? '/index.html' : request.url ?? '/index.html';
    const file = files.get(path);
    if (!file) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': file.type });
    response.end(file.body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start static server');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

test('public export zip works from a static server without plaintext secrets', async ({ page }) => {
  test.setTimeout(45_000);
  const project = createProject('Public Smoke');
  const projectPage = project.sites[0].pages[0];
  projectPage.bodyHtml = '<main><h1>Public Smoke</h1><div data-search-widget="default"></div></main>';
  projectPage.revealBlocks.push({
    id: createId('reveal'),
    label: 'Reveal',
    prompt: 'Phrase',
    answerAliases: ['cicada passphrase'],
    secretHtml: '<p>revealed static payload</p>',
    failureMessage: 'no'
  });
  project.searchRules.push({
    id: createId('search'),
    label: 'Search',
    terms: ['open sesame'],
    aliases: [],
    mode: 'exact',
    targetPageId: projectPage.id,
    hint: '',
    failureMessage: 'no'
  });

  const blob = await buildPublicExportZip(project);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  await expect(await zip.file(PUBLIC_EXPORT_LICENSE_FILENAME)?.async('text')).toContain('MIT License');
  const server = await servePublicZip(blob);
  try {
    await page.goto(server.baseUrl);
    await expect(page.getByRole('heading', { name: 'Public Smoke' })).toBeVisible();
    await page.getByLabel('Search').fill('OPEN　SESAME');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('link', { name: 'Opening Page' })).toBeVisible();
    await page.getByLabel('Phrase').fill('CICADA PASSPHRASE');
    await page.getByRole('button', { name: 'Reveal' }).click();
    await expect(page.getByText('revealed static payload')).toBeVisible();
  } finally {
    await server.close();
  }
});
