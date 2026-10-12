import type { AppState } from './types';

type DurableState = {
  state: AppState;
  savedAt: number;
};

export type LocalBackupRestoreStorage = {
  getCurrentState: () => Promise<AppState>;
  downloadSafetyBackup: (state: AppState) => string;
  loadDurableState: () => Promise<DurableState | null>;
  saveDurableState: (state: AppState, savedAt: number) => Promise<void>;
  clearDurableState: () => Promise<void>;
  replaceStoredState: (state: AppState, savedAt: number) => void;
};

export class LocalBackupRestoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LocalBackupRestoreError';
  }
}

function isQuotaError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === 'QuotaExceededError'
    || /quota|storage.*full|not enough space/i.test(`${name || ''} ${message || ''}`);
}

export function getLocalBackupRestoreErrorMessage(error: unknown) {
  if (error instanceof LocalBackupRestoreError) return error.message;
  if (isQuotaError(error)) {
    return 'This backup is verified, but this browser does not have enough storage space to restore its images. Your current local data is still in place.';
  }
  return 'Gift Vault could not write this backup to this browser. Your current local data is still in place.';
}

/** Restores only the device-local vault. Cloud import is a separate, explicit action. */
export async function restoreLocalBackup(
  restoredState: AppState,
  storage: LocalBackupRestoreStorage,
) {
  let previousDurableState: DurableState | null;

  try {
    previousDurableState = await storage.loadDurableState();
  } catch (error) {
    throw new LocalBackupRestoreError(
      'Gift Vault could not access this browser’s local storage. Your current local data is still in place.',
      { cause: error },
    );
  }

  try {
    const currentState = await storage.getCurrentState();
    const safetyBackupFilename = storage.downloadSafetyBackup(currentState);
    const savedAt = Date.now();

    await storage.saveDurableState(restoredState, savedAt);
    storage.replaceStoredState(restoredState, savedAt);

    return safetyBackupFilename;
  } catch (error) {
    try {
      if (previousDurableState) {
        await storage.saveDurableState(previousDurableState.state, previousDurableState.savedAt);
      } else {
        await storage.clearDurableState();
      }
    } catch (rollbackError) {
      console.error('Failed to roll back durable storage after a restore error:', rollbackError);
    }

    throw error;
  }
}
