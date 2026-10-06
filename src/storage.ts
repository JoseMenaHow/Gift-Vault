import type { AppState, GiftIdea, Person } from "./types";

const STORAGE_KEY = 'gift-vault-state-v1';
const BACKUP_STORAGE_KEY = 'gift-vault-state-backup-v1';
const SAVED_AT_STORAGE_KEY = 'gift-vault-state-saved-at-v1';

const emptyState: AppState = {
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

function loadStoredState(key: string): AppState | null {
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    return parseState(stored);
  } catch (error) {
    console.error(`Failed to load ${key}:`, error);
    return null;
  }
}

export function loadState(): AppState {
  return loadStoredState(STORAGE_KEY) || loadStoredState(BACKUP_STORAGE_KEY) || emptyState;
}

export function getLocalStateSavedAt(): number {
  const savedAt = Number(localStorage.getItem(SAVED_AT_STORAGE_KEY));
  return Number.isFinite(savedAt) ? savedAt : 0;
}

export function saveState(state: AppState, savedAt = Date.now()): void {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem(BACKUP_STORAGE_KEY, serializedState);
    localStorage.setItem(STORAGE_KEY, serializedState);
    localStorage.setItem(SAVED_AT_STORAGE_KEY, String(savedAt));
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}
