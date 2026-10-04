import { useMemo, useState } from 'react';
import { Tags } from 'lucide-react';
import type { Person, GiftIdea } from '../types';
import OverflowMenu from './OverflowMenu';
import { getTagColorClassName } from '../tagColors';

interface Props {
  people: Person[];
  ideas: GiftIdea[];
  selectedPersonId?: string | null;
  onSelectPerson: (personId: string) => void;
  onAddPerson: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
}

export default function PeopleList({
  people,
  ideas,
  selectedPersonId,
  onSelectPerson,
  onAddPerson,
  onEditPerson,
  onDeletePerson,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);

  const getIdeaCount = (personId: string) => {
    return ideas.filter(i => i.personId === personId && !i.giftedAt).length;
  };

  const availableTags = useMemo(() => (
    Array.from(new Set(people.flatMap((person) => person.tags || [])))
      .sort((first, second) => first.localeCompare(second))
  ), [people]);

  const activeTags = selectedTags.filter((tag) => availableTags.includes(tag));
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visiblePeople = people.filter((person) => {
    const matchesName = !normalizedQuery || person.name.toLocaleLowerCase().includes(normalizedQuery);
    const matchesTags = activeTags.length === 0 || activeTags.every((tag) => person.tags?.includes(tag));
    return matchesName && matchesTags;
  });

  const toggleTag = (tag: string) => {
    setSelectedTags(() => (
      activeTags.includes(tag)
        ? activeTags.filter((currentTag) => currentTag !== tag)
        : [...activeTags, tag]
    ));
  };

  const handleCardKeyDown = (event: React.KeyboardEvent, personId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectPerson(personId);
    }
  };

  return (
    <div className="people-page">
      <header className="people-header">
        <div>
          <p className="page-eyebrow">Gift vault</p>
          <h1 className="page-title">My people</h1>
        </div>
        {people.length > 0 && (
          <button className="add-person-button" onClick={onAddPerson}>
            <span aria-hidden="true">+</span>
            Add
          </button>
        )}
      </header>

      {people.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">♡</div>
          <h2>Add someone special</h2>
          <p>Keep their gift ideas and the little things worth remembering together.</p>
          <button onClick={onAddPerson} className="btn-primary">
            Add person
          </button>
        </div>
      ) : (
        <>
          <section className="people-finder" aria-label="Find people">
            <div className="people-search-row">
              <input
                type="search"
                className="people-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search people"
                aria-label="Search people by name"
              />
              {availableTags.length > 0 && (
                <button
                  type="button"
                  className={`people-tag-toggle${isTagFilterOpen ? ' is-active' : ''}`}
                  onClick={() => setIsTagFilterOpen((isOpen) => !isOpen)}
                  aria-label="Filter people by tags"
                  aria-expanded={isTagFilterOpen}
                  aria-controls="people-tag-filters"
                >
                  <Tags size={18} strokeWidth={2} aria-hidden="true" />
                  {activeTags.length > 0 && <span className="people-tag-count">{activeTags.length}</span>}
                </button>
              )}
            </div>
            {isTagFilterOpen && availableTags.length > 0 && (
              <div id="people-tag-filters" className="people-tag-filters" aria-label="Filter people by tags">
                {availableTags.map((tag) => {
                  const isActive = activeTags.includes(tag);

                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`people-tag-filter ${getTagColorClassName(tag)}${isActive ? ' is-active' : ''}`}
                      onClick={() => toggleTag(tag)}
                      aria-pressed={isActive}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
            {(searchQuery || activeTags.length > 0) && (
              <button
                type="button"
                className="people-filters-clear"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTags([]);
                }}
              >
                Clear filters
              </button>
            )}
          </section>

          {visiblePeople.length === 0 ? (
            <div className="people-filter-empty">
              <div className="people-filter-empty-icon" aria-hidden="true">+</div>
              <h2>No one found</h2>
              <p>Start a new list for someone special.</p>
              <button type="button" className="btn-primary" onClick={onAddPerson}>
                Add someone
              </button>
              <button
                type="button"
                className="people-filter-reset"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTags([]);
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="people-list">
          {visiblePeople.map((person) => {
            const ideaCount = getIdeaCount(person.id);
            const isSelected = person.id === selectedPersonId;

            return (
              <article
                key={person.id}
                className={`person-card${isSelected ? ' is-selected' : ''}`}
                onClick={() => onSelectPerson(person.id)}
                onKeyDown={(event) => handleCardKeyDown(event, person.id)}
                role="button"
                tabIndex={0}
                aria-current={isSelected ? 'page' : undefined}
              >
                <div className="person-card-content">
                  {person.photoUrl ? (
                    <img
                      src={person.photoUrl}
                      alt=""
                      className="person-avatar person-photo"
                    />
                  ) : (
                    <div className="person-avatar person-placeholder" aria-hidden="true">
                      {person.emoji || '👤'}
                    </div>
                  )}
                  <div className="person-card-text">
                    <h2>{person.name}</h2>
                    {person.tags && person.tags.length > 0 && (
                      <div className="person-tags" aria-label="Person tags">
                        {person.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className={`person-tag ${getTagColorClassName(tag)}`}>{tag}</span>
                        ))}
                        {person.tags.length > 2 && (
                          <span className="person-tag person-tag-more">+{person.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                    {person.labelText && (
                      <span className="person-label">{person.labelText}</span>
                    )}
                  </div>
                  <div className="person-card-actions">
                    <OverflowMenu
                      onEdit={() => onEditPerson(person)}
                      onDelete={() => onDeletePerson(person.id)}
                      ariaLabel="Person actions"
                    />
                    <span className="person-card-arrow" aria-hidden="true">›</span>
                  </div>
                </div>
                <span className="idea-count">
                  {ideaCount === 0 ? 'No open ideas' : `${ideaCount} ${ideaCount === 1 ? 'idea' : 'ideas'}`}
                </span>
              </article>
            );
          })}
            </div>
          )}
        </>
      )}

      {people.length > 0 && (
        <button className="fab mobile-fab" onClick={onAddPerson} aria-label="Add person">
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
