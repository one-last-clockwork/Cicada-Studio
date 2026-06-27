import { expect, test } from '@playwright/test';

test('local-first studio edits a page and keeps preview sandboxed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('表示言語')).toHaveValue('ja');
  await expect(page.getByRole('button', { name: '新規プロジェクト' })).toBeVisible();
  await page.getByLabel('表示言語').selectOption('en');
  await page.getByRole('button', { name: /new project/i }).click();
  await expect(page.getByLabel('Project name')).toHaveValue(/ARG Project/);
  await expect(page.getByRole('button', { name: 'Editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Editor' }).click();
  await page.getByLabel('HTML compatible page body').fill('<main><h1>Playwright Clue</h1><script>window.parent.hacked=true</script></main>');
  const frame = page.locator('iframe[title="Page preview"]');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(frame.contentFrame().getByRole('heading', { name: 'Playwright Clue' })).toBeVisible();
  const editorPreview = page.locator('.preview-frame-shell');
  await page.getByLabel('Preview width').fill('640');
  await page.getByLabel('Preview height').fill('720');
  await expect(editorPreview).toHaveCSS('width', '640px');
  await expect(editorPreview).toHaveCSS('height', '720px');
  await page.getByRole('button', { name: /insert reveal/i }).click();
  await expect(page.getByRole('heading', { name: 'Reveal Blocks' })).toBeVisible();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByText('Public Static Site')).toBeVisible();
});

test('theme workspace edits CSS with a live preview surface', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'テーマ' }).click();
  await expect(page.getByLabel('編集するテーマ')).toBeVisible();
  await expect(page.getByLabel('CSS コード')).toBeVisible();
  await expect(page.locator('iframe[title="テーマプレビュー"]')).toBeVisible();

  await page.getByRole('button', { name: 'テーマ追加' }).click();
  await expect(page.getByLabel('テーマ名')).toHaveValue('テーマ 2');
  await expect(page.getByLabel('CSS コード')).toHaveCSS('resize', 'vertical');
  await page.getByLabel('CSS コード').fill('body { background: rgb(250, 250, 250); color: rgb(20, 30, 40); }');
  await expect(page.getByLabel('CSS コード')).toContainText('rgb(20, 30, 40)');
  await page.getByLabel('プレビュー幅').fill('520');
  await page.getByLabel('プレビュー高さ').fill('480');
  await expect(page.locator('.theme-preview-pane .preview-frame-shell')).toHaveCSS('width', '520px');
  await expect(page.locator('.theme-preview-pane .preview-frame-shell')).toHaveCSS('height', '480px');
});

test('preview width follows the browser width until manually changed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'エディタ' }).click();

  const editorPreview = page.locator('.preview-frame-shell');
  await expect.poll(async () => editorPreview.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeGreaterThan(420);
  const editorWideWidth = await editorPreview.evaluate((element) => Math.round(element.getBoundingClientRect().width));
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(async () => editorPreview.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeLessThan(editorWideWidth);
  const editorAvailableWidth = await page.locator('.preview-frame-scroll').evaluate((element) => Math.round(element.clientWidth - 4));
  await page.getByLabel('プレビュー幅').fill('5000');
  await expect.poll(async () => editorPreview.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeLessThanOrEqual(editorAvailableWidth);

  await page.getByLabel('プレビュー幅').fill('320');
  const resizeHandle = page.locator('.preview-resize-handle').first();
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) throw new Error('Preview resize handle was not visible');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 4000, handleBox.y + handleBox.height / 2);
  await page.mouse.up();
  await expect.poll(async () => editorPreview.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeLessThanOrEqual(editorAvailableWidth);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'テーマ' }).click();
  const themePreview = page.locator('.theme-preview-pane .preview-frame-shell');
  await expect.poll(async () => themePreview.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeGreaterThan(420);
  const themeWideWidth = await themePreview.evaluate((element) => Math.round(element.getBoundingClientRect().width));
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(async () => themePreview.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeLessThan(themeWideWidth);
});
