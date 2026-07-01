import { beforeEach, describe, expect, it } from 'vitest';
import { exportProjectBackupZip, importProjectBackupZip } from '../../src/features/backup/backupZip';
import { createProject } from '../../src/lib/projects/createProject';
import { clearProjectsForTests, getProject, listProjects, saveProject } from '../../src/lib/db/projectsDb';

describe('IndexedDB project lifecycle and backup', () => {
  beforeEach(async () => {
    await clearProjectsForTests();
  });

  it('saves and restores a project from IndexedDB', async () => {
    const project = createProject('Lifecycle Test');
    await saveProject(project);
    await expect(getProject(project.id)).resolves.toMatchObject({ id: project.id, name: 'Lifecycle Test' });
    await expect(listProjects()).resolves.toHaveLength(1);
  });

  it('roundtrips author data through project backup zip', async () => {
    const project = createProject('Backup Test');
    project.sites[0].pages[0].memo = 'author-only memo';
    const blob = await exportProjectBackupZip(project);
    const restored = await importProjectBackupZip(blob);
    expect(restored.sites[0].pages[0].memo).toBe('author-only memo');
  });
});
