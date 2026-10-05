import { useEffect, useState } from 'react';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import type { Person, Memory, GiftIdea } from '../types';
import Tabs from './Tabs';
import OverflowMenu from './OverflowMenu';
import { getTagColorClassName } from '../tagColors';
import GiftIdeaMedia from './GiftIdeaMedia';
import { formatBirthday, getBirthdayFromInput, toBirthdayInputValue } from '../birthday';

type DetailTab = 'Ideas' | 'Delivered gifts' | 'Memories';

interface Props {
  person: Person;
  memories: Memory[];
  ideas: GiftIdea[];
  onBack: () => void;
  ideasTabRequest: number;
  onAddMemory: () => void;
  onAddIdea: () => void;
  onEditPerson: (person: Person) => void;
  onUpdatePerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  onEditMemory: (memory: Memory) => void;
  onEditIdea: (idea: GiftIdea) => void;
  onDeleteMemory: (memoryId: string) => void;
  onDeleteIdea: (ideaId: string) => void;
  onSetIdeaGifted: (ideaId: string, gifted: boolean) => void;
}

export default function PersonDetail({
  person,
  memories,
  ideas,
  onBack,
  ideasTabRequest,
  onAddMemory,
  onAddIdea,
  onEditPerson,
  onUpdatePerson,
  onDeletePerson,
  onEditMemory,
  onEditIdea,
  onDeleteMemory,
  onDeleteIdea,
  onSetIdeaGifted,
}: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('Ideas');
  const [selectedOccasion, setSelectedOccasion] = useState<string>('All');
  const [isBirthdayEditorOpen, setIsBirthdayEditorOpen] = useState(false);
  const [birthdayInput, setBirthdayInput] = useState(toBirthdayInputValue(person.birthday));

  useEffect(() => {
    if (ideasTabRequest > 0) setActiveTab('Ideas');
  }, [ideasTabRequest]);

  const activeIdeas = ideas.filter(idea => !idea.giftedAt);
  const deliveredIdeas = ideas
    .filter(idea => idea.giftedAt)
    .sort((a, b) => new Date(b.giftedAt!).getTime() - new Date(a.giftedAt!).getTime());
  const allOccasions = ['All', ...new Set(activeIdeas.flatMap(idea => idea.occasionTags || []))];
  const filteredIdeas = selectedOccasion === 'All'
    ? activeIdeas
    : activeIdeas.filter(idea => idea.occasionTags?.includes(selectedOccasion));
  const visibleIdeas = activeTab === 'Delivered gifts' ? deliveredIdeas : filteredIdeas;

  const sortedMemories = [...memories].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const openBirthdayEditor = () => {
    setBirthdayInput(toBirthdayInputValue(person.birthday));
    setIsBirthdayEditorOpen(true);
  };

  const saveBirthday = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const birthday = getBirthdayFromInput(birthdayInput);
    if (!birthday) return;

    onUpdatePerson({ ...person, birthday });
    setIsBirthdayEditorOpen(false);
  };

  const removeBirthday = () => {
    onUpdatePerson({ ...person, birthday: undefined });
    setIsBirthdayEditorOpen(false);
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
          {isBirthdayEditorOpen ? (
            <form className="birthday-editor" onSubmit={saveBirthday}>
              <input
                type="date"
                className="birthday-input"
                value={birthdayInput}
                onChange={(event) => setBirthdayInput(event.target.value)}
                aria-label="Birthday"
                required
              />
              <button type="submit" className="birthday-editor-save">Save</button>
              <button
                type="button"
                className="birthday-editor-cancel"
                onClick={() => setIsBirthdayEditorOpen(false)}
              >
                Cancel
              </button>
              {person.birthday && (
                <button
                  type="button"
                  className="birthday-editor-remove"
                  onClick={removeBirthday}
                  aria-label="Remove birthday"
                  title="Remove birthday"
                >
                  <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </form>
          ) : person.birthday ? (
            <button
              type="button"
              className="birthday-summary"
              onClick={openBirthdayEditor}
              aria-label={`Edit birthday, ${formatBirthday(person.birthday)}`}
            >
              <span>Birthday · {formatBirthday(person.birthday)}</span>
              <Pencil size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="birthday-add" onClick={openBirthdayEditor}>
              <CalendarPlus size={15} strokeWidth={2} aria-hidden="true" />
              Add birthday
            </button>
          )}
          {person.tags && person.tags.length > 0 && (
            <div className="person-tags person-hero-tags" aria-label="Person tags">
              {person.tags.map((tag) => (
                <span key={tag} className={`person-tag ${getTagColorClassName(tag)}`}>{tag}</span>
              ))}
            </div>
          )}
          {person.labelText && (
            <p className="person-note">{person.labelText}</p>
          )}
        </div>
      </section>

      <Tabs
        tabs={['Ideas', 'Delivered gifts', 'Memories']}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as DetailTab)}
      />

      {(activeTab === 'Ideas' || activeTab === 'Delivered gifts') && (
        <section aria-label={activeTab}>
          {activeTab === 'Ideas' && allOccasions.length > 1 && (
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

          {visibleIdeas.length === 0 ? (
            <div className="content-empty-state">
              {activeTab === 'Ideas' ? (
                <>
                  <p>No gift ideas yet</p>
                  <button onClick={onAddIdea}>Add the first idea</button>
                </>
              ) : (
                <p>No delivered gifts yet</p>
              )}
            </div>
          ) : (
            <div className="idea-grid">
              {visibleIdeas.map((idea) => {
                const isGifted = Boolean(idea.giftedAt);

                return (
                  <article key={idea.id} className={`idea-card${isGifted ? ' is-gifted' : ''}`}>
                    <GiftIdeaMedia imageUrl={idea.imageUrl} emoji={idea.emoji} link={idea.link} />
                    <div className="idea-content">
                      <div className="idea-menu">
                        <OverflowMenu
                          onEdit={() => onEditIdea(idea)}
                          onGift={() => onSetIdeaGifted(idea.id, !isGifted)}
                          giftLabel={isGifted ? 'Move back to ideas' : 'Mark as gifted'}
                          onDelete={() => onDeleteIdea(idea.id)}
                          ariaLabel={`Actions for ${idea.title}`}
                        />
                      </div>
                      {isGifted && idea.giftedAt && (
                        <p className="gifted-status">Gifted {formatDate(idea.giftedAt)}</p>
                      )}
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
                );
              })}
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

      {activeTab !== 'Delivered gifts' && (
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
      )}
    </div>
  );
}
