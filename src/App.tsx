import { useState, useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { AppState, Person, Memory, GiftIdea } from './types';
import { getLocalStateSavedAt, loadState, replaceStoredState, saveState } from './storage';
import { clearDurableState, loadDurableState, saveDurableState } from './durableStorage';
import { downloadBackup, getLatestLocalState } from './backup';
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
import { findNextBirthday, formatBirthday } from './birthday';

type ModalType = 'addPerson' | 'addMemory' | 'addIdea' | null;
type GiftListTab = 'Ideas' | 'Delivered gifts';

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
    saveState(state, savedAt);
    void saveDurableState(state, savedAt).catch((error: unknown) => {
      console.error('Failed to save durable state:', error);
    });
  }, [isPersistenceReady, state]);

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
    setActiveModal('addIdea');
  };

  const closeModal = () => {
    setActiveModal(null);
    setEditingPerson(null);
    setEditingMemory(null);
    setEditingIdea(null);
  };

  const downloadLocalBackup = async () => {
    const latestState = await getLatestLocalState(state);
    return downloadBackup(latestState);
  };

  const restoreLocalBackup = async (restoredState: AppState) => {
    const currentState = await getLatestLocalState(state);
    const safetyBackupFilename = downloadBackup(currentState, 'safety');
    const currentDurableState = await loadDurableState();
    const savedAt = Date.now();

    try {
      await saveDurableState(restoredState, savedAt);
      replaceStoredState(restoredState, savedAt);
    } catch (error) {
      try {
        if (currentDurableState) {
          await saveDurableState(currentDurableState.state, currentDurableState.savedAt);
        } else {
          await clearDurableState();
        }
      } catch (rollbackError) {
        console.error('Failed to roll back durable storage after a restore error:', rollbackError);
      }
      throw error;
    }

    setState(restoredState);
    return safetyBackupFilename;
  };

  const selectedPerson = state.people.find(p => p.id === selectedPersonId);
  const selectedGift = state.ideas.find(idea => idea.id === selectedGiftId && idea.personId === selectedPersonId);
  const personMemories = state.memories.filter(m => m.personId === selectedPersonId);
  const personIdeas = state.ideas.filter(i => i.personId === selectedPersonId);
  const upcomingBirthday = findNextBirthday(state.people);
  const birthdayNudge = upcomingBirthday && upcomingBirthday.daysAway <= 30
    ? {
        personId: upcomingBirthday.person.id,
        message: `${upcomingBirthday.person.name}'s birthday is coming up · ${formatBirthday(upcomingBirthday.person.birthday!)}`,
      }
    : undefined;
  const availablePersonTags = Array.from(
    new Set(state.people.flatMap((person) => person.tags || []))
  ).sort((first, second) => first.localeCompare(second));
  const availableOccasionTags = Array.from(
    new Set(state.ideas.flatMap((idea) => idea.occasionTags || []))
  ).sort((first, second) => first.localeCompare(second));

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
            birthdayNudge={birthdayNudge}
            onOpenPersonIdeas={(personId) => {
              setSelectedPersonId(personId);
              setSelectedGiftId(null);
              setGiftListTab('Ideas');
              setIdeasTabRequest((request) => request + 1);
            }}
            onAddPerson={() => setActiveModal('addPerson')}
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
              onAddIdea={() => setActiveModal('addIdea')}
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

      {activeModal === 'addIdea' && selectedPersonId && (
        <AddIdeaModal
          personId={selectedPersonId}
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
        />
      )}

      {isCloudMigrationOpen && authUser && (
        <CloudMigrationModal
          accountId={authUser.id}
          accountEmail={authUser.email}
          fallbackState={state}
          onClose={() => setIsCloudMigrationOpen(false)}
        />
      )}

      {isBackupModalOpen && (
        <BackupRestoreModal
          onDownloadBackup={downloadLocalBackup}
          onRestoreBackup={restoreLocalBackup}
          onClose={() => setIsBackupModalOpen(false)}
        />
      )}

    </div>
  );
}

export default App;
