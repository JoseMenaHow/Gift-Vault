import type { Person, GiftIdea } from '../types';
import OverflowMenu from './OverflowMenu';

interface Props {
  people: Person[];
  ideas: GiftIdea[];
  onSelectPerson: (personId: string) => void;
  onAddPerson: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
}

export default function PeopleList({ people, ideas, onSelectPerson, onAddPerson, onEditPerson, onDeletePerson }: Props) {
  const getIdeaCount = (personId: string) => {
    return ideas.filter(i => i.personId === personId).length;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>My people</h1>
      </div>

      {people.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>People you care about, remembered here</p>
          <button onClick={onAddPerson} style={styles.emptyButton}>
            Add person
          </button>
        </div>
      ) : (
        <div style={styles.list}>
          {people.map((person) => {
            const ideaCount = getIdeaCount(person.id);
            return (
              <div
                key={person.id}
                style={styles.card}
                onClick={() => onSelectPerson(person.id)}
              >
                <div style={styles.cardHeader}>
                  <OverflowMenu
                    onEdit={() => onEditPerson(person)}
                    onDelete={() => onDeletePerson(person.id)}
                    ariaLabel="Person actions"
                  />
                </div>
                <div style={styles.cardContent}>
                  {person.photoUrl ? (
                    <img
                      src={person.photoUrl}
                      alt={person.name}
                      style={styles.photo}
                    />
                  ) : person.emoji ? (
                    <div style={styles.emojiAvatar}>{person.emoji}</div>
                  ) : (
                    <div style={styles.defaultAvatar}>👤</div>
                  )}
                  <div style={styles.cardText}>
                    <h2 style={styles.personName}>{person.name}</h2>
                    <p style={styles.relationship}>{person.relationship}</p>
                    {person.labelText && (
                      <p style={styles.labelText}>{person.labelText}</p>
                    )}
                  </div>
                </div>
                {ideaCount > 0 && (
                  <p style={styles.ideaCount}>{ideaCount} gifts</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {people.length > 0 && (
        <button className="fab" onClick={onAddPerson}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    padding: '32px 16px 100px',
    maxWidth: '700px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '36px',
    fontFamily: "'Playfair Display', serif",
    color: '#111111',
  },
  emptyState: {
    textAlign: 'center',
    padding: '64px 16px',
  },
  emptyText: {
    fontSize: '18px',
    color: '#6B7280',
    marginBottom: '24px',
  },
  emptyButton: {
    background: '#4F6EF7',
    color: 'white',
    padding: '12px 32px',
    borderRadius: '999px',
    fontSize: '16px',
    fontWeight: 500,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  card: {
    background: '#FFFFFF',
    borderRadius: '16px',
    padding: '24px',
    cursor: 'pointer',
    border: '1px solid #E5E7EB',
    transition: 'border-color 0.2s',
    position: 'relative',
  },
  cardHeader: {
    position: 'absolute',
    top: '12px',
    right: '12px',
  },
  cardContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  photo: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  emojiAvatar: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: '#F7F8FC',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    flexShrink: 0,
  },
  defaultAvatar: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: '#F7F8FC',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    flexShrink: 0,
    opacity: 0.5,
  },
  cardText: {
    flex: 1,
  },
  personName: {
    fontSize: '22px',
    fontFamily: "'Playfair Display', serif",
    marginBottom: '4px',
  },
  relationship: {
    fontSize: '14px',
    color: '#6B7280',
    marginBottom: '4px',
  },
  labelText: {
    fontSize: '14px',
    color: '#6B7280',
    fontStyle: 'italic',
  },
  ideaCount: {
    fontSize: '14px',
    color: '#4F6EF7',
    marginTop: '12px',
  },
};
