import JSZip from 'jszip';
import type { ExportCheckResult, ExportFileSummary, LeakageFinding } from '../../types/export';
import type { StudioProject } from '../../types/project';
import { hasTraversalPath } from '../path-safety/pathSafety';

const FORBIDDEN_FILENAMES = new Set(['structure.json', 'flowchart.json', 'project.json']);
const STATIC_FORBIDDEN_TEXT = ['author-only', 'internal condition', 'plain answer'];

async function readableZipInput(input: Blob | ArrayBuffer): Promise<Blob | ArrayBuffer> {
  if (input instanceof Blob && typeof input.arrayBuffer === 'function') {
    return input.arrayBuffer();
  }
  return input;
}

function addFinding(findings: LeakageFinding[], path: string, reason: string): void {
  findings.push({ path, reason });
}

function collectForbiddenProjectText(project: StudioProject): string[] {
  const values = new Set<string>();
  for (const page of project.pages) {
    if (page.status !== 'published') {
      values.add(page.title);
      values.add(page.bodyHtml);
    }
    values.add(page.memo);
    for (const reveal of page.revealBlocks) {
      values.add(reveal.secretHtml);
      for (const answer of reveal.answerAliases) {
        values.add(answer);
      }
    }
    for (const unlock of page.unlockPages) {
      values.add(unlock.payloadHtml);
      for (const answer of unlock.answerAliases) {
        values.add(answer);
      }
    }
  }
  for (const rule of project.searchRules) {
    for (const term of rule.terms) {
      values.add(term);
    }
    for (const alias of rule.aliases) {
      values.add(alias);
    }
  }
  for (const condition of project.conditions) {
    values.add(condition.internalNote);
  }
  for (const script of project.importedScripts) {
    values.add(script.name);
    values.add(script.path);
    values.add(script.source ?? '');
    if (script.metadata) {
      values.add(JSON.stringify(script.metadata));
    }
  }
  for (const flow of project.flowcharts) {
    values.add(flow.name);
  }
  return [...values].map((value) => value.trim()).filter((value) => value.length >= 4);
}

export async function checkPublicExportZip(input: Blob | ArrayBuffer, project?: StudioProject): Promise<ExportCheckResult> {
  const zip = await JSZip.loadAsync(await readableZipInput(input));
  const findings: LeakageFinding[] = [];
  const files: ExportFileSummary[] = [];
  const forbiddenProjectText = project ? collectForbiddenProjectText(project) : [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      continue;
    }
    const basename = path.split('/').at(-1)?.toLowerCase() ?? path.toLowerCase();
    if (hasTraversalPath(path)) {
      addFinding(findings, path, 'Export path is unsafe or traverses outside the site root.');
    }
    if (FORBIDDEN_FILENAMES.has(basename)) {
      addFinding(findings, path, 'Internal project file name must not appear in public export.');
    }
    const bytes = await entry.async('uint8array');
    files.push({ path, bytes: bytes.byteLength });
    const text = new TextDecoder().decode(bytes);
    for (const marker of STATIC_FORBIDDEN_TEXT) {
      if (text.includes(marker)) {
        addFinding(findings, path, `Public export contains forbidden marker "${marker}".`);
      }
    }
    for (const secret of forbiddenProjectText) {
      if (text.includes(secret)) {
        addFinding(findings, path, 'Public export contains internal project text or a plain answer.');
      }
    }
  }

  return { ok: findings.length === 0, files, findings };
}
