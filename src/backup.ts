import type { AppState, GiftIdea, Memory, Person } from './types';
import { loadDurableState } from './durableStorage';
import { getLocalStateSavedAt, normalizeAppState } from './storage';

const BACKUP_FORMAT = 'gift-vault-backup';
const BACKUP_VERSION = 1;

export type GiftVaultBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  state: AppState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isBirthday(value: unknown): value is string | undefined {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;

  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(2000, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizeBirthday(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const match = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[1]}-${match[2]}` : value;
}

function isPerson(value: unknown): value is Person {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return false;

  return isStringArray(value.tags)
    && isOptionalString(value.photoUrl)
    && isOptionalString(value.emoji)
    && isOptionalString(value.labelText)
    && isBirthday(value.birthday);
}

function isMemory(value: unknown): value is Memory {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.personId === 'string'
    && typeof value.text === 'string'
    && typeof value.createdAt === 'string';
}

function isGiftIdea(value: unknown): value is GiftIdea {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.personId !== 'string'
    || typeof value.title !== 'string'
    || typeof value.createdAt !== 'string') return false;

  return isOptionalString(value.description)
    && isStringArray(value.links)
    && isStringArray(value.occasionTags)
    && isOptionalString(value.imageUrl)
    && isOptionalString(value.giftedAt);
}

function ensureUniqueIds(values: Array<{ id: string }>, label: string) {
  if (new Set(values.map((value) => value.id)).size !== values.length) {
    throw new Error(`This backup has duplicate ${label} IDs.`);
  }
}

function validateState(value: unknown): AppState {
  const parsedState = normalizeAppState(value);
  const state: AppState = {
    ...parsedState,
    people: parsedState.people.map((person) => ({
      ...person,
      birthday: normalizeBirthday(person.birthday) as Person['birthday'],
    })),
  };

  if (!state.people.every(isPerson) || !state.memories.every(isMemory) || !state.ideas.every(isGiftIdea)) {
    throw new Error('This backup has invalid Gift Vault data.');
  }

  ensureUniqueIds(state.people, 'person');
  ensureUniqueIds(state.memories, 'memory');
  ensureUniqueIds(state.ideas, 'gift');

  const personIds = new Set(state.people.map((person) => person.id));
  if (state.memories.some((memory) => !personIds.has(memory.personId))
    || state.ideas.some((idea) => !personIds.has(idea.personId))) {
    throw new Error('This backup contains gifts or memories without a matching person.');
  }

  return state;
}

export function createBackup(state: AppState): GiftVaultBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state: validateState(state),
  };
}

export function getBackupFilename(kind: 'backup' | 'safety' | 'migration-safety' | 'cloud-safety' = 'backup') {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `gift-vault-${kind}-${date}.json`;
}

export function downloadBackup(state: AppState, kind: 'backup' | 'safety' | 'migration-safety' | 'cloud-safety' = 'backup') {
  const contents = JSON.stringify(createBackup(state), null, 2);
  const file = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  const filename = getBackupFilename(kind);

  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  return filename;
}

export async function readBackupFile(file: File): Promise<AppState> {
  let value: unknown;

  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not a valid JSON backup.');
  }

  if (!isRecord(value) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION || !('state' in value)) {
    throw new Error('This is not a supported Gift Vault backup.');
  }

  return validateState(value.state);
}

export async function getLatestLocalState(fallback: AppState, accountId?: string): Promise<AppState> {
  try {
    const durableState = await loadDurableState(accountId);
    return durableState && durableState.savedAt > getLocalStateSavedAt(accountId)
      ? durableState.state
      : fallback;
  } catch {
    return fallback;
  }
}
