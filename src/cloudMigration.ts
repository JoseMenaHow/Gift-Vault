import type { AppState } from './types';
import { loadCloudVault, synchronizeCloudVault, type CloudMediaReference } from './cloudSync';
import { supabase } from './supabase';

const MEDIA_BUCKET = 'gift-vault-media';
const IMPORT_TABLE = 'gift_vault_imports';
const PEOPLE_TABLE = 'gift_vault_people';
const GIFTS_TABLE = 'gift_vault_gifts';
const MEMORIES_TABLE = 'gift_vault_memories';

export type LocalVaultCounts = {
  people: number;
  gifts: number;
  memories: number;
  media: number;
};

export type ImportReadiness =
  | { kind: 'ready' }
  | { kind: 'resume' }
  | { kind: 'complete' }
  | { kind: 'cloud-data-conflict' };

export type ImportProgress = {
  step: 'preparing' | 'uploading-media' | 'importing-records' | 'verifying';
  current?: number;
  total?: number;
};

type CloudImport = {
  source_id: string;
  status: 'in_progress' | 'completed';
};

type PreparedMedia = CloudMediaReference;

function getClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

function sortById<T extends { id: string }>(values: T[]) {
  return [...values].sort((first, second) => first.id.localeCompare(second.id));
}

function stateForFingerprint(state: AppState) {
  return {
    people: sortById(state.people),
    gifts: sortById(state.ideas),
    memories: sortById(state.memories),
  };
}

function hasLocalMedia(url?: string) {
  return Boolean(url && (url.startsWith('data:') || url.startsWith('blob:')));
}

function getMediaExtension(contentType: string) {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/svg+xml': 'svg',
  };

  return extensions[contentType.toLowerCase()] || 'image';
}

function storageSafeId(value: string) {
  return encodeURIComponent(value).replace(/%/g, '_');
}

function isSchemaMissingError(error: { code?: string; message?: string }) {
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || error.code === 'PGRST202'
    || /could not find the table|could not find the function|relation .* does not exist|apply_gift_vault_sync/i.test(error.message || '');
}

export function getLocalVaultCounts(state: AppState): LocalVaultCounts {
  return {
    people: state.people.length,
    gifts: state.ideas.length,
    memories: state.memories.length,
    media: state.people.filter((person) => hasLocalMedia(person.photoUrl)).length
      + state.ideas.filter((idea) => hasLocalMedia(idea.imageUrl)).length,
  };
}

export async function getLocalImportSourceId(state: AppState) {
  const input = new TextEncoder().encode(JSON.stringify(stateForFingerprint(state)));
  const digest = await crypto.subtle.digest('SHA-256', input);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `local-${hash}`;
}

async function countCloudRows(ownerId: string, table: string) {
  const { count, error } = await getClient()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId);

  if (error) throw error;
  return count || 0;
}

export async function inspectCloudImport(ownerId: string, sourceId: string): Promise<ImportReadiness> {
  const { data, error } = await getClient()
    .from(IMPORT_TABLE)
    .select('source_id, status')
    .eq('owner_id', ownerId)
    .maybeSingle<CloudImport>();

  if (error) throw error;

  if (data) {
    if (data.source_id !== sourceId) return { kind: 'cloud-data-conflict' };
    return data.status === 'completed' ? { kind: 'complete' } : { kind: 'resume' };
  }

  const peopleCount = await countCloudRows(ownerId, PEOPLE_TABLE);
  const giftsCount = await countCloudRows(ownerId, GIFTS_TABLE);
  const memoriesCount = await countCloudRows(ownerId, MEMORIES_TABLE);

  return peopleCount || giftsCount || memoriesCount
    ? { kind: 'cloud-data-conflict' }
    : { kind: 'ready' };
}

async function createImport(ownerId: string, sourceId: string, counts: LocalVaultCounts) {
  const { error } = await getClient().from(IMPORT_TABLE).insert({
    owner_id: ownerId,
    source_id: sourceId,
    status: 'in_progress',
    expected_people: counts.people,
    expected_gifts: counts.gifts,
    expected_memories: counts.memories,
  });

  if (error) throw error;
}

async function uploadMedia(
  ownerId: string,
  sourceId: string,
  category: 'people' | 'gifts',
  entityId: string,
  sourceUrl: string | undefined,
): Promise<PreparedMedia> {
  if (!sourceUrl) return { sourceUrl: null, storagePath: null };
  if (!hasLocalMedia(sourceUrl)) return { sourceUrl, storagePath: null };

  let image: Blob;
  try {
    image = await fetch(sourceUrl).then(async (response) => {
      if (!response.ok) throw new Error('The image could not be read from this browser.');
      return response.blob();
    });
  } catch {
    throw new Error('One of this device’s uploaded images could not be read. Your local data is unchanged; reattach that image and try again.');
  }

  if (!image.type.startsWith('image/')) {
    throw new Error('One of this device’s uploads is not an image. Your local data is unchanged.');
  }

  const path = [
    ownerId,
    'imports',
    sourceId,
    category,
    `${storageSafeId(entityId)}.${getMediaExtension(image.type)}`,
  ].join('/');
  const { error } = await getClient().storage.from(MEDIA_BUCKET).upload(path, image, {
    cacheControl: '31536000',
    contentType: image.type,
    upsert: true,
  });

  if (error) throw error;
  return { sourceUrl: null, storagePath: path };
}

async function getImportedIds(ownerId: string, sourceId: string, table: string) {
  const { data, error } = await getClient()
    .from(table)
    .select('id')
    .eq('owner_id', ownerId)
    .eq('import_source_id', sourceId);

  if (error) throw error;
  return new Set((data || []).map((row) => String(row.id)));
}

function hasAllIds(actual: Set<string>, expected: Array<{ id: string }>) {
  return actual.size === expected.length && expected.every((item) => actual.has(item.id));
}

async function verifyMedia(storagePaths: string[]) {
  for (const path of storagePaths) {
    const { error } = await getClient().storage.from(MEDIA_BUCKET).createSignedUrl(path, 60);
    if (error) throw error;
  }
}

async function verifyImport(ownerId: string, sourceId: string, state: AppState, mediaPaths: string[]) {
  const [people, gifts, memories] = await Promise.all([
    getImportedIds(ownerId, sourceId, PEOPLE_TABLE),
    getImportedIds(ownerId, sourceId, GIFTS_TABLE),
    getImportedIds(ownerId, sourceId, MEMORIES_TABLE),
  ]);

  if (!hasAllIds(people, state.people)
    || !hasAllIds(gifts, state.ideas)
    || !hasAllIds(memories, state.memories)) {
    throw new Error('Gift Vault could not verify every imported record. Your local data is unchanged; you can retry safely.');
  }

  await verifyMedia(mediaPaths);
}

export async function importLocalVault({
  ownerId,
  state,
  sourceId,
  readiness,
  onProgress,
}: {
  ownerId: string;
  state: AppState;
  sourceId: string;
  readiness: Extract<ImportReadiness, { kind: 'ready' | 'resume' }>;
  onProgress?: (progress: ImportProgress) => void;
}) {
  const counts = getLocalVaultCounts(state);
  if (readiness.kind === 'ready') {
    onProgress?.({ step: 'preparing' });
    await createImport(ownerId, sourceId, counts);
  }

  const peopleMedia = new Map<string, PreparedMedia>();
  const giftMedia = new Map<string, PreparedMedia>();
  const uploads = [
    ...state.people.map((person) => ({ category: 'people' as const, id: person.id, url: person.photoUrl })),
    ...state.ideas.map((gift) => ({ category: 'gifts' as const, id: gift.id, url: gift.imageUrl })),
  ].filter((media) => hasLocalMedia(media.url));

  for (const [index, media] of uploads.entries()) {
    onProgress?.({ step: 'uploading-media', current: index + 1, total: uploads.length });
    const uploaded = await uploadMedia(ownerId, sourceId, media.category, media.id, media.url);
    (media.category === 'people' ? peopleMedia : giftMedia).set(media.id, uploaded);
  }

  state.people.forEach((person) => {
    if (!peopleMedia.has(person.id) && person.photoUrl && !hasLocalMedia(person.photoUrl)) {
      peopleMedia.set(person.id, { sourceUrl: person.photoUrl, storagePath: null });
    }
  });
  state.ideas.forEach((gift) => {
    if (!giftMedia.has(gift.id) && gift.imageUrl && !hasLocalMedia(gift.imageUrl)) {
      giftMedia.set(gift.id, { sourceUrl: gift.imageUrl, storagePath: null });
    }
  });

  onProgress?.({ step: 'importing-records' });
  const snapshot = await loadCloudVault(ownerId);
  await synchronizeCloudVault(ownerId, state, snapshot, {
    personMedia: peopleMedia,
    giftMedia,
    importSourceId: sourceId,
  });

  const storagePaths = [...peopleMedia.values(), ...giftMedia.values()]
    .map((media) => media.storagePath)
    .filter((path): path is string => Boolean(path));
  onProgress?.({ step: 'verifying' });
  await verifyImport(ownerId, sourceId, state, storagePaths);

  const { error } = await getClient()
    .from(IMPORT_TABLE)
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('owner_id', ownerId)
    .eq('source_id', sourceId)
    .eq('status', 'in_progress');
  if (error) throw error;
}

export function getCloudMigrationErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message);
    if (isSchemaMissingError(error as { code?: string; message?: string })) {
      return 'Cloud import needs its database setup before it can start. Apply the Gift Vault Supabase migration, then try again.';
    }
    if (/row-level security|permission denied|not authorized/i.test(message)) {
      return 'Gift Vault could not confirm permission to write to your account. Check the Supabase migration and sign in again.';
    }
  }

  return 'Import paused before it was marked complete. Your local data is unchanged, and you can safely retry.';
}

export { isSchemaMissingError };
