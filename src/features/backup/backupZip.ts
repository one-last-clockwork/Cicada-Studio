import JSZip from 'jszip';
import type { StudioProject } from '../../types/project';
import { hasTraversalPath } from '../../lib/path-safety/pathSafety';
import { migrateProject } from '../../lib/projects/migrateProject';

const BACKUP_MANIFEST = {
  kind: 'cicada-studio-project-backup',
  version: 1
};

async function readableZipInput(input: Blob | ArrayBuffer): Promise<Blob | ArrayBuffer> {
  if (input instanceof Blob && typeof input.arrayBuffer === 'function') {
    return input.arrayBuffer();
  }
  return input;
}

export async function exportProjectBackupZip(project: StudioProject): Promise<Blob> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(BACKUP_MANIFEST, null, 2));
  zip.file('project.json', JSON.stringify(project, null, 2));
  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return new Blob([buffer], { type: 'application/zip' });
}

export async function importProjectBackupZip(input: Blob | ArrayBuffer): Promise<StudioProject> {
  const zip = await JSZip.loadAsync(await readableZipInput(input));
  for (const path of Object.keys(zip.files)) {
    if (hasTraversalPath(path)) {
      throw new Error('Backup zip contains an unsafe path.');
    }
  }
  const manifestFile = zip.file('manifest.json');
  const projectFile = zip.file('project.json');
  if (!manifestFile || !projectFile) {
    throw new Error('Backup zip is missing required files.');
  }
  const manifest = JSON.parse(await manifestFile.async('text')) as typeof BACKUP_MANIFEST;
  if (manifest.kind !== BACKUP_MANIFEST.kind || manifest.version !== BACKUP_MANIFEST.version) {
    throw new Error('Backup zip is not a Cicada Studio backup.');
  }
  return migrateProject(JSON.parse(await projectFile.async('text')) as unknown);
}
