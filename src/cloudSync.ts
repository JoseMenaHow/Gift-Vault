import type { AppState, GiftIdea, Memory, Person } from './types';
import { supabase } from './supabase';

const PEOPLE_TABLE = 'gift_vault_people';
const GIFTS_TABLE = 'gift_vault_gifts';
const MEMORIES_TABLE = 'gift_vault_memories';
const MEDIA_BUCKET = 'gift-vault-media';
const CACHE_PREFIX = 'gift-vault-cloud-sync-v1';

type CloudRow = Record<string, unknown>;

type MediaMeta = {
  displayUrl?: string;
  sourceUrl?: string | null;
  storagePath?: string | null;
};

type CloudRecordMeta = MediaMeta & {
  updatedAt: string;
  deletedAt?: string | null;
};

export type CloudMediaReference = {
  sourceUrl: string | null;
  storagePath: string | null;
};

type SyncDelete = {
  id: string;
  expectedUpdatedAt: string;
};

type SyncPerson = {
  id: string;
  name: string;
  tags: string[];
  photoUrl: string | null;
  photoStoragePath: string | null;
  emoji: string | null;
  labelText: string | null;
  birthday: string | null;
  birthdayGiftBoughtFor: string | null;
  importSourceId?: string;
};

type SyncGift = {
  id: string;
  personId: string;
  title: string;
  description: string | null;
  links: string[];
  occasionTags: string[];
  imageUrl: string | null;
  imageStoragePath: string | null;
  createdAt: string;
  giftedAt: string | null;
  importSourceId?: string;
};

type SyncMemory = {
  id: string;
  personId: string;
  text: string;
  createdAt: string;
  importSourceId?: string;
};

type CloudSyncPayload = {
  people: { create: SyncPerson[]; update: Array<SyncPerson & { expectedUpdatedAt: string }>; delete: SyncDelete[] };
  gifts: { create: SyncGift[]; update: Array<SyncGift & { expectedUpdatedAt: string }>; delete: SyncDelete[] };
  memories: { create: SyncMemory[]; update: Array<SyncMemory & { expectedUpdatedAt: string }>; delete: SyncDelete[] };
};

export type CloudSyncOptions = {
  personMedia?: Map<string, CloudMediaReference>;
  giftMedia?: Map<string, CloudMediaReference>;
  importSourceId?: string;
};

export type CloudSnapshot = {
  state: AppState;
  people: Record<string, CloudRecordMeta>;
  gifts: Record<string, CloudRecordMeta>;
  memories: Record<string, CloudRecordMeta>;
  revision?: number;
};

export type CloudSyncCache = {
  snapshot: CloudSnapshot;
  pending: boolean;
};

export class CloudSyncConflictError extends Error {
  constructor() {
    super('This item changed in Gift Vault on another device.');
  }
}

function getClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

function cacheKey(accountId: string) {
  return `${CACHE_PREFIX}:${accountId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSnapshot(value: unknown): value is CloudSnapshot {
  if (!isRecord(value) || !isRecord(value.state)) return false;
  const state = value.state as Partial<AppState>;
  return Array.isArray(state.people)
    && Array.isArray(state.ideas)
    && Array.isArray(state.memories)
    && isRecord(value.people)
    && isRecord(value.gifts)
    && isRecord(value.memories);
}

export function loadCloudSyncCache(accountId: string): CloudSyncCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(accountId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CloudSyncCache>;
    return isSnapshot(value.snapshot) && typeof value.pending === 'boolean'
      ? { snapshot: value.snapshot, pending: value.pending }
      : null;
  } catch {
    return null;
  }
}

export function saveCloudSyncCache(accountId: string, cache: CloudSyncCache) {
  localStorage.setItem(cacheKey(accountId), JSON.stringify(cache));
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

async function displayMedia(sourceUrl: string | null, storagePath: string | null) {
  if (!storagePath) return sourceUrl || undefined;
  const { data, error } = await getClient().storage.from(MEDIA_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function rowValue(row: CloudRow, key: string) {
  return typeof row[key] === 'string' ? row[key] : undefined;
}

async function mapPerson(row: CloudRow) {
  const sourceUrl = rowValue(row, 'photo_url') || null;
  const storagePath = rowValue(row, 'photo_storage_path') || null;
  const displayUrl = await displayMedia(sourceUrl, storagePath);
  const person: Person = {
    id: String(row.id),
    name: String(row.name),
    tags: stringArray(row.tags),
    photoUrl: displayUrl,
    emoji: rowValue(row, 'emoji'),
    labelText: rowValue(row, 'label_text'),
    birthday: rowValue(row, 'birthday'),
    birthdayGiftBoughtFor: rowValue(row, 'birthday_gift_bought_for'),
  };
  return {
    person,
    meta: {
      updatedAt: String(row.updated_at),
      deletedAt: rowValue(row, 'deleted_at') || null,
      displayUrl,
      sourceUrl,
      storagePath,
    } satisfies CloudRecordMeta,
  };
}

async function mapGift(row: CloudRow) {
  const sourceUrl = rowValue(row, 'image_url') || null;
  const storagePath = rowValue(row, 'image_storage_path') || null;
  const displayUrl = await displayMedia(sourceUrl, storagePath);
  const gift: GiftIdea = {
    id: String(row.id),
    personId: String(row.person_id),
    title: String(row.title),
    description: rowValue(row, 'description'),
    links: stringArray(row.links),
    occasionTags: stringArray(row.occasion_tags),
    imageUrl: displayUrl,
    createdAt: String(row.created_at),
    giftedAt: rowValue(row, 'gifted_at'),
  };
  return {
    gift,
    meta: {
      updatedAt: String(row.updated_at),
      deletedAt: rowValue(row, 'deleted_at') || null,
      displayUrl,
      sourceUrl,
      storagePath,
    } satisfies CloudRecordMeta,
  };
}

function mapMemory(row: CloudRow) {
  const memory: Memory = {
    id: String(row.id),
    personId: String(row.person_id),
    text: String(row.text),
    createdAt: String(row.created_at),
  };
  return {
    memory,
    meta: {
      updatedAt: String(row.updated_at),
      deletedAt: rowValue(row, 'deleted_at') || null,
    } satisfies CloudRecordMeta,
  };
}

async function loadRows(ownerId: string, table: string) {
  const { data, error } = await getClient().from(table).select('*').eq('owner_id', ownerId);
  if (error) throw error;
  return (data || []) as CloudRow[];
}

async function loadVaultRevision(ownerId: string) {
  const { data, error } = await getClient()
    .from('gift_vault_vault_revisions')
    .select('revision')
    .eq('owner_id', ownerId)
    .maybeSingle<{ revision: number }>();

  if (error) {
    if (/vault_revisions|does not exist|schema cache/i.test(error.message || '')) return undefined;
    throw error;
  }
  return data?.revision ?? 0;
}

export async function loadCloudVault(ownerId: string): Promise<CloudSnapshot> {
  const [peopleRows, giftRows, memoryRows, revision] = await Promise.all([
    loadRows(ownerId, PEOPLE_TABLE),
    loadRows(ownerId, GIFTS_TABLE),
    loadRows(ownerId, MEMORIES_TABLE),
    loadVaultRevision(ownerId),
  ]);

  const people: Person[] = [];
  const gifts: GiftIdea[] = [];
  const memories: Memory[] = [];
  const peopleMeta: Record<string, CloudRecordMeta> = {};
  const giftsMeta: Record<string, CloudRecordMeta> = {};
  const memoriesMeta: Record<string, CloudRecordMeta> = {};

  for (const row of peopleRows) {
    const mapped = await mapPerson(row);
    peopleMeta[mapped.person.id] = mapped.meta;
    if (!mapped.meta.deletedAt) people.push(mapped.person);
  }
  for (const row of giftRows) {
    const mapped = await mapGift(row);
    giftsMeta[mapped.gift.id] = mapped.meta;
    if (!mapped.meta.deletedAt) gifts.push(mapped.gift);
  }
  for (const row of memoryRows) {
    const mapped = mapMemory(row);
    memoriesMeta[mapped.memory.id] = mapped.meta;
    if (!mapped.meta.deletedAt) memories.push(mapped.memory);
  }

  return {
    state: { people, ideas: gifts, memories },
    people: peopleMeta,
    gifts: giftsMeta,
    memories: memoriesMeta,
    revision,
  };
}

function sameStringArray(first?: string[], second?: string[]) {
  return JSON.stringify(first || []) === JSON.stringify(second || []);
}

function samePerson(first: Person, second: Person, media: CloudRecordMeta) {
  return first.name === second.name
    && sameStringArray(first.tags, second.tags)
    && first.emoji === second.emoji
    && first.labelText === second.labelText
    && first.birthday === second.birthday
    && first.birthdayGiftBoughtFor === second.birthdayGiftBoughtFor
    && first.photoUrl === media.displayUrl;
}

function sameGift(first: GiftIdea, second: GiftIdea, media: CloudRecordMeta) {
  return first.title === second.title
    && first.description === second.description
    && sameStringArray(first.links, second.links)
    && sameStringArray(first.occasionTags, second.occasionTags)
    && first.createdAt === second.createdAt
    && first.giftedAt === second.giftedAt
    && first.personId === second.personId
    && first.imageUrl === media.displayUrl;
}

function sameMemory(first: Memory, second: Memory) {
  return first.personId === second.personId && first.text === second.text && first.createdAt === second.createdAt;
}

async function uploadLocalMedia(ownerId: string, category: 'people' | 'gifts', id: string, url: string) {
  let image: Blob;
  try {
    image = await fetch(url).then(async (response) => {
      if (!response.ok) throw new Error('The image could not be read from this browser.');
      return response.blob();
    });
  } catch {
    throw new Error('An uploaded image could not be read from this browser. Your changes are still saved locally.');
  }
  if (!image.type.startsWith('image/')) throw new Error('An uploaded file is not an image. Your changes are still saved locally.');

  const path = `${ownerId}/sync/${category}/${storageSafeId(id)}.${getMediaExtension(image.type)}`;
  const { error } = await getClient().storage.from(MEDIA_BUCKET).upload(path, image, {
    cacheControl: '31536000',
    contentType: image.type,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

async function resolveMedia(
  ownerId: string,
  category: 'people' | 'gifts',
  id: string,
  url: string | undefined,
  previous?: CloudRecordMeta,
  prepared?: CloudMediaReference,
): Promise<CloudMediaReference> {
  if (prepared) return prepared;
  if (previous && url === previous.displayUrl) {
    return { sourceUrl: previous.sourceUrl || null, storagePath: previous.storagePath || null };
  }
  if (!url) return { sourceUrl: null, storagePath: null };
  if (!hasLocalMedia(url)) return { sourceUrl: url, storagePath: null };
  return { sourceUrl: null, storagePath: await uploadLocalMedia(ownerId, category, id, url) };
}

function mapById<T extends { id: string }>(values: T[]) {
  return new Map(values.map((value) => [value.id, value]));
}

async function buildPeopleChanges(
  ownerId: string,
  next: AppState,
  snapshot: CloudSnapshot,
  options: CloudSyncOptions,
): Promise<CloudSyncPayload['people']> {
  const changes: CloudSyncPayload['people'] = { create: [], update: [], delete: [] };
  const current = mapById(snapshot.state.people);

  for (const person of next.people) {
    const existing = current.get(person.id);
    const meta = snapshot.people[person.id];
    if (!existing && !meta) {
      const media = await resolveMedia(ownerId, 'people', person.id, person.photoUrl, undefined, options.personMedia?.get(person.id));
      changes.create.push({
        id: person.id, name: person.name, tags: person.tags || [], photoUrl: media.sourceUrl,
        photoStoragePath: media.storagePath, emoji: person.emoji || null, labelText: person.labelText || null,
        birthday: person.birthday || null, birthdayGiftBoughtFor: person.birthdayGiftBoughtFor || null,
        importSourceId: options.importSourceId,
      });
      continue;
    }
    if (!existing || !meta || meta.deletedAt) throw new CloudSyncConflictError();
    if (samePerson(person, existing, meta)) continue;

    const media = await resolveMedia(ownerId, 'people', person.id, person.photoUrl, meta, options.personMedia?.get(person.id));
    changes.update.push({
      id: person.id, name: person.name, tags: person.tags || [], photoUrl: media.sourceUrl,
      photoStoragePath: media.storagePath, emoji: person.emoji || null, labelText: person.labelText || null,
      birthday: person.birthday || null, birthdayGiftBoughtFor: person.birthdayGiftBoughtFor || null,
      expectedUpdatedAt: meta.updatedAt,
    });
  }
  for (const person of snapshot.state.people) {
    if (!next.people.some((candidate) => candidate.id === person.id)) {
      changes.delete.push({ id: person.id, expectedUpdatedAt: snapshot.people[person.id].updatedAt });
    }
  }
  return changes;
}

async function buildGiftChanges(
  ownerId: string,
  next: AppState,
  snapshot: CloudSnapshot,
  options: CloudSyncOptions,
): Promise<CloudSyncPayload['gifts']> {
  const changes: CloudSyncPayload['gifts'] = { create: [], update: [], delete: [] };
  const current = mapById(snapshot.state.ideas);
  for (const gift of next.ideas) {
    const existing = current.get(gift.id);
    const meta = snapshot.gifts[gift.id];
    if (!existing && !meta) {
      const media = await resolveMedia(ownerId, 'gifts', gift.id, gift.imageUrl, undefined, options.giftMedia?.get(gift.id));
      changes.create.push({
        id: gift.id, personId: gift.personId, title: gift.title, description: gift.description || null,
        links: gift.links || [], occasionTags: gift.occasionTags || [], imageUrl: media.sourceUrl,
        imageStoragePath: media.storagePath, createdAt: gift.createdAt, giftedAt: gift.giftedAt || null,
        importSourceId: options.importSourceId,
      });
      continue;
    }
    if (!existing || !meta || meta.deletedAt) throw new CloudSyncConflictError();
    if (sameGift(gift, existing, meta)) continue;

    const media = await resolveMedia(ownerId, 'gifts', gift.id, gift.imageUrl, meta, options.giftMedia?.get(gift.id));
    changes.update.push({
      id: gift.id, personId: gift.personId, title: gift.title, description: gift.description || null,
      links: gift.links || [], occasionTags: gift.occasionTags || [], imageUrl: media.sourceUrl,
      imageStoragePath: media.storagePath, createdAt: gift.createdAt, giftedAt: gift.giftedAt || null,
      expectedUpdatedAt: meta.updatedAt,
    });
  }
  for (const gift of snapshot.state.ideas) {
    if (!next.ideas.some((candidate) => candidate.id === gift.id)) {
      changes.delete.push({ id: gift.id, expectedUpdatedAt: snapshot.gifts[gift.id].updatedAt });
    }
  }
  return changes;
}

function buildMemoryChanges(next: AppState, snapshot: CloudSnapshot, options: CloudSyncOptions): CloudSyncPayload['memories'] {
  const changes: CloudSyncPayload['memories'] = { create: [], update: [], delete: [] };
  const current = mapById(snapshot.state.memories);
  for (const memory of next.memories) {
    const existing = current.get(memory.id);
    const meta = snapshot.memories[memory.id];
    if (!existing && !meta) {
      changes.create.push({
        id: memory.id, personId: memory.personId, text: memory.text, createdAt: memory.createdAt,
        importSourceId: options.importSourceId,
      });
      continue;
    }
    if (!existing || !meta || meta.deletedAt) throw new CloudSyncConflictError();
    if (sameMemory(memory, existing)) continue;
    changes.update.push({
      id: memory.id, personId: memory.personId, text: memory.text, createdAt: memory.createdAt,
      expectedUpdatedAt: meta.updatedAt,
    });
  }
  for (const memory of snapshot.state.memories) {
    if (!next.memories.some((candidate) => candidate.id === memory.id)) {
      changes.delete.push({ id: memory.id, expectedUpdatedAt: snapshot.memories[memory.id].updatedAt });
    }
  }
  return changes;
}

function isStaleSyncError(error: { code?: string; message?: string }) {
  return error.code === '40001' || /cloud data changed|stale cloud sync/i.test(error.message || '');
}

export async function synchronizeCloudVault(
  ownerId: string,
  next: AppState,
  snapshot: CloudSnapshot,
  options: CloudSyncOptions = {},
) {
  if (snapshot.revision === undefined) {
    throw new CloudSyncConflictError();
  }

  const [people, gifts] = await Promise.all([
    buildPeopleChanges(ownerId, next, snapshot, options),
    buildGiftChanges(ownerId, next, snapshot, options),
  ]);
  const changes: CloudSyncPayload = {
    people,
    gifts,
    memories: buildMemoryChanges(next, snapshot, options),
  };
  const { error } = await getClient().rpc('apply_gift_vault_sync', {
    p_expected_revision: snapshot.revision,
    p_changes: changes,
  });
  if (error) {
    if (isStaleSyncError(error)) throw new CloudSyncConflictError();
    throw error;
  }
  return loadCloudVault(ownerId);
}

export function sameCloudState(first: AppState, second: AppState) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function getCloudSyncErrorMessage(error: unknown) {
  if (error instanceof CloudSyncConflictError) {
    return 'This vault changed on another device. Your local changes are still here; download a backup before refreshing from the cloud.';
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message);
    if (/network|fetch|offline|failed to fetch/i.test(message)) {
      return 'Changes are safely saved on this device and will be ready to retry when you are back online.';
    }
    if (/updated_at|deleted_at|apply_gift_vault_sync|vault_revisions|column|schema cache|permission denied/i.test(message)) {
      return 'Cloud sync needs the latest Gift Vault Supabase migration before it can continue.';
    }
  }
  return 'Changes are safely saved on this device. Gift Vault could not sync them yet.';
}
