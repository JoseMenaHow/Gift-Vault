import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudSnapshot } from './cloudSync';
import type { AppState } from './types';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock('./supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

import { CloudSyncConflictError, synchronizeCloudVault } from './cloudSync';

const emptyState: AppState = { people: [], ideas: [], memories: [] };
const staleSnapshot: CloudSnapshot = {
  state: emptyState,
  people: {},
  gifts: {},
  memories: {},
  revision: 4,
};

describe('cloud revision guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ error: { code: '40001', message: 'Gift Vault stale cloud sync' } });
  });

  it('rejects an in-flight sync when a restore advances the vault revision', async () => {
    await expect(synchronizeCloudVault('account-1', emptyState, staleSnapshot))
      .rejects.toBeInstanceOf(CloudSyncConflictError);

    expect(mocks.rpc).toHaveBeenCalledWith('apply_gift_vault_sync', expect.objectContaining({
      p_expected_revision: 4,
    }));
    expect(mocks.from).not.toHaveBeenCalledWith('gift_vault_people');
    expect(mocks.from).not.toHaveBeenCalledWith('gift_vault_gifts');
    expect(mocks.from).not.toHaveBeenCalledWith('gift_vault_memories');
  });

  it('does not directly recreate a stale record after a vault replacement', async () => {
    const staleLocalState: AppState = {
      people: [{ id: 'old-person', name: 'Fabi' }],
      ideas: [],
      memories: [],
    };

    await expect(synchronizeCloudVault('account-1', staleLocalState, staleSnapshot))
      .rejects.toBeInstanceOf(CloudSyncConflictError);

    expect(mocks.rpc).toHaveBeenCalledWith('apply_gift_vault_sync', expect.objectContaining({
      p_changes: expect.objectContaining({
        people: expect.objectContaining({
          create: [expect.objectContaining({ id: 'old-person' })],
        }),
      }),
    }));
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
