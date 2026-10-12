import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from './types';

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));

vi.mock('./cloudSync', () => ({ loadCloudVault: vi.fn() }));

import { CloudRestoreError, stageCloudRestore } from './cloudRestore';

const restoreState: AppState = {
  people: [{ id: 'person-1', name: 'Fabi', tags: ['Family'], photoUrl: 'data:image/png;base64,cGhvdG8=' }],
  ideas: [{
    id: 'gift-1',
    personId: 'person-1',
    title: 'Coffee grinder',
    links: ['https://example.com/grinder'],
    occasionTags: ['Birthday'],
    imageUrl: 'data:image/png;base64,Z2lmdC1waG90bw==',
    createdAt: '2026-01-02T00:00:00.000Z',
  }],
  memories: [{ id: 'memory-1', personId: 'person-1', text: 'Loves coffee', createdAt: '2026-01-01T00:00:00.000Z' }],
};

describe('cloud backup restore staging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/image' }, error: null });
    mocks.storageFrom.mockReturnValue({ upload: mocks.upload, createSignedUrl: mocks.createSignedUrl });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['image'], { type: 'image/png' })) )));
  });

  it('stages and verifies every embedded image before writing the restore stage', async () => {
    const staged = await stageCloudRestore('account-1', restoreState, 8);

    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith('gift_vault_restore_stages');
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ base_revision: 8 }));
    expect(staged.payload.people[0].photoStoragePath).toContain('account-1/restore-staging/');
    expect(staged.payload.ideas[0].imageStoragePath).toContain('account-1/restore-staging/');
    expect(staged.payload.people[0].photoUrl).toBeUndefined();
    expect(staged.payload.ideas[0].imageUrl).toBeUndefined();
  });

  it('rejects a browser-only image before staging any cloud records', async () => {
    const invalidState: AppState = {
      ...restoreState,
      people: [{ ...restoreState.people[0], photoUrl: 'blob:browser-only-image' }],
      ideas: [],
    };

    await expect(stageCloudRestore('account-1', invalidState)).rejects.toBeInstanceOf(CloudRestoreError);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
