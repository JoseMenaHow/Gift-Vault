import { useState } from 'react';
import type { Person, Memory, GiftIdea } from '../types';
import Tabs from './Tabs';
import OverflowMenu from './OverflowMenu';

interface Props {
  person: Person;
  memories: Memory[];
  ideas: GiftIdea[];
  onBack: () => void;
  onAddMemory: () => void;
  onAddIdea: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  onEditMemory: (memory: Memory) => void;
  onEditIdea: (idea: GiftIdea) => void;
  onDeleteMemory: (memoryId: string) => void;
  onDeleteIdea: (ideaId: string) => void;
}

export default function PersonDetail({
  person,
  memories,
  ideas,
  onBack,
  onAddMemory,
  onAddIdea,
  onEditPerson,
  onDeletePerson,
  onEditMemory,
  onEditIdea,
  onDeleteMemory,
  onDeleteIdea,
}: Props) {
  const [activeTab, setActiveTab] = useState<'Ideas' | 'Memories'>('Ideas');
  const [selectedOccasion, setSelectedOccasion] = useState<string>('All');

  const allOccasions = ['All', ...new Set(ideas.flatMap(i => i.occasionTags || []))];
  const filteredIdeas = selectedOccasion === 'All'
    ? ideas
    : ideas.filter(i => i.occasionTags?.includes(selectedOccasion));

  const sortedMemories = [...memories].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="person-detail">
      <button onClick={onBack} className="back-button">
        <span aria-hidden="true">←</span>
        People
      </button>

      <section className="person-hero">
        <div className="person-hero-menu">
          <OverflowMenu
            onEdit={() => onEditPerson(person)}
            onDelete={() => onDeletePerson(person.id)}
            ariaLabel="Person actions"
          />
        </div>
        {person.photoUrl ? (
          <img src={person.photoUrl} alt="" className="person-hero-avatar person-photo" />
        ) : (
          <div className="person-hero-avatar person-placeholder" aria-hidden="true">
            {person.emoji || '👤'}
          </div>
        )}
        <div className="person-hero-copy">
          <p className="page-eyebrow">Gift ideas for</p>
          <h1>{person.name}</h1>
          <p className="person-relationship">{person.relationship}</p>
          {person.labelText && (
            <p className="person-note">{person.labelText}</p>
          )}
        </div>
      </section>

      <Tabs
        tabs={['Ideas', 'Memories']}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as 'Ideas' | 'Memories')}
      />

      {activeTab === 'Ideas' && (
        <section aria-label="Gift ideas">
          {allOccasions.length > 1 && (
            <div className="filter-chips" aria-label="Filter ideas by occasion">
              {allOccasions.map((occasion) => (
                <button
                  key={occasion}
                  onClick={() => setSelectedOccasion(occasion)}
                  className={`filter-chip${selectedOccasion === occasion ? ' is-active' : ''}`}
                  aria-pressed={selectedOccasion === occasion}
                >
                  {occasion}
                </button>
              ))}
            </div>
          )}

          {filteredIdeas.length === 0 ? (
            <div className="content-empty-state">
              <p>No gift ideas yet</p>
              <button onClick={onAddIdea}>Add the first idea</button>
            </div>
          ) : (
            <div className="idea-grid">
              {filteredIdeas.map((idea) => (
                <article key={idea.id} className="idea-card">
                  {idea.imageUrl ? (
                    <img src={idea.imageUrl} alt="" className="idea-media" />
                  ) : idea.emoji ? (
                    <div className="idea-media idea-emoji" aria-hidden="true">{idea.emoji}</div>
                  ) : (
                    <div className="idea-media idea-emoji idea-emoji-empty" aria-hidden="true">🎁</div>
                  )}
                  <div className="idea-content">
                    <div className="idea-menu">
                      <OverflowMenu
                        onEdit={() => onEditIdea(idea)}
                        onDelete={() => onDeleteIdea(idea.id)}
                        ariaLabel={`Actions for ${idea.title}`}
                      />
                    </div>
                    <h3>{idea.title}</h3>
                    {idea.description && (
                      <p className="idea-description">{idea.description}</p>
                    )}
                    {idea.link && (
                      <a
                        href={idea.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="idea-link"
                      >
                        View gift
                        <span aria-hidden="true">↗</span>
                      </a>
                    )}
                    {idea.occasionTags && idea.occasionTags.length > 0 && (
                      <div className="idea-tags">
                        {idea.occasionTags.map((tag) => (
                          <span key={tag} className="idea-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'Memories' && (
        <section aria-label="Memories">
          {sortedMemories.length === 0 ? (
            <div className="content-empty-state">
              <p>No memories yet</p>
              <button onClick={onAddMemory}>Add the first memory</button>
            </div>
          ) : (
            <div className="memory-list">
              {sortedMemories.map((memory) => (
                <article key={memory.id} className="memory-card">
                  <div className="memory-menu">
                    <OverflowMenu
                      onEdit={() => onEditMemory(memory)}
                      onDelete={() => onDeleteMemory(memory.id)}
                      ariaLabel="Memory actions"
                    />
                  </div>
                  <time dateTime={memory.createdAt}>{formatDate(memory.createdAt)}</time>
                  <p>{memory.text}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <button
        className="fab"
        onClick={activeTab === 'Ideas' ? onAddIdea : onAddMemory}
        aria-label={activeTab === 'Ideas' ? 'Add gift idea' : 'Add memory'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
