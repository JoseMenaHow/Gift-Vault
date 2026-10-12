import type { AppState, GiftIdea, Person } from "./types";

const STORAGE_KEY = 'gift-vault-state-v1';
const BACKUP_STORAGE_KEY = 'gift-vault-state-backup-v1';
const SAVED_AT_STORAGE_KEY = 'gift-vault-state-saved-at-v1';

export const emptyState: AppState = {
  people: [],
  memories: [],
  ideas: [],
};

type StoredPerson = Person & {
  relationship?: string;
};

type StoredGiftIdea = Omit<GiftIdea, 'links'> & {
  link?: unknown;
  links?: unknown;
  emoji?: string;
};

function migratePerson(person: StoredPerson): Person {
  const { relationship, ...currentPerson } = person;
  const savedTags = Array.isArray(person.tags)
    ? person.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];
  const tags = savedTags.length > 0
    ? savedTags.map((tag) => tag.trim())
    : relationship?.trim()
      ? [relationship.trim()]
      : undefined;

  return { ...currentPerson, tags };
}

function migrateGiftIdea(idea: StoredGiftIdea): GiftIdea {
  const currentIdea = { ...idea };
  delete currentIdea.emoji;
  delete currentIdea.link;

  const savedLinks = Array.isArray(idea.links)
    ? idea.links
      .filter((link): link is string => typeof link === 'string' && link.trim().length > 0)
      .map((link) => link.trim())
    : [];
  const legacyLink = typeof idea.link === 'string' && idea.link.trim().length > 0
    ? idea.link.trim()
    : undefined;
  const links = legacyLink && !savedLinks.includes(legacyLink)
    ? [...savedLinks, legacyLink]
    : savedLinks;

  return { ...currentIdea, links: links.length > 0 ? links : undefined };
}

export function normalizeAppState(value: unknown): AppState {
  const parsed = value;
  if (!parsed || typeof parsed !== 'object') throw new Error('Stored state is invalid');

  const state = parsed as Partial<AppState>;
  return {
    people: Array.isArray(state.people) ? state.people.map(migratePerson) : [],
    memories: Array.isArray(state.memories) ? state.memories : [],
    ideas: Array.isArray(state.ideas) ? state.ideas.map(migrateGiftIdea) : [],
  };
}

function parseState(stored: string): AppState {
  return normalizeAppState(JSON.parse(stored));
}

function scopedKey(key: string, accountId?: string) {
  return accountId ? `${key}:account:${accountId}` : key;
}

function loadStoredState(key: string, accountId?: string): AppState | null {
  const stored = localStorage.getItem(scopedKey(key, accountId));
  if (!stored) return null;

  try {
    return parseState(stored);
  } catch (error) {
    console.error(`Failed to load ${key}:`, error);
    return null;
  }
}

export function loadState(accountId?: string): AppState {
  return loadStoredState(STORAGE_KEY, accountId) || loadStoredState(BACKUP_STORAGE_KEY, accountId) || emptyState;
}

export function getLocalStateSavedAt(accountId?: string): number {
  const savedAt = Number(localStorage.getItem(scopedKey(SAVED_AT_STORAGE_KEY, accountId)));
  return Number.isFinite(savedAt) ? savedAt : 0;
}

export function saveState(state: AppState, savedAt = Date.now(), accountId?: string): void {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem(scopedKey(BACKUP_STORAGE_KEY, accountId), serializedState);
    localStorage.setItem(scopedKey(STORAGE_KEY, accountId), serializedState);
    localStorage.setItem(scopedKey(SAVED_AT_STORAGE_KEY, accountId), String(savedAt));
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

/**
 * Writes a confirmed restore to both local copies, rolling back if browser storage rejects it.
 */
export function replaceStoredState(state: AppState, savedAt = Date.now(), accountId?: string): void {
  const serializedState = JSON.stringify(state);
  const previousValues = new Map([
    [scopedKey(BACKUP_STORAGE_KEY, accountId), localStorage.getItem(scopedKey(BACKUP_STORAGE_KEY, accountId))],
    [scopedKey(STORAGE_KEY, accountId), localStorage.getItem(scopedKey(STORAGE_KEY, accountId))],
    [scopedKey(SAVED_AT_STORAGE_KEY, accountId), localStorage.getItem(scopedKey(SAVED_AT_STORAGE_KEY, accountId))],
  ]);

  try {
    localStorage.setItem(scopedKey(BACKUP_STORAGE_KEY, accountId), serializedState);
    localStorage.setItem(scopedKey(STORAGE_KEY, accountId), serializedState);
    localStorage.setItem(scopedKey(SAVED_AT_STORAGE_KEY, accountId), String(savedAt));
  } catch (error) {
    for (const [key, value] of previousValues) {
      try {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      } catch {
        // Keep attempting the remaining rollback writes when browser storage is full.
      }
    }
    throw error;
  }
}
