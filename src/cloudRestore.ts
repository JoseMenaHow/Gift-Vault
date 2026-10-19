import { createBackup, downloadBackup } from './backup';
import { loadCloudVault, type CloudSnapshot } from './cloudSync';
import { supabase } from './supabase';
import type { AppState, GiftIdea, Memory, Person } from './types';

const MEDIA_BUCKET = 'gift-vault-media';
const STAGES_TABLE = 'gift_vault_restore_stages';
const REVISIONS_TABLE = 'gift_vault_vault_revisions';

export type CloudRestoreProgress = {
  step: 'backing-up' | 'staging-media' | 'staging-records' | 'replacing' | 'verifying';
  current?: number;
  total?: number;
};

type StagedPerson = Omit<Person, 'photoUrl'> & {
  photoUrl?: string;
  photoStoragePath?: string;
};

type StagedGift = Omit<GiftIdea, 'imageUrl'> & {
  imageUrl?: string;
  imageStoragePath?: string;
};

type RestorePayload = {
  people: StagedPerson[];
  ideas: StagedGift[];
  memories: Memory[];
};

type StagedRestore = {
  id: string;
  payload: RestorePayload;
  mediaPaths: string[];
};

export type CloudRestoreResult = {
  safetyBackupFilename: string;
  snapshot: CloudSnapshot;
};

export class CloudRestoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CloudRestoreError';
  }
}

function getClient() {
  if (!supabase) throw new CloudRestoreError('Cloud backup restore is not configured for this app.');
  return supabase;
}

function hasEmbeddedMedia(url?: string) {
  return Boolean(url && url.startsWith('data:'));
}

function storageSafeId(value: string) {
  return encodeURIComponent(value).replace(/%/g, '_');
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('The image could not be prepared for backup.'));
    reader.onerror = () => reject(reader.error || new Error('The image could not be prepared for backup.'));
    reader.readAsDataURL(blob);
  });
}

async function readImage(url: string, errorMessage: string) {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new CloudRestoreError(errorMessage, { cause: error });
  }

  if (!response.ok) throw new CloudRestoreError(errorMessage);
  const image = await response.blob();
  if (!image.type.startsWith('image/')) throw new CloudRestoreError(errorMessage);
  return image;
}

function validateExternalMedia(url: string) {
  if (url.startsWith('blob:')) {
    throw new CloudRestoreError('This backup contains an image that only existed temporarily in another browser. Recreate that backup from the original device before replacing your cloud vault.');
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Unsupported protocol');
  } catch {
    throw new CloudRestoreError('This backup contains an unsupported image reference. Your cloud vault has not been changed.');
  }
}

async function materializeCloudMedia(url: string, label: string) {
  const image = await readImage(url, `Gift Vault could not include ${label} in the safety backup. Your cloud vault has not been changed.`);
  return blobToDataUrl(image);
}

export async function createPortableCloudBackup(snapshot: CloudSnapshot, onProgress?: (progress: CloudRestoreProgress) => void) {
  const media = [
    ...snapshot.state.people
      .filter((person) => snapshot.people[person.id]?.storagePath && person.photoUrl)
      .map((person) => ({ kind: 'person' as const, id: person.id, url: person.photoUrl! })),
    ...snapshot.state.ideas
      .filter((idea) => snapshot.gifts[idea.id]?.storagePath && idea.imageUrl)
      .map((idea) => ({ kind: 'gift' as const, id: idea.id, url: idea.imageUrl! })),
  ];
  const people = snapshot.state.people.map((person) => ({ ...person }));
  const ideas = snapshot.state.ideas.map((idea) => ({ ...idea }));

  for (const [index, item] of media.entries()) {
    onProgress?.({ step: 'backing-up', current: index + 1, total: media.length });
    const dataUrl = await materializeCloudMedia(item.url, item.kind === 'person' ? 'a profile image' : 'a gift image');
    if (item.kind === 'person') {
      const person = people.find((candidate) => candidate.id === item.id);
      if (person) person.photoUrl = dataUrl;
    } else {
      const gift = ideas.find((candidate) => candidate.id === item.id);
      if (gift) gift.imageUrl = dataUrl;
    }
  }

  return createBackup({ people, ideas, memories: snapshot.state.memories }).state;
}

async function stageMedia(
  ownerId: string,
  stageId: string,
  category: 'people' | 'gifts',
  entityId: string,
  sourceUrl: string | undefined,
) {
  if (!sourceUrl) return { externalUrl: undefined, storagePath: undefined };
  if (!hasEmbeddedMedia(sourceUrl)) {
    validateExternalMedia(sourceUrl);
    return { externalUrl: sourceUrl, storagePath: undefined };
  }

  const image = await readImage(
    sourceUrl,
    'One of this backup’s images could not be read. Your cloud vault has not been changed.',
  );
  const path = `${ownerId}/restore-staging/${stageId}/${category}/${storageSafeId(entityId)}.${getMediaExtension(image.type)}`;
  const { error } = await getClient().storage.from(MEDIA_BUCKET).upload(path, image, {
    cacheControl: '31536000',
    contentType: image.type,
    upsert: false,
  });
  if (error) throw new CloudRestoreError('Gift Vault could not stage one of this backup’s images. Your cloud vault has not been changed.', { cause: error });

  const { error: verificationError } = await getClient().storage.from(MEDIA_BUCKET).createSignedUrl(path, 60);
  if (verificationError) throw new CloudRestoreError('Gift Vault could not verify one of this backup’s staged images. Your cloud vault has not been changed.', { cause: verificationError });
  return { externalUrl: undefined, storagePath: path };
}

export async function stageCloudRestore(
  ownerId: string,
  state: AppState,
  baseRevision = 0,
  onProgress?: (progress: CloudRestoreProgress) => void,
): Promise<StagedRestore> {
  const validState = createBackup(state).state;
  const stageId = crypto.randomUUID();
  const people: StagedPerson[] = validState.people.map((person) => ({ ...person }));
  const ideas: StagedGift[] = validState.ideas.map((idea) => ({ ...idea }));
  const media = [
    ...people.map((person) => ({ category: 'people' as const, id: person.id, url: person.photoUrl })),
    ...ideas.map((idea) => ({ category: 'gifts' as const, id: idea.id, url: idea.imageUrl })),
  ].filter((item) => Boolean(item.url));
  const mediaPaths: string[] = [];

  for (const [index, item] of media.entries()) {
    onProgress?.({ step: 'staging-media', current: index + 1, total: media.length });
    const staged = await stageMedia(ownerId, stageId, item.category, item.id, item.url);
    if (item.category === 'people') {
      const person = people.find((candidate) => candidate.id === item.id);
      if (person) {
        person.photoUrl = staged.externalUrl;
        person.photoStoragePath = staged.storagePath;
      }
    } else {
      const gift = ideas.find((candidate) => candidate.id === item.id);
      if (gift) {
        gift.imageUrl = staged.externalUrl;
        gift.imageStoragePath = staged.storagePath;
      }
    }
    if (staged.storagePath) mediaPaths.push(staged.storagePath);
  }

  const payload: RestorePayload = { people, ideas, memories: validState.memories };
  onProgress?.({ step: 'staging-records' });
  const { error } = await getClient().from(STAGES_TABLE).insert({
    owner_id: ownerId,
    id: stageId,
    payload,
    expected_people: people.length,
    expected_gifts: ideas.length,
    expected_memories: validState.memories.length,
    base_revision: baseRevision,
    status: 'staged',
  });
  if (error) throw new CloudRestoreError('Gift Vault could not stage this backup for a safe cloud replacement. Your cloud vault has not been changed.', { cause: error });

  return { id: stageId, payload, mediaPaths };
}

async function getCloudRestoreRevision(ownerId: string) {
  const { data, error } = await getClient()
    .from(REVISIONS_TABLE)
    .select('revision')
    .eq('owner_id', ownerId)
    .maybeSingle<{ revision: number }>();
  if (error) throw error;
  return data?.revision || 0;
}

function sameStrings(first?: string[], second?: string[]) {
  return JSON.stringify(first || []) === JSON.stringify(second || []);
}

function verifyRestoredVault(snapshot: CloudSnapshot, staged: StagedRestore) {
  if (snapshot.state.people.length !== staged.payload.people.length
    || snapshot.state.ideas.length !== staged.payload.ideas.length
    || snapshot.state.memories.length !== staged.payload.memories.length) {
    throw new CloudRestoreError('Gift Vault replaced the cloud records but could not verify every restored item. Keep the downloaded safety backup and refresh this vault before making changes.');
  }

  for (const expected of staged.payload.people) {
    const actual = snapshot.state.people.find((person) => person.id === expected.id);
    const media = snapshot.people[expected.id];
    if (!actual || actual.name !== expected.name || !sameStrings(actual.tags, expected.tags)
      || actual.birthday !== expected.birthday || actual.labelText !== expected.labelText
      || actual.birthdayGiftBoughtFor !== expected.birthdayGiftBoughtFor
      || actual.emoji !== expected.emoji || media?.storagePath !== expected.photoStoragePath
      || media?.sourceUrl !== (expected.photoUrl || null)) {
      throw new CloudRestoreError('Gift Vault replaced the cloud records but could not verify every restored person. Keep the downloaded safety backup and refresh this vault before making changes.');
    }
  }

  for (const expected of staged.payload.ideas) {
    const actual = snapshot.state.ideas.find((idea) => idea.id === expected.id);
    const media = snapshot.gifts[expected.id];
    if (!actual || actual.personId !== expected.personId || actual.title !== expected.title
      || actual.description !== expected.description || !sameStrings(actual.links, expected.links)
      || !sameStrings(actual.occasionTags, expected.occasionTags) || actual.createdAt !== expected.createdAt
      || actual.giftedAt !== expected.giftedAt || media?.storagePath !== expected.imageStoragePath
      || media?.sourceUrl !== (expected.imageUrl || null)) {
      throw new CloudRestoreError('Gift Vault replaced the cloud records but could not verify every restored gift. Keep the downloaded safety backup and refresh this vault before making changes.');
    }
  }

  for (const expected of staged.payload.memories) {
    const actual = snapshot.state.memories.find((memory) => memory.id === expected.id);
    if (!actual || actual.personId !== expected.personId || actual.text !== expected.text || actual.createdAt !== expected.createdAt) {
      throw new CloudRestoreError('Gift Vault replaced the cloud records but could not verify every restored memory. Keep the downloaded safety backup and refresh this vault before making changes.');
    }
  }
}

export async function replaceCloudVaultFromBackup({
  ownerId,
  state,
  onProgress,
}: {
  ownerId: string;
  state: AppState;
  onProgress?: (progress: CloudRestoreProgress) => void;
}): Promise<CloudRestoreResult> {
  onProgress?.({ step: 'backing-up' });
  const baseRevision = await getCloudRestoreRevision(ownerId);
  const currentSnapshot = await loadCloudVault(ownerId);
  const portableBackup = await createPortableCloudBackup(currentSnapshot, onProgress);
  const safetyBackupFilename = downloadBackup(portableBackup, 'cloud-safety');
  const staged = await stageCloudRestore(ownerId, state, baseRevision, onProgress);

  onProgress?.({ step: 'replacing' });
  try {
    const { error } = await getClient().rpc('replace_gift_vault_from_restore_stage', { p_stage_id: staged.id });
    if (error) throw new CloudRestoreError('Gift Vault could not replace your cloud vault. The existing cloud records are still in place; the staged backup can be retried safely.', { cause: error });
  } catch (error) {
    if (error instanceof CloudRestoreError) throw error;
    throw new CloudRestoreError('Gift Vault lost connection while replacing this cloud vault. The replacement may have completed; refresh before making changes, and keep the downloaded safety backup.', { cause: error });
  }

  onProgress?.({ step: 'verifying' });
  let snapshot: CloudSnapshot;
  try {
    snapshot = await loadCloudVault(ownerId);
  } catch (error) {
    throw new CloudRestoreError('Gift Vault replaced the cloud vault but could not reload it for verification. Keep the downloaded safety backup and refresh before making changes.', { cause: error });
  }
  verifyRestoredVault(snapshot, staged);
  return { safetyBackupFilename, snapshot };
}

export function getCloudRestoreErrorMessage(error: unknown) {
  const details = getErrorDetails(error);
  if (details) {
    const message = details.join(' ');
    if (/row-level security|permission denied|not authorized/i.test(message)) {
      return 'Gift Vault could not confirm permission to replace this cloud vault. Check the required Supabase migration and sign in again.';
    }
    if (/restore_stages|vault_revisions|replace_gift_vault_from_restore_stage|schema cache|does not exist/i.test(message)) {
      return 'Cloud backup restore needs the latest Gift Vault Supabase migration before it can start.';
    }
    if (/cloud data changed while this backup was being prepared/i.test(message)) {
      return 'Your cloud vault changed on another device while this backup was being prepared. Nothing was replaced; refresh and start the restore again.';
    }
  }
  if (error instanceof CloudRestoreError) return error.message;
  return 'Gift Vault could not prepare this cloud restore. Your existing cloud vault has not been changed.';
}

function getErrorDetails(error: unknown): string[] {
  if (!error || typeof error !== 'object') return [];
  const value = error as { message?: unknown; cause?: unknown };
  return [typeof value.message === 'string' ? value.message : '', ...getErrorDetails(value.cause)].filter(Boolean);
}
