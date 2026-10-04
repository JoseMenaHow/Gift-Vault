import type { AppState } from './types';

const DATABASE_NAME = 'gift-vault';
const STORE_NAME = 'state';
const RECORD_ID = 'current';

export type DurableState = {
  state: AppState;
  savedAt: number;
};

type StoredRecord = DurableState & {
  id: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isStoredRecord(value: unknown): value is StoredRecord {
  if (!value || typeof value !== 'object') return false;

  const record = value as Partial<StoredRecord>;
  if (!record.state) return false;

  return record.id === RECORD_ID
    && typeof record.savedAt === 'number'
    && Array.isArray(record.state.people)
    && Array.isArray(record.state.memories)
    && Array.isArray(record.state.ideas);
}

export async function loadDurableState(): Promise<DurableState | null> {
  if (!('indexedDB' in window)) return null;

  const database = await openDatabase();
  try {
    const record = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(RECORD_ID);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return isStoredRecord(record) ? { state: record.state, savedAt: record.savedAt } : null;
  } finally {
    database.close();
  }
}

export async function saveDurableState(state: AppState, savedAt: number): Promise<void> {
  if (!('indexedDB' in window)) return;

  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ id: RECORD_ID, state, savedAt } satisfies StoredRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
