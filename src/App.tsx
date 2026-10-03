import { useState, useEffect } from 'react';
import type { AppState, Person, Memory, GiftIdea } from './types';
import { loadState, saveState } from './storage';
import PeopleList from './components/PeopleList';
import PersonDetail from './components/PersonDetail';
import AddPersonModal from './components/modals/AddPersonModal';
import AddMemoryModal from './components/modals/AddMemoryModal';
import AddIdeaModal from './components/modals/AddIdeaModal';

type ModalType = 'addPerson' | 'addMemory' | 'addIdea' | null;

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editingIdea, setEditingIdea] = useState<GiftIdea | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

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

  const selectedPerson = state.people.find(p => p.id === selectedPersonId);
  const personMemories = state.memories.filter(m => m.personId === selectedPersonId);
  const personIdeas = state.ideas.filter(i => i.personId === selectedPersonId);

  return (
    <div className="app-canvas">
      {!selectedPersonId ? (
        <PeopleList
          people={state.people}
          ideas={state.ideas}
          onSelectPerson={setSelectedPersonId}
          onAddPerson={() => setActiveModal('addPerson')}
          onEditPerson={handleEditPerson}
          onDeletePerson={deletePerson}
        />
      ) : selectedPerson ? (
        <PersonDetail
          person={selectedPerson}
          memories={personMemories}
          ideas={personIdeas}
          onBack={() => setSelectedPersonId(null)}
          onAddMemory={() => setActiveModal('addMemory')}
          onAddIdea={() => setActiveModal('addIdea')}
          onEditPerson={handleEditPerson}
          onDeletePerson={deletePerson}
          onEditMemory={handleEditMemory}
          onEditIdea={handleEditIdea}
          onDeleteMemory={deleteMemory}
          onDeleteIdea={deleteIdea}
        />
      ) : null}

      {activeModal === 'addPerson' && (
        <AddPersonModal
          initialPerson={editingPerson || undefined}
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
          onSave={upsertIdea}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

export default App;
