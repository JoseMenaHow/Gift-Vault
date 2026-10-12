import { describe, expect, it, vi } from 'vitest';
import { readBackupFile } from './backup';
import { getLocalBackupRestoreErrorMessage, restoreLocalBackup } from './localBackupRestore';
import type { AppState } from './types';

const preCloudBackup = {
  format: 'gift-vault-backup',
  version: 1,
  exportedAt: '2026-10-10T12:00:00.000Z',
  state: {
    people: [{
      id: 'person-1',
      name: 'Fabi',
      relationship: 'Family',
      birthday: '1995-04-12',
      photoUrl: 'data:image/png;base64,cGhvdG8=',
    }],
    memories: [{ id: 'memory-1', personId: 'person-1', text: 'Loves coffee', createdAt: '2026-01-01T00:00:00.000Z' }],
    ideas: [{
      id: 'gift-1',
      personId: 'person-1',
      title: 'Coffee grinder',
      link: 'https://example.com/grinder',
      occasionTags: ['Birthday'],
      imageUrl: 'data:image/png;base64,Z2lmdC1waG90bw==',
      createdAt: '2026-01-02T00:00:00.000Z',
    }],
  },
};

describe('pre-cloud backups', () => {
  it('restores a legacy local backup without any cloud operation', async () => {
    const restoredState = await readBackupFile(new File([JSON.stringify(preCloudBackup)], 'gift-vault-backup.json'));
    const savedStates: AppState[] = [];
    const replaceStoredState = vi.fn();
    const downloadSafetyBackup = vi.fn(() => 'gift-vault-safety-2026-10-12.json');

    await restoreLocalBackup(restoredState, {
      getCurrentState: async () => ({ people: [], ideas: [], memories: [] }),
      downloadSafetyBackup,
      loadDurableState: async () => null,
      saveDurableState: async (state) => { savedStates.push(state); },
      clearDurableState: async () => undefined,
      replaceStoredState,
    });

    expect(restoredState).toEqual({
      people: [{
        id: 'person-1',
        name: 'Fabi',
        tags: ['Family'],
        birthday: '04-12',
        photoUrl: 'data:image/png;base64,cGhvdG8=',
      }],
      memories: [{ id: 'memory-1', personId: 'person-1', text: 'Loves coffee', createdAt: '2026-01-01T00:00:00.000Z' }],
      ideas: [{
        id: 'gift-1',
        personId: 'person-1',
        title: 'Coffee grinder',
        links: ['https://example.com/grinder'],
        occasionTags: ['Birthday'],
        imageUrl: 'data:image/png;base64,Z2lmdC1waG90bw==',
        createdAt: '2026-01-02T00:00:00.000Z',
      }],
    });
    expect(savedStates).toEqual([restoredState]);
    expect(replaceStoredState).toHaveBeenCalledWith(restoredState, expect.any(Number));
    expect(downloadSafetyBackup).toHaveBeenCalledTimes(1);
  });

  it('rolls back the durable copy when browser storage cannot fit restored images', async () => {
    const restoredState = await readBackupFile(new File([JSON.stringify(preCloudBackup)], 'gift-vault-backup.json'));
    const previousState: AppState = {
      people: [{ id: 'current-person', name: 'Current vault' }],
      ideas: [],
      memories: [],
    };
    const saveDurableState = vi.fn(async () => undefined);
    const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');

    await expect(restoreLocalBackup(restoredState, {
      getCurrentState: async () => previousState,
      downloadSafetyBackup: () => 'gift-vault-safety-2026-10-12.json',
      loadDurableState: async () => ({ state: previousState, savedAt: 123 }),
      saveDurableState,
      clearDurableState: async () => undefined,
      replaceStoredState: () => { throw quotaError; },
    })).rejects.toBe(quotaError);

    expect(saveDurableState).toHaveBeenNthCalledWith(1, restoredState, expect.any(Number));
    expect(saveDurableState).toHaveBeenNthCalledWith(2, previousState, 123);
    expect(getLocalBackupRestoreErrorMessage(quotaError)).toContain('does not have enough storage space');
  });
});
