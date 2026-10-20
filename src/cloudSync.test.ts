import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudSnapshot } from './cloudSync';
import type { AppState } from './types';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  },
}));

import {
  CloudSyncConflictError,
  mergeRefreshedCloudMedia,
  refreshCloudSnapshotMedia,
  synchronizeCloudVault,
} from './cloudSync';

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
    mocks.storageFrom.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.createSignedUrl.mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://storage.example/${path}?token=fresh` },
      error: null,
    }));
  });

  it('renews private image URLs without uploading or changing stored media paths', async () => {
    const snapshot: CloudSnapshot = {
      state: {
        people: [{ id: 'person-1', name: 'Fabi', photoUrl: 'https://storage.example/person.jpg?token=expired' }],
        ideas: [{
          id: 'gift-1',
          personId: 'person-1',
          title: 'Camera',
          imageUrl: 'https://storage.example/gift.jpg?token=expired',
          createdAt: '2026-10-19T12:00:00.000Z',
        }],
        memories: [],
      },
      people: {
        'person-1': {
          updatedAt: '2026-10-19T12:00:00.000Z',
          displayUrl: 'https://storage.example/person.jpg?token=expired',
          sourceUrl: null,
          storagePath: 'account-1/people/person-1/photo.jpg',
        },
      },
      gifts: {
        'gift-1': {
          updatedAt: '2026-10-19T12:00:00.000Z',
          displayUrl: 'https://storage.example/gift.jpg?token=expired',
          sourceUrl: null,
          storagePath: 'account-1/gifts/gift-1/image.jpg',
        },
      },
      memories: {},
      revision: 3,
    };

    const refreshed = await refreshCloudSnapshotMedia(snapshot);

    expect(mocks.storageFrom).toHaveBeenCalledWith('gift-vault-media');
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(refreshed.state.people[0].photoUrl).toContain('token=fresh');
    expect(refreshed.state.ideas[0].imageUrl).toContain('token=fresh');
    expect(refreshed.people['person-1'].storagePath).toBe(snapshot.people['person-1'].storagePath);
    expect(refreshed.gifts['gift-1'].storagePath).toBe(snapshot.gifts['gift-1'].storagePath);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refreshes expired cached URLs without replacing a newly selected local image', () => {
    const previous: CloudSnapshot = {
      state: {
        people: [{ id: 'person-1', name: 'Fabi', photoUrl: 'https://storage.example/person.jpg?token=expired' }],
        ideas: [
          {
            id: 'gift-1',
            personId: 'person-1',
            title: 'Camera',
            imageUrl: 'https://storage.example/gift.jpg?token=expired',
            createdAt: '2026-10-19T12:00:00.000Z',
          },
          {
            id: 'gift-2',
            personId: 'person-1',
            title: 'Book',
            imageUrl: 'https://storage.example/book.jpg?token=expired',
            createdAt: '2026-10-19T12:00:00.000Z',
          },
        ],
        memories: [],
      },
      people: {
        'person-1': {
          updatedAt: '2026-10-19T12:00:00.000Z',
          displayUrl: 'https://storage.example/person.jpg?token=expired',
          sourceUrl: null,
          storagePath: 'account-1/people/person-1/photo.jpg',
        },
      },
      gifts: {
        'gift-1': {
          updatedAt: '2026-10-19T12:00:00.000Z',
          displayUrl: 'https://storage.example/gift.jpg?token=expired',
          sourceUrl: null,
          storagePath: 'account-1/gifts/gift-1/image.jpg',
        },
        'gift-2': {
          updatedAt: '2026-10-19T12:00:00.000Z',
          displayUrl: 'https://storage.example/book.jpg?token=expired',
          sourceUrl: null,
          storagePath: 'account-1/gifts/gift-2/image.jpg',
        },
      },
      memories: {},
    };
    const refreshed: CloudSnapshot = {
      ...previous,
      state: {
        ...previous.state,
        people: [{ ...previous.state.people[0], photoUrl: 'https://storage.example/person.jpg?token=fresh' }],
        ideas: [
          { ...previous.state.ideas[0], imageUrl: 'https://storage.example/gift.jpg?token=fresh' },
          { ...previous.state.ideas[1], imageUrl: 'https://storage.example/book.jpg?token=fresh' },
        ],
      },
      people: {
        'person-1': { ...previous.people['person-1'], displayUrl: 'https://storage.example/person.jpg?token=fresh' },
      },
      gifts: {
        'gift-1': { ...previous.gifts['gift-1'], displayUrl: 'https://storage.example/gift.jpg?token=fresh' },
        'gift-2': { ...previous.gifts['gift-2'], displayUrl: 'https://storage.example/book.jpg?token=fresh' },
      },
    };
    const current: AppState = {
      ...previous.state,
      ideas: [
        { ...previous.state.ideas[0], imageUrl: 'data:image/png;base64,new-local-image' },
        previous.state.ideas[1],
      ],
    };

    const merged = mergeRefreshedCloudMedia(current, previous, refreshed);

    expect(merged.people[0].photoUrl).toContain('token=fresh');
    expect(merged.ideas[0].imageUrl).toBe('data:image/png;base64,new-local-image');
    expect(merged.ideas[1].imageUrl).toContain('token=fresh');
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

  it('persists a birthday purchase occurrence through the guarded person update', async () => {
    const originalPerson = { id: 'person-1', name: 'Fabi', birthday: '04-12' };
    const snapshot: CloudSnapshot = {
      state: { people: [originalPerson], ideas: [], memories: [] },
      people: {
        'person-1': {
          updatedAt: '2026-10-19T12:00:00.000Z',
          sourceUrl: null,
          storagePath: null,
        },
      },
      gifts: {},
      memories: {},
      revision: 8,
    };
    const boughtState: AppState = {
      people: [{ ...originalPerson, birthdayGiftBoughtFor: '2027-04-12' }],
      ideas: [],
      memories: [],
    };

    await expect(synchronizeCloudVault('account-1', boughtState, snapshot))
      .rejects.toBeInstanceOf(CloudSyncConflictError);

    expect(mocks.rpc).toHaveBeenCalledWith('apply_gift_vault_sync', expect.objectContaining({
      p_expected_revision: 8,
      p_changes: expect.objectContaining({
        people: {
          create: [],
          update: [expect.objectContaining({
            id: 'person-1',
            birthday: '04-12',
            birthdayGiftBoughtFor: '2027-04-12',
          })],
          delete: [],
        },
      }),
    }));
  });

  it('persists undoing a birthday purchase occurrence as a null guarded update', async () => {
    const originalPerson = {
      id: 'person-1',
      name: 'Fabi',
      birthday: '04-12',
      birthdayGiftBoughtFor: '2027-04-12',
    };
    const snapshot: CloudSnapshot = {
      state: { people: [originalPerson], ideas: [], memories: [] },
      people: {
        'person-1': {
          updatedAt: '2026-10-19T12:00:00.000Z',
          sourceUrl: null,
          storagePath: null,
        },
      },
      gifts: {},
      memories: {},
      revision: 9,
    };
    const undoneState: AppState = {
      people: [{ id: 'person-1', name: 'Fabi', birthday: '04-12' }],
      ideas: [],
      memories: [],
    };

    await expect(synchronizeCloudVault('account-1', undoneState, snapshot))
      .rejects.toBeInstanceOf(CloudSyncConflictError);

    expect(mocks.rpc).toHaveBeenCalledWith('apply_gift_vault_sync', expect.objectContaining({
      p_changes: expect.objectContaining({
        people: expect.objectContaining({
          update: [expect.objectContaining({ birthdayGiftBoughtFor: null })],
        }),
      }),
    }));
  });
});
