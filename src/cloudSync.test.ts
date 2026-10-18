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

  it('moves an existing gift with one update and preserves its data', async () => {
    const originalGift = {
      id: 'gift-1',
      personId: 'person-1',
      title: 'Coffee grinder',
      description: 'Burr grinder',
      links: ['https://example.com/grinder'],
      occasionTags: ['Birthday'],
      imageUrl: 'https://example.com/grinder.jpg',
      createdAt: '2026-01-02T00:00:00.000Z',
      giftedAt: '2026-02-03T00:00:00.000Z',
    };
    const snapshot: CloudSnapshot = {
      state: { people: [], ideas: [originalGift], memories: [] },
      people: {},
      gifts: {
        'gift-1': {
          updatedAt: '2026-10-17T12:00:00.000Z',
          displayUrl: originalGift.imageUrl,
          sourceUrl: originalGift.imageUrl,
          storagePath: null,
        },
      },
      memories: {},
      revision: 5,
    };
    const movedState: AppState = {
      people: [],
      ideas: [{ ...originalGift, personId: 'person-2' }],
      memories: [],
    };

    await expect(synchronizeCloudVault('account-1', movedState, snapshot))
      .rejects.toBeInstanceOf(CloudSyncConflictError);

    expect(mocks.rpc).toHaveBeenCalledWith('apply_gift_vault_sync', expect.objectContaining({
      p_changes: expect.objectContaining({
        gifts: {
          create: [],
          update: [expect.objectContaining({
            id: 'gift-1',
            personId: 'person-2',
            title: originalGift.title,
            description: originalGift.description,
            links: originalGift.links,
            occasionTags: originalGift.occasionTags,
            imageUrl: originalGift.imageUrl,
            createdAt: originalGift.createdAt,
            giftedAt: originalGift.giftedAt,
          })],
          delete: [],
        },
      }),
    }));
  });
});
