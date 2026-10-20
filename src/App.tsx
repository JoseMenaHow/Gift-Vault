import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { AppState, Person, Memory, GiftIdea } from './types';
import { emptyState, getLocalStateSavedAt, loadState, replaceStoredState, saveState } from './storage';
import { clearDurableState, loadDurableState, saveDurableState } from './durableStorage';
import { downloadBackup, getLatestLocalState } from './backup';
import { LocalBackupRestoreError, restoreLocalBackup as restoreDeviceLocalBackup } from './localBackupRestore';
import { CloudRestoreError, replaceCloudVaultFromBackup, type CloudRestoreProgress } from './cloudRestore';
import { isSupabaseConfigured, supabase } from './supabase';
import PeopleList from './components/PeopleList';
import PersonDetail from './components/PersonDetail';
import GiftDetail from './components/GiftDetail';
import AddPersonModal from './components/modals/AddPersonModal';
import AddMemoryModal from './components/modals/AddMemoryModal';
import AddIdeaModal from './components/modals/AddIdeaModal';
import DuplicateGiftModal from './components/modals/DuplicateGiftModal';
import AccountModal from './components/modals/AccountModal';
import BackupRestoreModal from './components/modals/BackupRestoreModal';
import CloudMigrationModal from './components/modals/CloudMigrationModal';
import { findUnboughtUpcomingBirthdays, formatBirthday } from './birthday';
import {
  CloudSyncConflictError,
  getCloudSyncErrorMessage,
  loadCloudSyncCache,
  loadCloudVault,
  mergeRefreshedCloudMedia,
  refreshCloudSnapshotMedia,
  sameCloudState,
  saveCloudSyncCache,
  synchronizeCloudVault,
  type CloudSnapshot,
} from './cloudSync';

type ModalType = 'addPerson' | 'addMemory' | 'addIdea' | null;
type GiftListTab = 'Ideas' | 'Delivered gifts';
type SyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'pending' | 'conflict' | 'error';

const CLOUD_MEDIA_REFRESH_MS = 45 * 60 * 1000;

function getAuthCallbackErrorMessage() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const errorCode = query.get('error_code') || hash.get('error_code');
  const error = query.get('error') || hash.get('error');

  if (!errorCode && !error) return null;
  if (errorCode === 'otp_expired' || /expired/i.test(errorCode || '')) {
    return 'This sign-in link has expired. Request a new link to continue.';
  }

  return 'That sign-in link is invalid or has already been used. Request a new link to continue.';
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editingIdea, setEditingIdea] = useState<GiftIdea | null>(null);
  const [isChoosingIdeaRecipient, setIsChoosingIdeaRecipient] = useState(false);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);
  const [ideasTabRequest, setIdeasTabRequest] = useState(0);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [giftListTab, setGiftListTab] = useState<GiftListTab>('Ideas');
  const [duplicatingIdea, setDuplicatingIdea] = useState<GiftIdea | null>(null);
  const [duplicateSuccess, setDuplicateSuccess] = useState<{ idea: GiftIdea; person: Person } | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isCloudMigrationOpen, setIsCloudMigrationOpen] = useState(false);
  const [authCallbackError, setAuthCallbackError] = useState<string | null>(null);
  const [persistenceAccountId, setPersistenceAccountId] = useState<string | undefined>();
  const [isCloudWorkspaceLoading, setIsCloudWorkspaceLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncRetry, setSyncRetry] = useState(0);
  const cloudSnapshotRef = useRef<CloudSnapshot | null>(null);
  const syncInFlightRef = useRef(false);
  const mediaRefreshInFlightRef = useRef(false);
  const cloudRestoreInProgressRef = useRef(false);
  const currentStateRef = useRef(state);
  const authUserId = authUser?.id;

  useEffect(() => {
    currentStateRef.current = state;
  }, [state]);

  const refreshCloudMedia = useCallback(async (force = false) => {
    if (!authUserId || persistenceAccountId !== authUserId || mediaRefreshInFlightRef.current) return;
    const snapshot = cloudSnapshotRef.current;
    if (!snapshot) return;
    if (!force && Date.now() - (snapshot.mediaRefreshedAt || 0) < CLOUD_MEDIA_REFRESH_MS) return;

    mediaRefreshInFlightRef.current = true;
    try {
      const refreshed = await refreshCloudSnapshotMedia(snapshot);
      if (cloudSnapshotRef.current !== snapshot) return;

      const cachedSync = loadCloudSyncCache(authUserId);
      cloudSnapshotRef.current = refreshed;
      saveCloudSyncCache(authUserId, { snapshot: refreshed, pending: cachedSync?.pending || false });
      setState((current) => mergeRefreshedCloudMedia(current, snapshot, refreshed));
    } catch (error) {
      console.error('Failed to refresh private image links:', error);
    } finally {
      mediaRefreshInFlightRef.current = false;
    }
  }, [authUserId, persistenceAccountId]);

  useEffect(() => {
    let isMounted = true;

    const restoreDurableState = async () => {
      try {
        const durableState = await loadDurableState();
        if (isMounted && durableState && durableState.savedAt > getLocalStateSavedAt()) {
          setState(durableState.state);
        }
      } catch (error) {
        console.error('Failed to restore durable state:', error);
      } finally {
        if (isMounted) setIsPersistenceReady(true);
      }
    };

    void restoreDurableState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const callbackError = getAuthCallbackErrorMessage();
    if (!callbackError) return;

    setAuthCallbackError(callbackError);
    setIsAccountModalOpen(true);
    window.history.replaceState(window.history.state, document.title, window.location.pathname);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;

      if (error) {
        console.error('Failed to restore the account session:', error);
      }

      setAuthUser(data.session?.user ?? null);
      setIsAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      setAuthUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isPersistenceReady) return;

    const savedAt = Date.now();
    if (isCloudWorkspaceLoading) return;

    saveState(state, savedAt, persistenceAccountId);
    void saveDurableState(state, savedAt, persistenceAccountId).catch((error: unknown) => {
      console.error('Failed to save durable state:', error);
    });
  }, [isPersistenceReady, isCloudWorkspaceLoading, persistenceAccountId, state]);

  useEffect(() => {
    if (!isPersistenceReady || isAuthLoading) return;

    let isMounted = true;
    const activateWorkspace = async () => {
      setIsCloudWorkspaceLoading(true);
      setPersistenceAccountId(undefined);
      setSelectedPersonId(null);
      setSelectedGiftId(null);
      setState(emptyState);

      if (!authUserId) {
        cloudSnapshotRef.current = null;
        setSyncStatus('local');
        setSyncMessage('');
        const localState = await getLatestLocalState(loadState());
        if (!isMounted) return;
        setState(localState);
        setIsCloudWorkspaceLoading(false);
        return;
      }

      const cachedSync = loadCloudSyncCache(authUserId);
      try {
        if (cachedSync?.pending) {
          const cachedState = await getLatestLocalState(loadState(authUserId), authUserId);
          if (!isMounted) return;
          let cachedSnapshot = cachedSync.snapshot;
          try {
            cachedSnapshot = await refreshCloudSnapshotMedia(cachedSnapshot);
            saveCloudSyncCache(authUserId, { snapshot: cachedSnapshot, pending: true });
          } catch (error) {
            console.error('Failed to refresh cached private image links:', error);
          }
          cloudSnapshotRef.current = cachedSnapshot;
          setState(mergeRefreshedCloudMedia(cachedState, cachedSync.snapshot, cachedSnapshot));
          setPersistenceAccountId(authUserId);
          setSyncStatus('pending');
          setSyncMessage('Changes saved on this device are waiting to sync.');
          setIsCloudWorkspaceLoading(false);
          return;
        }

        const cloudSnapshot = await loadCloudVault(authUserId);
        if (!isMounted) return;
        cloudSnapshotRef.current = cloudSnapshot;
        saveCloudSyncCache(authUserId, { snapshot: cloudSnapshot, pending: false });
        setState(cloudSnapshot.state);
        setPersistenceAccountId(authUserId);
        setSyncStatus('synced');
        setSyncMessage('');
      } catch (error) {
        if (!isMounted) return;
        const fallback = cachedSync?.snapshot.state || emptyState;
        cloudSnapshotRef.current = cachedSync?.snapshot || null;
        setState(fallback);
        setPersistenceAccountId(authUserId);
        setSyncStatus('error');
        setSyncMessage(getCloudSyncErrorMessage(error));
      } finally {
        if (isMounted) setIsCloudWorkspaceLoading(false);
      }
    };

    void activateWorkspace();
    return () => { isMounted = false; };
  }, [authUserId, isAuthLoading, isPersistenceReady]);

  useEffect(() => {
    if (!authUserId || persistenceAccountId !== authUserId || isCloudWorkspaceLoading) return;

    const interval = window.setInterval(() => {
      void refreshCloudMedia();
    }, CLOUD_MEDIA_REFRESH_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshCloudMedia();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authUserId, isCloudWorkspaceLoading, persistenceAccountId, refreshCloudMedia]);

  useEffect(() => {
    if (!authUserId || persistenceAccountId !== authUserId || isCloudWorkspaceLoading) return;
    const snapshot = cloudSnapshotRef.current;
    if (!snapshot
      || cloudRestoreInProgressRef.current
      || syncInFlightRef.current
      || syncStatus === 'conflict'
      || syncStatus === 'pending'
      || syncStatus === 'error'
      || sameCloudState(state, snapshot.state)) return;

    const desiredState = state;
    syncInFlightRef.current = true;
    setSyncStatus('saving');
    setSyncMessage('');

    void synchronizeCloudVault(authUserId, desiredState, snapshot)
      .then((nextSnapshot) => {
        cloudSnapshotRef.current = nextSnapshot;
        saveCloudSyncCache(authUserId, { snapshot: nextSnapshot, pending: false });
        if (sameCloudState(currentStateRef.current, desiredState)) {
          setState(nextSnapshot.state);
        }
        setSyncStatus('synced');
      })
      .catch((error: unknown) => {
        saveCloudSyncCache(authUserId, { snapshot, pending: true });
        setSyncStatus(error instanceof CloudSyncConflictError ? 'conflict' : 'pending');
        setSyncMessage(getCloudSyncErrorMessage(error));
      })
      .finally(() => {
        syncInFlightRef.current = false;
      });
  }, [authUserId, isCloudWorkspaceLoading, persistenceAccountId, state, syncRetry, syncStatus]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardOffset = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty('--keyboard-offset', `${offset > 80 ? offset : 0}px`);
    };

    updateKeyboardOffset();
    viewport.addEventListener('resize', updateKeyboardOffset);
    viewport.addEventListener('scroll', updateKeyboardOffset);

    return () => {
      viewport.removeEventListener('resize', updateKeyboardOffset);
      viewport.removeEventListener('scroll', updateKeyboardOffset);
      document.documentElement.style.removeProperty('--keyboard-offset');
    };
  }, []);

  const upsertPerson = (person: Omit<Person, 'id'> | Person) => {
    if ('id' in person) {
      // Update existing person
      setState(prev => ({
        ...prev,
        people: prev.people.map(p => p.id === person.id ? person : p),
      }));
    } else {
      // Add new person
      const newPerson: Person = {
        ...person,
        id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
      };
      setState(prev => ({
        ...prev,
        people: [...prev.people, newPerson],
      }));
    }
    setActiveModal(null);
    setEditingPerson(null);
  };

  const upsertMemory = (memory: Omit<Memory, 'id' | 'createdAt'> | Memory) => {
    if ('id' in memory && 'createdAt' in memory) {
      // Update existing memory (preserve createdAt)
      setState(prev => ({
        ...prev,
        memories: prev.memories.map(m => m.id === memory.id ? memory : m),
      }));
    } else {
      // Add new memory
      const newMemory: Memory = {
        ...memory,
        id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
        createdAt: new Date().toISOString(),
      };
      setState(prev => ({
        ...prev,
        memories: [...prev.memories, newMemory],
      }));
    }
    setActiveModal(null);
    setEditingMemory(null);
  };

  const upsertIdea = (idea: Omit<GiftIdea, 'id' | 'createdAt'> | GiftIdea) => {
    if ('id' in idea && 'createdAt' in idea) {
      // Update existing idea (preserve createdAt)
      setState(prev => ({
        ...prev,
        ideas: prev.ideas.map(i => i.id === idea.id ? idea : i),
      }));
    } else {
      // Add new idea
      const newIdea: GiftIdea = {
        ...idea,
        id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
        createdAt: new Date().toISOString(),
      };
      setState(prev => ({
        ...prev,
        ideas: [...prev.ideas, newIdea],
      }));
    }
    setActiveModal(null);
    setEditingIdea(null);
    setIsChoosingIdeaRecipient(false);
  };

  const deletePerson = (personId: string) => {
    if (!window.confirm('Delete this person and all their memories and ideas?')) return;

    setState(prev => ({
      people: prev.people.filter(p => p.id !== personId),
      memories: prev.memories.filter(m => m.personId !== personId),
      ideas: prev.ideas.filter(i => i.personId !== personId),
    }));

    // If deleted person was selected, go back to list
    if (selectedPersonId === personId) {
      setSelectedPersonId(null);
    }
  };

  const deleteMemory = (memoryId: string) => {
    setState(prev => ({
      ...prev,
      memories: prev.memories.filter(m => m.id !== memoryId),
    }));
  };

  const deleteIdea = (ideaId: string) => {
    setState(prev => ({
      ...prev,
      ideas: prev.ideas.filter(i => i.id !== ideaId),
    }));
    if (selectedGiftId === ideaId) setSelectedGiftId(null);
  };

  const setIdeaGifted = (ideaId: string, gifted: boolean) => {
    setState(prev => ({
      ...prev,
      ideas: prev.ideas.map(idea => (
        idea.id === ideaId
          ? { ...idea, giftedAt: gifted ? new Date().toISOString() : undefined }
          : idea
      )),
    }));
  };

  const duplicateIdea = (idea: GiftIdea, destinationPersonId: string) => {
    const destinationPerson = state.people.find((person) => person.id === destinationPersonId);
    if (!destinationPerson) return;

    const duplicatedIdea: GiftIdea = {
      ...idea,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
      personId: destinationPersonId,
      links: idea.links ? [...idea.links] : undefined,
      occasionTags: idea.occasionTags ? [...idea.occasionTags] : undefined,
      createdAt: new Date().toISOString(),
      giftedAt: undefined,
    };

    setState((previousState) => ({
      ...previousState,
      ideas: [...previousState.ideas, duplicatedIdea],
    }));
    setDuplicatingIdea(null);
    setDuplicateSuccess({ idea: duplicatedIdea, person: destinationPerson });
  };

  const openDuplicatedGift = () => {
    if (!duplicateSuccess) return;

    setSelectedPersonId(duplicateSuccess.person.id);
    setGiftListTab('Ideas');
    setSelectedGiftId(duplicateSuccess.idea.id);
    setDuplicateSuccess(null);
  };

  const handleEditPerson = (person: Person) => {
    setEditingPerson(person);
    setActiveModal('addPerson');
  };

  const handleEditMemory = (memory: Memory) => {
    setEditingMemory(memory);
    setActiveModal('addMemory');
  };

  const handleEditIdea = (idea: GiftIdea) => {
    setEditingIdea(idea);
    setIsChoosingIdeaRecipient(false);
    setActiveModal('addIdea');
  };

  const closeModal = () => {
    setActiveModal(null);
    setEditingPerson(null);
    setEditingMemory(null);
    setEditingIdea(null);
    setIsChoosingIdeaRecipient(false);
  };

  const downloadLocalBackup = async () => {
    const latestState = await getLatestLocalState(state, persistenceAccountId);
    return downloadBackup(latestState);
  };

  const restoreLocalBackup = async (restoredState: AppState) => {
    if (authUser || persistenceAccountId) {
      throw new LocalBackupRestoreError(
        'To protect your cloud vault, sign out before restoring a local backup. You can then import it into an empty account from the account menu.',
      );
    }

    const safetyBackupFilename = await restoreDeviceLocalBackup(restoredState, {
      getCurrentState: () => getLatestLocalState(state),
      downloadSafetyBackup: (currentState) => downloadBackup(currentState, 'safety'),
      loadDurableState: () => loadDurableState(),
      saveDurableState: (nextState, savedAt) => saveDurableState(nextState, savedAt),
      clearDurableState: () => clearDurableState(),
      replaceStoredState: (nextState, savedAt) => replaceStoredState(nextState, savedAt),
    });
    setState(restoredState);
    return safetyBackupFilename;
  };

  const restoreCloudBackup = async (restoredState: AppState, onProgress?: (progress: CloudRestoreProgress) => void) => {
    if (!authUser || persistenceAccountId !== authUser.id || !cloudSnapshotRef.current) {
      throw new CloudRestoreError('Your cloud vault is still loading. Wait for it to finish before restoring a backup.');
    }
    if (syncStatus !== 'synced' || syncInFlightRef.current) {
      throw new CloudRestoreError('Resolve any pending cloud sync changes before replacing this cloud vault. Your backup has not been applied.');
    }

    cloudRestoreInProgressRef.current = true;
    setSyncStatus('saving');
    setSyncMessage('Replacing this cloud vault from a backup…');
    try {
      const result = await replaceCloudVaultFromBackup({
        ownerId: authUser.id,
        state: restoredState,
        onProgress,
      });
      cloudSnapshotRef.current = result.snapshot;
      saveCloudSyncCache(authUser.id, { snapshot: result.snapshot, pending: false });
      setState(result.snapshot.state);
      setSyncStatus('synced');
      setSyncMessage('');
      return result.safetyBackupFilename;
    } catch (error) {
      setSyncStatus('synced');
      setSyncMessage('');
      throw error;
    } finally {
      cloudRestoreInProgressRef.current = false;
    }
  };

  const retryCloudSync = () => {
    if (!authUser || !cloudSnapshotRef.current) return;
    setSyncStatus('synced');
    setSyncMessage('');
    setSyncRetry((attempt) => attempt + 1);
  };

  const refreshFromCloud = async () => {
    if (!authUser || syncStatus === 'saving') return;

    if (syncStatus === 'pending' || syncStatus === 'conflict') {
      downloadBackup(state, 'safety');
    }

    setIsCloudWorkspaceLoading(true);
    try {
      const cloudSnapshot = await loadCloudVault(authUser.id);
      cloudSnapshotRef.current = cloudSnapshot;
      saveCloudSyncCache(authUser.id, { snapshot: cloudSnapshot, pending: false });
      setState(cloudSnapshot.state);
      setSyncStatus('synced');
      setSyncMessage('');
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(getCloudSyncErrorMessage(error));
    } finally {
      setIsCloudWorkspaceLoading(false);
    }
  };

  const selectedPerson = state.people.find(p => p.id === selectedPersonId);
  const selectedGift = state.ideas.find(idea => idea.id === selectedGiftId && idea.personId === selectedPersonId);
  const personMemories = state.memories.filter(m => m.personId === selectedPersonId);
  const personIdeas = state.ideas.filter(i => i.personId === selectedPersonId);
  const upcomingOccasions = findUnboughtUpcomingBirthdays(state.people)
    .map(({ person, daysAway }) => ({
      id: `${person.id}:birthday`,
      personId: person.id,
      personName: person.name,
      type: 'birthday' as const,
      daysAway,
      message: `${person.name}'s birthday ${daysAway === 0 ? 'is today' : 'is coming up'} · ${formatBirthday(person.birthday!)}`,
    }));
  const availablePersonTags = Array.from(
    new Set(state.people.flatMap((person) => person.tags || []))
  ).sort((first, second) => first.localeCompare(second));
  const availableOccasionTags = Array.from(
    new Set(state.ideas.flatMap((idea) => idea.occasionTags || []))
  ).sort((first, second) => first.localeCompare(second));
  const localImportState = loadState();
  const hasLocalVaultToImport = localImportState.people.length > 0
    || localImportState.ideas.length > 0
    || localImportState.memories.length > 0;

  if (isCloudWorkspaceLoading) {
    return (
      <div className="app-canvas cloud-workspace-loading" role="status" aria-live="polite">
        <div>
          <span className="cloud-workspace-loading-mark" aria-hidden="true">G</span>
          <strong>Loading your Gift Vault</strong>
          <span>Keeping this account’s vault separate from local data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-canvas">
      <div className={`app-layout${selectedPersonId ? ' has-selection' : ''}`}>
        <aside className="people-pane">
          <PeopleList
            people={state.people}
            ideas={state.ideas}
            selectedPersonId={selectedPersonId}
            onSelectPerson={(personId) => {
              setSelectedPersonId(personId);
              setSelectedGiftId(null);
              setGiftListTab('Ideas');
            }}
            upcomingOccasions={upcomingOccasions}
            onOpenOccasion={(personId) => {
              setSelectedPersonId(personId);
              setSelectedGiftId(null);
              setGiftListTab('Ideas');
              setIdeasTabRequest((request) => request + 1);
            }}
            onAddPerson={() => setActiveModal('addPerson')}
            onAddIdea={() => {
              setEditingIdea(null);
              setIsChoosingIdeaRecipient(true);
              setActiveModal('addIdea');
            }}
            onEditPerson={handleEditPerson}
            onDeletePerson={deletePerson}
            accountEmail={authUser?.email}
            isAuthLoading={isAuthLoading}
            isSupabaseConfigured={isSupabaseConfigured}
            onOpenAccount={() => setIsAccountModalOpen(true)}
          />
        </aside>

        <main className="detail-pane">
          {selectedPerson && selectedGift ? (
            <GiftDetail
              person={selectedPerson}
              idea={selectedGift}
              onBack={() => setSelectedGiftId(null)}
              onEdit={() => handleEditIdea(selectedGift)}
            />
          ) : selectedPerson ? (
            <PersonDetail
              key={selectedPerson.id}
              person={selectedPerson}
              memories={personMemories}
              ideas={personIdeas}
              onBack={() => {
                setSelectedPersonId(null);
                setSelectedGiftId(null);
              }}
              initialTab={giftListTab}
              ideasTabRequest={ideasTabRequest}
              onAddMemory={() => setActiveModal('addMemory')}
              onAddIdea={() => {
                setIsChoosingIdeaRecipient(false);
                setActiveModal('addIdea');
              }}
              onEditPerson={handleEditPerson}
              onUpdatePerson={upsertPerson}
              onDeletePerson={deletePerson}
              onEditMemory={handleEditMemory}
              onEditIdea={handleEditIdea}
              onDuplicateIdea={setDuplicatingIdea}
              onDeleteMemory={deleteMemory}
              onDeleteIdea={deleteIdea}
              onSetIdeaGifted={setIdeaGifted}
              onOpenGift={(idea, tab) => {
                setGiftListTab(tab);
                setSelectedGiftId(idea.id);
              }}
            />
          ) : (
            <div className="detail-placeholder">
              <div className="detail-placeholder-icon">🎁</div>
              <h2>Select someone</h2>
              <p>Choose a person to see their gift ideas and memories.</p>
            </div>
          )}
        </main>
      </div>

      {activeModal === 'addPerson' && (
        <AddPersonModal
          initialPerson={editingPerson || undefined}
          availableTags={availablePersonTags}
          onSave={upsertPerson}
          onClose={closeModal}
        />
      )}

      {activeModal === 'addMemory' && selectedPersonId && (
        <AddMemoryModal
          personId={selectedPersonId}
          initialMemory={editingMemory || undefined}
          onSave={upsertMemory}
          onClose={closeModal}
        />
      )}

      {activeModal === 'addIdea' && (selectedPersonId || isChoosingIdeaRecipient) && (
        <AddIdeaModal
          personId={selectedPersonId || ''}
          people={state.people}
          initialIdea={editingIdea || undefined}
          availableTags={availableOccasionTags}
          onSave={upsertIdea}
          onClose={closeModal}
        />
      )}

      {duplicatingIdea && (
        <DuplicateGiftModal
          idea={duplicatingIdea}
          people={state.people}
          onDuplicate={duplicateIdea}
          onClose={() => setDuplicatingIdea(null)}
        />
      )}

      {duplicateSuccess && (
        <aside className="duplicate-success" role="status" aria-live="polite">
          <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" />
          <div className="duplicate-success-copy">
            <strong>Gift copied to {duplicateSuccess.person.name}</strong>
            <span>{duplicateSuccess.idea.title}</span>
          </div>
          <button type="button" className="duplicate-success-view" onClick={openDuplicatedGift}>
            View gift
          </button>
          <button
            type="button"
            className="duplicate-success-close"
            onClick={() => setDuplicateSuccess(null)}
            aria-label="Dismiss confirmation"
          >
            <X size={17} strokeWidth={2} aria-hidden="true" />
          </button>
        </aside>
      )}

      {isAccountModalOpen && (
        <AccountModal
          email={authUser?.email}
          isSessionLoading={isAuthLoading}
          callbackError={authCallbackError || undefined}
          onDismissCallbackError={() => setAuthCallbackError(null)}
          onClose={() => {
            setIsAccountModalOpen(false);
            setAuthCallbackError(null);
          }}
          onOpenBackup={() => {
            setIsAccountModalOpen(false);
            setIsBackupModalOpen(true);
          }}
          onOpenCloudMigration={() => {
            setIsAccountModalOpen(false);
            setIsCloudMigrationOpen(true);
          }}
          syncStatus={syncStatus}
          syncMessage={syncMessage}
          canImportLocalVault={hasLocalVaultToImport}
          onRefreshCloud={() => void refreshFromCloud()}
          onRetryCloudSync={retryCloudSync}
        />
      )}

      {isCloudMigrationOpen && authUser && (
        <CloudMigrationModal
          accountId={authUser.id}
          accountEmail={authUser.email}
          fallbackState={loadState()}
          onClose={() => setIsCloudMigrationOpen(false)}
        />
      )}

      {isBackupModalOpen && (
        <BackupRestoreModal
          onDownloadBackup={downloadLocalBackup}
          onRestoreBackup={authUser ? restoreCloudBackup : restoreLocalBackup}
          restoreMode={authUser ? 'cloud' : 'local'}
          accountEmail={authUser?.email}
          restoreDisabledMessage={authUser && (syncStatus !== 'synced' || syncInFlightRef.current)
            ? 'Finish or resolve any pending cloud sync changes before replacing this cloud vault. Your backup will not be uploaded until then.'
            : undefined}
          onClose={() => setIsBackupModalOpen(false)}
        />
      )}

    </div>
  );
}

export default App;
