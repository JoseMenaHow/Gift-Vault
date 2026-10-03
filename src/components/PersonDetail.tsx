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
    <div style={styles.container}>
      <button onClick={onBack} style={styles.backButton}>
        ← Back
      </button>

      <div style={styles.headerCard}>
        <div style={styles.headerOverflow}>
          <OverflowMenu
            onEdit={() => onEditPerson(person)}
            onDelete={() => onDeletePerson(person.id)}
            ariaLabel="Person actions"
          />
        </div>
        <div style={styles.header}>
          {person.photoUrl ? (
            <img src={person.photoUrl} alt={person.name} style={styles.headerPhoto} />
          ) : person.emoji ? (
            <div style={styles.headerEmojiAvatar}>{person.emoji}</div>
          ) : (
            <div style={styles.headerDefaultAvatar}>👤</div>
          )}
          <h1 style={styles.name}>{person.name}</h1>
          <p style={styles.relationship}>{person.relationship}</p>
          {person.labelText && (
            <p style={styles.labelText}>{person.labelText}</p>
          )}
        </div>
      </div>

      <Tabs
        tabs={['Ideas', 'Memories']}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as 'Ideas' | 'Memories')}
      />

      {activeTab === 'Ideas' && (
        <>
          {allOccasions.length > 1 && (
            <div style={styles.filterChips}>
              {allOccasions.map((occasion) => (
                <button
                  key={occasion}
                  onClick={() => setSelectedOccasion(occasion)}
                  style={{
                    ...styles.chip,
                    ...(selectedOccasion === occasion ? styles.chipActive : {}),
                  }}
                >
                  {occasion}
                </button>
              ))}
            </div>
          )}

          {filteredIdeas.length === 0 ? (
            <p style={styles.emptyText}>No gift ideas yet</p>
          ) : (
            <div className="idea-grid">
              {filteredIdeas.map((idea) => (
                <div key={idea.id} style={styles.ideaCard}>
                  {idea.imageUrl ? (
                    <img src={idea.imageUrl} alt={idea.title} style={styles.ideaImage} />
                  ) : idea.emoji ? (
                    <div style={styles.ideaEmojiPlaceholder}>{idea.emoji}</div>
                  ) : null}
                  <div style={styles.ideaContent}>
                    <div style={styles.ideaHeader}>
                      <OverflowMenu
                        onEdit={() => onEditIdea(idea)}
                        onDelete={() => onDeleteIdea(idea.id)}
                        ariaLabel="Idea actions"
                      />
                    </div>
                    <h3 style={styles.ideaTitle}>{idea.title}</h3>
                    {idea.description && (
                      <p style={styles.ideaDescription}>{idea.description}</p>
                    )}
                    {idea.link && (
                      <a
                        href={idea.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.ideaLink}
                      >
                        View link
                      </a>
                    )}
                    {idea.occasionTags && idea.occasionTags.length > 0 && (
                      <div style={styles.tags}>
                        {idea.occasionTags.map((tag, idx) => (
                          <span key={idx} style={styles.tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'Memories' && (
        <>
          {sortedMemories.length === 0 ? (
            <p style={styles.emptyText}>No memories yet</p>
          ) : (
            <div style={styles.memoryList}>
              {sortedMemories.map((memory) => (
                <div key={memory.id} style={styles.memoryCard}>
                  <div style={styles.memoryHeader}>
                    <OverflowMenu
                      onEdit={() => onEditMemory(memory)}
                      onDelete={() => onDeleteMemory(memory.id)}
                      ariaLabel="Memory actions"
                    />
                  </div>
                  <p style={styles.memoryDate}>{formatDate(memory.createdAt)}</p>
                  <p style={styles.memoryText}>{memory.text}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <button
        className="fab"
        onClick={activeTab === 'Ideas' ? onAddIdea : onAddMemory}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    padding: '32px 16px 100px',
    maxWidth: '700px',
    margin: '0 auto',
  },
  backButton: {
    fontSize: '16px',
    color: '#6B7280',
    marginBottom: '16px',
    cursor: 'pointer',
  },
  headerCard: {
    background: '#FFFFFF',
    borderRadius: '16px',
    border: '1px solid #E5E7EB',
    padding: '24px',
    marginBottom: '16px',
    position: 'relative',
  },
  headerOverflow: {
    position: 'absolute',
    top: '12px',
    right: '12px',
  },
  header: {
    textAlign: 'center',
  },
  headerPhoto: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    objectFit: 'cover',
    marginBottom: '12px',
  },
  headerEmojiAvatar: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: '#F7F8FC',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    marginBottom: '12px',
  },
  headerDefaultAvatar: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: '#F7F8FC',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    marginBottom: '12px',
    opacity: 0.5,
  },
  name: {
    fontSize: '28px',
    fontFamily: "'Playfair Display', serif",
    marginBottom: '4px',
  },
  relationship: {
    fontSize: '14px',
    color: '#6B7280',
    marginBottom: '4px',
  },
  labelText: {
    fontSize: '13px',
    color: '#6B7280',
    fontStyle: 'italic',
  },
  filterChips: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '24px',
  },
  chip: {
    padding: '6px 16px',
    borderRadius: '999px',
    fontSize: '14px',
    border: '1px solid #E5E7EB',
    background: '#FFFFFF',
    color: '#6B7280',
    cursor: 'pointer',
  },
  chipActive: {
    background: '#4F6EF7',
    color: '#FFFFFF',
    borderColor: '#4F6EF7',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6B7280',
    padding: '48px 0',
    fontSize: '16px',
  },
  ideaCard: {
    background: '#FFFFFF',
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid #E5E7EB',
    position: 'relative',
  },
  ideaImage: {
    width: '100%',
    height: '160px',
    objectFit: 'cover',
  },
  ideaEmojiPlaceholder: {
    width: '100%',
    height: '160px',
    background: '#F7F8FC',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '64px',
  },
  ideaContent: {
    padding: '16px',
    position: 'relative',
  },
  ideaHeader: {
    position: 'absolute',
    top: '12px',
    right: '12px',
  },
  ideaTitle: {
    fontSize: '18px',
    fontFamily: "'Playfair Display', serif",
    color: '#111111',
    marginBottom: '8px',
  },
  ideaDescription: {
    fontSize: '14px',
    color: '#2B2B2B',
    lineHeight: '1.5',
    marginBottom: '8px',
  },
  ideaLink: {
    fontSize: '14px',
    color: '#4F6EF7',
    textDecoration: 'none',
    display: 'inline-block',
    marginBottom: '8px',
  },
  tags: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginTop: '12px',
  },
  tag: {
    fontSize: '12px',
    color: '#6B7280',
    background: '#F7F8FC',
    padding: '4px 10px',
    borderRadius: '999px',
  },
  memoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  memoryCard: {
    background: '#FFFFFF',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid #E5E7EB',
    position: 'relative',
  },
  memoryHeader: {
    position: 'absolute',
    top: '12px',
    right: '12px',
  },
  memoryDate: {
    fontSize: '13px',
    color: '#6B7280',
    marginBottom: '8px',
  },
  memoryText: {
    fontSize: '16px',
    color: '#2B2B2B',
    lineHeight: '1.6',
  },
};
