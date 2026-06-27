import type { StudioPage, StudioProject } from '../../types/project';
import { sanitizeHtml } from '../../lib/html/sanitize';

export function canRunScriptPreview(project: StudioProject, page: StudioPage): boolean {
  return project.scriptPreviewEnabled && page.allowScripts;
}

export function getPreviewSandbox(project: StudioProject, page: StudioPage): string {
  return canRunScriptPreview(project, page) ? 'allow-scripts' : '';
}

export function getPreviewHtml(project: StudioProject, page: StudioPage): string {
  const body = canRunScriptPreview(project, page) ? page.bodyHtml : sanitizeHtml(page.bodyHtml);
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}
