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
  await page.getByRole('button', { name: /insert reveal/i }).click();
  await expect(page.getByRole('heading', { name: 'Reveal Blocks' })).toBeVisible();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByText('Public Static Site')).toBeVisible();
});
