import { expect, test, type Page } from '@playwright/test';

async function answerConfirmation(page: Page, expectedText: string | RegExp, buttonName: string | RegExp): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(expectedText);
  await dialog.getByRole('button', { name: buttonName }).click();
  await expect(dialog).toHaveCount(0);
}

async function isBeforeUnloadBlocked(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    return !window.dispatchEvent(event);
  });
}

test('local-first studio edits a page and keeps preview sandboxed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Cicada Studio は/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'システム紹介' })).toHaveClass(/active/);
  await expect(page.getByRole('button', { name: 'プロジェクト管理', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'プロジェクト管理' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'GitHubでソースコードを見る' })).toHaveAttribute(
    'href',
    'https://github.com/one-last-clockwork/Cicada-Studio'
  );
  await page.getByRole('button', { name: 'プロジェクト管理', exact: true }).click();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.getByLabel('表示言語')).toHaveValue('ja');
  await expect(page.getByRole('heading', { name: 'プロジェクト管理' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'プロジェクト一覧' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'プロジェクトを削除' })).toBeVisible();
  await page.getByLabel('表示言語').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Project management' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project list' })).toBeVisible();
  await page.getByRole('button', { name: /new project/i }).click();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.getByLabel('Project name')).toHaveValue(/ARG Project/);
  await expect(page.locator('.project-list-row.active')).toContainText('Active');
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

test('system guide manages project selection and deletion', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'プロジェクト管理', exact: true }).click();
  await page.getByLabel('プロジェクト名').fill('保持するプロジェクト');
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByRole('button', { name: '新規プロジェクト' }).click();
  await expect(page.getByLabel('プロジェクト名')).toHaveValue('ARGプロジェクト 2');
  await expect(page.locator('.project-list-row')).toHaveCount(2);
  await expect(page.locator('.project-list-row.active')).toContainText('ARGプロジェクト 2');

  await page.getByRole('button', { name: /保持するプロジェクト/ }).click();
  await expect(page.getByLabel('プロジェクト名')).toHaveValue('保持するプロジェクト');
  await page.getByRole('button', { name: /ARGプロジェクト 2/ }).click();
  await expect(page.getByLabel('プロジェクト名')).toHaveValue('ARGプロジェクト 2');

  await page.getByRole('button', { name: 'プロジェクトを削除' }).click();
  await answerConfirmation(page, 'ARGプロジェクト 2', 'プロジェクトを削除');
  await expect(page.getByLabel('プロジェクト名')).toHaveValue('保持するプロジェクト');
  await expect(page.getByText('ARGプロジェクト 2 を削除しました')).toBeVisible();
});

test('pages panel confirms duplicate and delete actions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^ページ/ }).click();
  await expect(page.locator('.row')).toHaveCount(1);

  await page.locator('.icon-actions button[title="複製"]').first().click();
  await answerConfirmation(page, 'Opening Page', 'キャンセル');
  await expect(page.locator('.row')).toHaveCount(1);

  await page.locator('.icon-actions button[title="複製"]').first().click();
  await answerConfirmation(page, 'Opening Page', '複製');
  await expect(page.locator('.row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Opening Page のコピー/ })).toBeVisible();

  await page.locator('.icon-actions button[title="削除"]').last().click();
  await answerConfirmation(page, 'Opening Page のコピー', 'キャンセル');
  await expect(page.locator('.row')).toHaveCount(2);

  await page.locator('.icon-actions button[title="削除"]').last().click();
  await answerConfirmation(page, 'Opening Page のコピー', '削除');
  await expect(page.locator('.row')).toHaveCount(1);
});

test('confirmation modal is required every time', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^ページ/ }).click();

  await page.locator('.icon-actions button[title="複製"]').first().click();
  await answerConfirmation(page, 'Opening Page', '複製');
  await expect(page.locator('.row')).toHaveCount(2);

  await page.locator('.icon-actions button[title="複製"]').first().click();
  await expect(page.getByRole('dialog')).toContainText('Opening Page');
  await page.getByRole('dialog').getByRole('button', { name: '複製' }).click();
  await expect(page.locator('.row')).toHaveCount(3);
});

test('close warning appears after edits until a project backup is exported', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => isBeforeUnloadBlocked(page)).toBe(false);

  await page.getByRole('button', { name: 'エディタ', exact: true }).click();
  await page.getByLabel('HTML互換のページ本文').fill('<main><h1>Backup Needed</h1></main>');
  await expect(page.getByText('プロジェクトバックアップを推奨します')).toBeVisible();
  await expect(page.getByText('IndexedDB は通常、ブラウザのサイトデータとして保存されます。')).toBeVisible();
  await expect.poll(async () => isBeforeUnloadBlocked(page)).toBe(true);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '今すぐバックアップ' }).click();
  await downloadPromise;
  await expect(page.getByText('プロジェクトバックアップを推奨します')).toHaveCount(0);
  await expect.poll(async () => isBeforeUnloadBlocked(page)).toBe(false);
});

test('source zip export and import runs through dry-run review', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'プロジェクト管理', exact: true }).click();
  await page.getByLabel('プロジェクト名').fill('Source Zip 元');
  await page.getByRole('button', { name: 'エディタ', exact: true }).click();
  await page.getByLabel('HTML互換のページ本文').fill('<main><h1>Source Zip Fixture</h1></main>');
  await page.getByRole('button', { name: '書き出し' }).click();
  await expect(page.getByText('Source Zip は Git 管理や手編集に向いた形式です。')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Source Zip 書き出し' }).click();
  const download = await downloadPromise;
  const sourceZipPath = await download.path();
  if (!sourceZipPath) throw new Error('Source Zip download path was not available');

  await page.getByLabel('Source Zip 読み込み').setInputFiles(sourceZipPath);
  const importDialog = page.getByRole('dialog', { name: 'Source Zip 取り込み確認' });
  await expect(importDialog).toBeVisible();
  await expect(importDialog.getByText('致命的なエラーはありません。')).toBeVisible();
  await expect(importDialog.getByText('自動修復予定 0 件')).toBeVisible();
  await expect(importDialog.getByText('警告 0 件')).toBeVisible();
  await expect(importDialog.getByText('新規プロジェクトとして追加')).toBeVisible();
  await importDialog.getByRole('button', { name: '取り込む' }).click();
  await expect(importDialog).toHaveCount(0);

  await expect(page.getByLabel('プロジェクト名')).toHaveValue('Source Zip 元');
  await page.getByRole('button', { name: 'プロジェクト管理', exact: true }).click();
  await expect(page.locator('.project-list-row')).toHaveCount(2);
});

test('story map nodes can be selected and repositioned', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^ストーリーマップ/ }).click();
  await expect(page.getByText('選択中のノード: Default Site')).toBeVisible();
  await expect(page.locator('.react-flow__node').first()).toHaveClass(/selected/);
  await expect(page.locator('.flow-table .row.active')).toContainText('Default Site');

  const node = page.locator('.react-flow__node').first();
  const before = await node.boundingBox();
  if (!before) throw new Error('Story Map node was not visible');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 180, before.y + before.height / 2 + 120, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => {
    const after = await node.boundingBox();
    return after ? Math.round(after.x - before.x) : 0;
  }).toBeGreaterThan(40);
  await expect.poll(async () => {
    const after = await node.boundingBox();
    return after ? Math.round(after.y - before.y) : 0;
  }).toBeGreaterThan(40);
  await expect(page.locator('.flow-table .row.active')).toContainText('Default Site');

  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'エッジ追加' })).toBeDisabled();
  await expect(page.getByLabel('From（接続元）')).toHaveValue(/.+/);
  await expect(page.getByLabel('To（接続先）')).toHaveValue(/.+/);
  await expect.poll(async () => page.getByLabel('From（接続元）').evaluate((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent)).toBe(
    'From: Default Site'
  );
  await expect.poll(async () => page.getByLabel('To（接続先）').evaluate((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent)).toBe(
    'To: Opening Page'
  );
  await expect(page.locator('.react-flow__node.edge-source')).toHaveCount(1);
  await expect(page.locator('.react-flow__node.edge-target')).toHaveCount(1);
  await expect(page.getByLabel('Default Site のノード名').locator('xpath=ancestor::div[contains(@class, "row")][1]')).toHaveClass(/edge-source/);
  await expect(page.getByLabel('Opening Page のノード名').locator('xpath=ancestor::div[contains(@class, "row")][1]')).toHaveClass(/edge-target/);
  await expect(page.getByText('この接続はすでにあります。')).toBeVisible();

  await page.getByRole('button', { name: 'エッジ削除' }).click();
  await answerConfirmation(page, 'Default Site から Opening Page', 'エッジ削除');
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'エッジ追加' })).toBeEnabled();

  await page.getByRole('button', { name: 'エッジ追加' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByRole('button', { name: 'ノード追加' }).click();
  await page.getByRole('button', { name: 'ノード 3 を削除' }).click();
  await answerConfirmation(page, 'ノード 3', '削除');
  await expect(page.getByLabel('ノード 3 のノード名')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'エディタ', exact: true }).click();

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
