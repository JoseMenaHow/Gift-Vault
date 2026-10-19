import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarHeart, ChevronLeft, ChevronRight, CircleUserRound, Gift, Plus, Search, Tags, UserPlus } from 'lucide-react';
import type { Person, GiftIdea } from '../types';
import OverflowMenu from './OverflowMenu';
import { getTagColorClassName } from '../tagColors';
import WorkspaceNudge from './WorkspaceNudge';

type UpcomingOccasion = {
  id: string;
  personId: string;
  personName: string;
  type: 'birthday' | 'anniversary';
  daysAway: number;
  message: string;
};

interface Props {
  people: Person[];
  ideas: GiftIdea[];
  selectedPersonId?: string | null;
  upcomingOccasions: UpcomingOccasion[];
  onSelectPerson: (personId: string) => void;
  onOpenOccasion: (personId: string) => void;
  onAddPerson: () => void;
  onAddIdea: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  accountEmail?: string;
  isAuthLoading: boolean;
  isSupabaseConfigured: boolean;
  onOpenAccount: () => void;
}

function UpcomingOccasionReminder({
  occasions,
  onOpenPerson,
}: {
  occasions: UpcomingOccasion[];
  onOpenPerson: (personId: string) => void;
}) {
  const [occasionIndex, setOccasionIndex] = useState(0);
  const activeOccasion = occasions[occasionIndex];
  const isCarousel = occasions.length > 1;

  if (!activeOccasion) return null;

  return (
    <div
      className={`occasion-reminder${isCarousel ? ' is-carousel' : ''}`}
      role={isCarousel ? 'region' : undefined}
      aria-roledescription={isCarousel ? 'carousel' : undefined}
      aria-label={isCarousel ? 'Upcoming occasions' : undefined}
    >
      <div
        className="occasion-reminder-slide"
        role={isCarousel ? 'group' : undefined}
        aria-roledescription={isCarousel ? 'slide' : undefined}
        aria-label={isCarousel ? `${occasionIndex + 1} of ${occasions.length}` : undefined}
        aria-live={isCarousel ? 'polite' : undefined}
      >
        <WorkspaceNudge
          icon={<CalendarHeart size={18} strokeWidth={2} />}
          label="Coming up"
          onClick={() => onOpenPerson(activeOccasion.personId)}
          ariaLabel={`Open ${activeOccasion.personName}'s profile. ${activeOccasion.message}`}
        >
          {activeOccasion.message}
        </WorkspaceNudge>
      </div>
      {isCarousel && (
        <div className="occasion-carousel-controls">
          <button
            type="button"
            onClick={() => setOccasionIndex((currentIndex) => (
              (currentIndex - 1 + occasions.length) % occasions.length
            ))}
            aria-label="Previous upcoming occasion"
          >
            <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <div className="occasion-carousel-pages" aria-label="Choose upcoming occasion">
            {occasions.map((occasion, index) => (
              <button
                key={occasion.id}
                type="button"
                className={index === occasionIndex ? 'is-active' : undefined}
                onClick={() => setOccasionIndex(index)}
                aria-label={`Show ${occasion.personName}'s ${occasion.type}`}
                aria-current={index === occasionIndex ? 'true' : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOccasionIndex((currentIndex) => (currentIndex + 1) % occasions.length)}
            aria-label="Next upcoming occasion"
          >
            <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function PeopleList({
  people,
  ideas,
  selectedPersonId,
  upcomingOccasions,
  onSelectPerson,
  onOpenOccasion,
  onAddPerson,
  onAddIdea,
  onEditPerson,
  onDeletePerson,
  accountEmail,
  isAuthLoading,
  isSupabaseConfigured,
  onOpenAccount,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [isCreationMenuOpen, setIsCreationMenuOpen] = useState(false);
  const creationMenuRef = useRef<HTMLDivElement>(null);
  const creationButtonRef = useRef<HTMLButtonElement>(null);
  const occasionOrderKey = upcomingOccasions.map((occasion) => occasion.id).join('|');

  useEffect(() => {
    if (!isCreationMenuOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      creationMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!creationMenuRef.current?.contains(target) && !creationButtonRef.current?.contains(target)) {
        setIsCreationMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsCreationMenuOpen(false);
      creationButtonRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCreationMenuOpen]);

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
        <div className="people-brand-row">
          <div className="vault-brand" aria-label="Gift Vault">
            <img
              className="vault-brand-mark"
              src="/gift-vault-192.png"
              alt=""
              aria-hidden="true"
            />
            <span className="vault-brand-name">gift vault.</span>
          </div>
          <button
            type="button"
            className="account-button"
            onClick={onOpenAccount}
            aria-label={accountEmail ? `Account: ${accountEmail}` : 'Open account'}
          >
            <CircleUserRound size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{isAuthLoading ? 'Account' : accountEmail ? 'Account' : isSupabaseConfigured ? 'Sign in' : 'Account'}</span>
          </button>
        </div>

        <div className="people-heading-row">
          <div className="people-heading-copy">
            <h1 className="page-title">My People</h1>
            <p className="people-heading-description">Thoughtful ideas for your favorite people.</p>
          </div>
          {people.length > 0 && (
            <button className="add-person-button" onClick={onAddPerson}>
              <Plus size={17} strokeWidth={2} aria-hidden="true" />
              Add
            </button>
          )}
        </div>
      </header>

      <UpcomingOccasionReminder
        key={occasionOrderKey}
        occasions={upcomingOccasions}
        onOpenPerson={onOpenOccasion}
      />

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
              <div className="people-search-control">
                <Search className="people-search-icon" size={17} strokeWidth={1.8} aria-hidden="true" />
                <input
                  type="search"
                  className="people-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search people"
                  aria-label="Search people by name"
                />
              </div>
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
        <>
          {isCreationMenuOpen && (
            <div ref={creationMenuRef} className="mobile-creation-menu" role="menu" aria-label="Create">
              <button
                type="button"
                className="mobile-creation-option"
                role="menuitem"
                onClick={() => {
                  setIsCreationMenuOpen(false);
                  onAddPerson();
                }}
              >
                <span className="mobile-creation-option-icon" aria-hidden="true">
                  <UserPlus size={18} strokeWidth={1.9} />
                </span>
                <span>
                  <strong>Add person</strong>
                  <small>Someone to remember</small>
                </span>
              </button>
              <button
                type="button"
                className="mobile-creation-option"
                role="menuitem"
                onClick={() => {
                  setIsCreationMenuOpen(false);
                  onAddIdea();
                }}
              >
                <span className="mobile-creation-option-icon" aria-hidden="true">
                  <Gift size={18} strokeWidth={1.9} />
                </span>
                <span>
                  <strong>Add gift idea</strong>
                  <small>Choose who it is for</small>
                </span>
              </button>
            </div>
          )}
          <button
            ref={creationButtonRef}
            className={`fab mobile-fab${isCreationMenuOpen ? ' is-open' : ''}`}
            onClick={() => setIsCreationMenuOpen((isOpen) => !isOpen)}
            aria-label={isCreationMenuOpen ? 'Close creation menu' : 'Create new'}
            aria-expanded={isCreationMenuOpen}
            aria-haspopup="menu"
          >
            <Plus size={25} strokeWidth={2} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
