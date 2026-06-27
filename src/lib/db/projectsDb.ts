import type { StudioProject } from '../../types/project';

const DB_NAME = 'cicada-studio';
const DB_VERSION = 1;
const STORE = 'projects';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function withStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = callback(store);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

export async function listProjects(): Promise<StudioProject[]> {
  const projects = await withStore<StudioProject[]>('readonly', (store) => store.getAll());
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<StudioProject | undefined> {
  return withStore<StudioProject | undefined>('readonly', (store) => store.get(id));
}

export async function saveProject(project: StudioProject): Promise<void> {
  await withStore<IDBValidKey>('readwrite', (store) => store.put(project));
}

export async function deleteProject(id: string): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.delete(id));
}

export async function clearProjectsForTests(): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.clear());
}
