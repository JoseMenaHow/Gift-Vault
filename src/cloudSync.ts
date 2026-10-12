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

export type CloudSnapshot = {
  state: AppState;
  people: Record<string, CloudRecordMeta>;
  gifts: Record<string, CloudRecordMeta>;
  memories: Record<string, CloudRecordMeta>;
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

export async function loadCloudVault(ownerId: string): Promise<CloudSnapshot> {
  const [peopleRows, giftRows, memoryRows] = await Promise.all([
    loadRows(ownerId, PEOPLE_TABLE),
    loadRows(ownerId, GIFTS_TABLE),
    loadRows(ownerId, MEMORIES_TABLE),
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
) {
  if (previous && url === previous.displayUrl) {
    return { sourceUrl: previous.sourceUrl || null, storagePath: previous.storagePath || null };
  }
  if (!url) return { sourceUrl: null, storagePath: null };
  if (!hasLocalMedia(url)) return { sourceUrl: url, storagePath: null };
  return { sourceUrl: null, storagePath: await uploadLocalMedia(ownerId, category, id, url) };
}

async function insertRow(table: string, row: Record<string, unknown>) {
  const { data, error } = await getClient().from(table).insert(row).select('*');
  if (error) {
    if (error.code === '23505') throw new CloudSyncConflictError();
    throw error;
  }
  if (!data || data.length !== 1) throw new CloudSyncConflictError();
}

async function updateRow(table: string, ownerId: string, id: string, expectedUpdatedAt: string, updates: Record<string, unknown>) {
  const { data, error } = await getClient()
    .from(table)
    .update(updates)
    .eq('owner_id', ownerId)
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .is('deleted_at', null)
    .select('*');
  if (error) throw error;
  if (!data || data.length !== 1) throw new CloudSyncConflictError();
}

async function deleteRow(table: string, ownerId: string, id: string, expectedUpdatedAt: string) {
  await updateRow(table, ownerId, id, expectedUpdatedAt, { deleted_at: new Date().toISOString() });
}

function mapById<T extends { id: string }>(values: T[]) {
  return new Map(values.map((value) => [value.id, value]));
}

async function syncPeople(ownerId: string, next: AppState, snapshot: CloudSnapshot) {
  const current = mapById(snapshot.state.people);

  for (const person of next.people) {
    const existing = current.get(person.id);
    const meta = snapshot.people[person.id];
    if (!existing && !meta) {
      const media = await resolveMedia(ownerId, 'people', person.id, person.photoUrl);
      await insertRow(PEOPLE_TABLE, {
        owner_id: ownerId, id: person.id, name: person.name, tags: person.tags || [],
        photo_url: media.sourceUrl, photo_storage_path: media.storagePath,
        emoji: person.emoji || null, label_text: person.labelText || null, birthday: person.birthday || null,
        import_source_id: 'sync',
      });
      continue;
    }
    if (!existing || !meta || meta.deletedAt) throw new CloudSyncConflictError();
    if (samePerson(person, existing, meta)) continue;

    const media = await resolveMedia(ownerId, 'people', person.id, person.photoUrl, meta);
    await updateRow(PEOPLE_TABLE, ownerId, person.id, meta.updatedAt, {
      name: person.name, tags: person.tags || [], photo_url: media.sourceUrl,
      photo_storage_path: media.storagePath, emoji: person.emoji || null,
      label_text: person.labelText || null, birthday: person.birthday || null,
    });
  }
}

async function syncGifts(ownerId: string, next: AppState, snapshot: CloudSnapshot) {
  const current = mapById(snapshot.state.ideas);
  for (const gift of next.ideas) {
    const existing = current.get(gift.id);
    const meta = snapshot.gifts[gift.id];
    if (!existing && !meta) {
      const media = await resolveMedia(ownerId, 'gifts', gift.id, gift.imageUrl);
      await insertRow(GIFTS_TABLE, {
        owner_id: ownerId, id: gift.id, person_id: gift.personId, title: gift.title,
        description: gift.description || null, links: gift.links || [], occasion_tags: gift.occasionTags || [],
        image_url: media.sourceUrl, image_storage_path: media.storagePath, created_at: gift.createdAt,
        gifted_at: gift.giftedAt || null, import_source_id: 'sync',
      });
      continue;
    }
    if (!existing || !meta || meta.deletedAt) throw new CloudSyncConflictError();
    if (sameGift(gift, existing, meta)) continue;

    const media = await resolveMedia(ownerId, 'gifts', gift.id, gift.imageUrl, meta);
    await updateRow(GIFTS_TABLE, ownerId, gift.id, meta.updatedAt, {
      person_id: gift.personId, title: gift.title, description: gift.description || null,
      links: gift.links || [], occasion_tags: gift.occasionTags || [],
      image_url: media.sourceUrl, image_storage_path: media.storagePath, gifted_at: gift.giftedAt || null,
    });
  }
}

async function syncMemories(ownerId: string, next: AppState, snapshot: CloudSnapshot) {
  const current = mapById(snapshot.state.memories);
  for (const memory of next.memories) {
    const existing = current.get(memory.id);
    const meta = snapshot.memories[memory.id];
    if (!existing && !meta) {
      await insertRow(MEMORIES_TABLE, {
        owner_id: ownerId, id: memory.id, person_id: memory.personId, text: memory.text,
        created_at: memory.createdAt, import_source_id: 'sync',
      });
      continue;
    }
    if (!existing || !meta || meta.deletedAt) throw new CloudSyncConflictError();
    if (sameMemory(memory, existing)) continue;
    await updateRow(MEMORIES_TABLE, ownerId, memory.id, meta.updatedAt, {
      person_id: memory.personId, text: memory.text,
    });
  }
}

async function syncDeletes(ownerId: string, next: AppState, snapshot: CloudSnapshot) {
  const people = new Set(next.people.map((person) => person.id));
  const gifts = new Set(next.ideas.map((gift) => gift.id));
  const memories = new Set(next.memories.map((memory) => memory.id));

  for (const gift of snapshot.state.ideas) {
    if (!gifts.has(gift.id)) await deleteRow(GIFTS_TABLE, ownerId, gift.id, snapshot.gifts[gift.id].updatedAt);
  }
  for (const memory of snapshot.state.memories) {
    if (!memories.has(memory.id)) await deleteRow(MEMORIES_TABLE, ownerId, memory.id, snapshot.memories[memory.id].updatedAt);
  }
  for (const person of snapshot.state.people) {
    if (!people.has(person.id)) await deleteRow(PEOPLE_TABLE, ownerId, person.id, snapshot.people[person.id].updatedAt);
  }
}

export async function synchronizeCloudVault(ownerId: string, next: AppState, snapshot: CloudSnapshot) {
  await syncPeople(ownerId, next, snapshot);
  await syncGifts(ownerId, next, snapshot);
  await syncMemories(ownerId, next, snapshot);
  await syncDeletes(ownerId, next, snapshot);
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
    if (/updated_at|deleted_at|column|schema cache/i.test(message)) {
      return 'Cloud sync needs the latest Gift Vault Supabase migration before it can continue.';
    }
  }
  return 'Changes are safely saved on this device. Gift Vault could not sync them yet.';
}
