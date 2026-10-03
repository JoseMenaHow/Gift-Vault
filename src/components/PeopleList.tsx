import type { Person, GiftIdea } from '../types';
import OverflowMenu from './OverflowMenu';

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
  const getIdeaCount = (personId: string) => {
    return ideas.filter(i => i.personId === personId).length;
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
        <div className="people-list">
          {people.map((person) => {
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
                <div className="person-card-menu">
                  <OverflowMenu
                    onEdit={() => onEditPerson(person)}
                    onDelete={() => onDeletePerson(person.id)}
                    ariaLabel="Person actions"
                  />
                </div>
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
                    <p>{person.relationship}</p>
                    {person.labelText && (
                      <span className="person-label">{person.labelText}</span>
                    )}
                  </div>
                  <span className="person-card-arrow" aria-hidden="true">›</span>
                </div>
                <span className="idea-count">
                  {ideaCount} {ideaCount === 1 ? 'idea' : 'ideas'}
                </span>
              </article>
            );
          })}
        </div>
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
