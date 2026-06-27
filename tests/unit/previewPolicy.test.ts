import { describe, expect, it } from 'vitest';
import { getPreviewHtml, getPreviewSandbox } from '../../src/features/preview/previewPolicy';
import { createProject } from '../../src/lib/projects/createProject';

describe('preview policy', () => {
  it('defaults to a no-script, no-same-origin sandbox and removes scripts', () => {
    const project = createProject('Preview Test');
    const page = { ...project.pages[0], bodyHtml: '<p onclick="alert(1)">x</p><script>window.parent.hacked=true</script>' };
    expect(getPreviewSandbox(project, page)).toBe('');
    expect(getPreviewHtml(project, page)).not.toContain('<script>');
    expect(getPreviewHtml(project, page)).not.toContain('onclick');
  });

  it('requires project and page opt-in before scripts can run', () => {
    const project = createProject('Preview Test');
    project.scriptPreviewEnabled = true;
    const page = { ...project.pages[0], allowScripts: true, bodyHtml: '<script>window.flag=1</script>' };
    expect(getPreviewSandbox(project, page)).toBe('allow-scripts');
    expect(getPreviewSandbox(project, page)).not.toContain('allow-same-origin');
    expect(getPreviewHtml(project, page)).toContain('<script>');
  });
});
