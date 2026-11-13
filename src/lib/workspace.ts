import { createStore, del, entries, get, set } from 'idb-keyval';
import type { LocalEntry, LocalPhoto, Project } from '../types';

// Unsynced work lives in this browser's IndexedDB until Sync sends it to GitHub
const entryStore = createStore('marksman-entries', 'entries');
const photoStore = createStore('marksman-photos', 'photos');

// Unsynced work belongs to the repo, not to a saved project, so re-adding a project (e.g. with a new token) finds it again
export const workspaceId = (project: Project) => `${project.owner}/${project.repo}`.toLowerCase();

export const entryKey = (projectId: string, path: string) => `${projectId}:${path}`;
const photoKey = (projectId: string, url: string) => `${projectId}:${url}`;

export async function listEntries(projectId: string): Promise<LocalEntry[]> {
  const all = await entries<string, LocalEntry>(entryStore);
  return all.map(([, entry]) => entry).filter(e => e.projectId === projectId);
}

export const getEntry = (key: string) => get<LocalEntry>(key, entryStore);

export const saveEntry = (entry: LocalEntry) => set(entry.key, entry, entryStore);

export const removeEntry = (key: string) => del(key, entryStore);

// Photos are stored as raw bytes: plain ArrayBuffers clone reliably into IndexedDB everywhere
type StoredPhoto = Omit<LocalPhoto, 'blob'> & { bytes: ArrayBuffer; type: string };

function readBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

const toPhoto = ({ bytes, type, ...rest }: StoredPhoto): LocalPhoto => ({ ...rest, blob: new Blob([bytes], { type }) });

export async function listPhotos(projectId: string): Promise<LocalPhoto[]> {
  const all = await entries<string, StoredPhoto>(photoStore);
  return all.map(([, photo]) => photo).filter(p => p.projectId === projectId).map(toPhoto);
}

export async function getPhoto(projectId: string, url: string): Promise<LocalPhoto | undefined> {
  const stored = await get<StoredPhoto>(photoKey(projectId, url), photoStore);
  return stored && toPhoto(stored);
}

export async function savePhoto(photo: LocalPhoto): Promise<void> {
  const key = photoKey(photo.projectId, photo.url);
  const { blob, ...rest } = photo;
  const stored: StoredPhoto = { ...rest, key, bytes: await readBytes(blob), type: blob.type };
  await set(key, stored, photoStore);
}

export const removePhoto = (projectId: string, url: string) => del(photoKey(projectId, url), photoStore);
