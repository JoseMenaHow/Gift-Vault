import type { AppState } from "./types";

const STORAGE_KEY = 'gift-vault-state-v1';

const emptyState: AppState = {
  people: [],
  memories: [],
  ideas: [],
};

export function loadState(): AppState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return emptyState;
    const parsed = JSON.parse(stored);
    return {
      people: parsed.people || [],
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
