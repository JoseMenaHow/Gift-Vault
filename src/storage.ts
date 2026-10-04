import type { AppState, Person } from "./types";

const STORAGE_KEY = 'gift-vault-state-v1';

const emptyState: AppState = {
  people: [],
  memories: [],
  ideas: [],
};

type StoredPerson = Person & {
  relationship?: string;
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

export function loadState(): AppState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return emptyState;
    const parsed = JSON.parse(stored);
    return {
      people: (parsed.people || []).map(migratePerson),
      memories: parsed.memories || [],
      ideas: parsed.ideas || [],
    };
  } catch (error) {
    console.error('Failed to load state:', error);
    return emptyState;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}
