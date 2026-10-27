/**
 * Keeps finished daf views in the browser (IndexedDB) so a return visit paints
 * at once and only checks the server in the background.
 *
 * Every call is best-effort: private windows, blocked storage or a full disk
 * make reads return null and writes do nothing. The page works the same, it
 * just downloads again.
 */

const DB_NAME = 'talmud-local-cache';
const STORE = 'daf-views';
// Bump when the saved shape changes; old rows are then ignored.
const SHAPE = 1;
export const MAX_SAVED_DAFS = 50;

export interface SavedView<T> {
  key: string;
  shape: number;
  savedAt: number;
  value: T;
}

/** Keys to delete so only the `keep` newest rows remain. */
export function keysToPrune(rows: { key: string; savedAt: number }[], keep: number): string[] {
  if (rows.length <= keep) return [];
  return [...rows]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(keep)
    .map((r) => r.key);
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readSaved<T>(key: string): Promise<SavedView<T> | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as SavedView<T> | undefined;
        resolve(row && row.shape === SHAPE ? row : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

export async function writeSaved<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put({ key, shape: SHAPE, savedAt: Date.now(), value } satisfies SavedView<T>);
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = (all.result as SavedView<unknown>[]).map((r) => ({
          key: r.key,
          savedAt: r.savedAt,
        }));
        for (const k of keysToPrune(rows, MAX_SAVED_DAFS)) store.delete(k);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}
