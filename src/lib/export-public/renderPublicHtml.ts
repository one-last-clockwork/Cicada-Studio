// SPDX-License-Identifier: AGPL-3.0-or-later
// Generated public-export copies of the document shell/widgets emitted here are available under the MIT terms in LICENCE-OUTPUT.md.

import type { PublicRuntimePayload, StudioPage, StudioProject, UnlockPage } from '../../types/project';
import { canRunScriptPreview } from '../../features/preview/previewPolicy';
import { escapeHtml, escapeStyleText, sanitizeHtml } from '../html/sanitize';

export const GENERIC_FAILURE = 'The submitted value did not unlock anything.';

export function renderSearchWidget(): string {
  return `<section class="arg-widget" data-arg-search="default">
  <form>
    <label>Search <input name="query" autocomplete="off"></label>
    <button type="submit">Search</button>
  </form>
  <div data-arg-result aria-live="polite"></div>
</section>`;
}

export function renderRevealWidget(publicId: string, prompt: string): string {
  return `<section class="arg-widget" data-arg-reveal="${escapeHtml(publicId)}">
  <form>
    <label>${escapeHtml(prompt)} <input name="response" autocomplete="off"></label>
    <button type="submit">Reveal</button>
  </form>
  <div data-arg-result aria-live="polite"></div>
</section>`;
}

export function renderUnlockWidget(publicId: string, unlock: UnlockPage): string {
  return `<main>
  <h1>${escapeHtml(unlock.label)}</h1>
  <section class="arg-widget" data-arg-unlock="${escapeHtml(publicId)}">
    <form>
      <label>${escapeHtml(unlock.prompt)} <input name="response" autocomplete="off"></label>
      <button type="submit">Unlock</button>
    </form>
    <div data-arg-result aria-live="polite"></div>
  </section>
</main>`;
}

export function renderPublicPageDocument(
  project: StudioProject,
  page: StudioPage,
  bodyHtml: string,
  payload: PublicRuntimePayload,
  runtimePath = 'runtime.js'
): string {
  const theme = project.themes.find((item) => item.id === page.themeId) ?? project.themes[0];
  const body = canRunScriptPreview(project, page) ? bodyHtml : sanitizeHtml(bodyHtml);
  const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(page.title)}</title>
    <style>${escapeStyleText(theme?.css ?? '')}</style>
  </head>
  <body>
    ${body}
    <script type="application/json" id="arg-payload">${payloadJson}</script>
    <script src="${runtimePath}" defer></script>
  </body>
</html>`;
}

export function injectPublicWidgets(bodyHtml: string, revealWidgets: string[], includeSearch: boolean, pageNumber: number): string {
  const withSearch = includeSearch
    ? bodyHtml.replace(/<div\s+data-search-widget=["']default["']\s*><\/div>/i, renderSearchWidget())
    : bodyHtml;
  const counter = `<p class="page-counter">Page <span data-page-counter="${pageNumber}"></span></p>`;
  return `${withSearch}\n${revealWidgets.join('\n')}\n${counter}`;
}
