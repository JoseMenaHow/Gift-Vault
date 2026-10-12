import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { GiftIdea, Person } from '../../types';
import { getTagColorClassName } from '../../tagColors';

interface Props {
  idea: GiftIdea;
  people: Person[];
  onDuplicate: (idea: GiftIdea, destinationPersonId: string) => void;
  onClose: () => void;
}

export default function DuplicateGiftModal({ idea, people, onDuplicate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [destinationPersonId, setDestinationPersonId] = useState<string | null>(null);

  const visiblePeople = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return people;

    return people.filter((person) => person.name.toLocaleLowerCase().includes(normalizedQuery));
  }, [people, query]);

  const destinationPerson = people.find((person) => person.id === destinationPersonId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="modal-content duplicate-gift-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-gift-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="duplicate-gift-heading">
          <div>
            <p className="page-eyebrow">Duplicate gift idea</p>
            <h2 id="duplicate-gift-title" className="modal-title">Copy {idea.title}</h2>
          </div>
          <button type="button" className="duplicate-gift-close" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <label className="form-label" htmlFor="duplicate-person-search">Choose a person</label>
        <div className="duplicate-person-search">
          <Search size={17} strokeWidth={2} aria-hidden="true" />
          <input
            id="duplicate-person-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people"
            autoFocus
          />
        </div>

        <div className="duplicate-person-list" role="listbox" aria-label="People">
          {visiblePeople.length > 0 ? visiblePeople.map((person) => {
            const isSelected = person.id === destinationPersonId;

            return (
              <button
                key={person.id}
                type="button"
                className={`duplicate-person-option${isSelected ? ' is-selected' : ''}`}
                onClick={() => setDestinationPersonId(person.id)}
                role="option"
                aria-selected={isSelected}
              >
                <span className="duplicate-person-avatar" aria-hidden="true">
                  {person.photoUrl ? <img src={person.photoUrl} alt="" /> : person.emoji || person.name.charAt(0).toUpperCase()}
                </span>
                <span className="duplicate-person-copy">
                  <strong>{person.name}</strong>
                  {person.tags && person.tags.length > 0 && (
                    <span className="duplicate-person-tags">
                      {person.tags.map((tag) => (
                        <span key={tag} className={`person-tag ${getTagColorClassName(tag)}`}>{tag}</span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            );
          }) : (
            <p className="duplicate-person-empty">No people match “{query.trim()}”.</p>
          )}
        </div>

        <div className="button-group duplicate-gift-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={!destinationPerson}
            onClick={() => destinationPerson && onDuplicate(idea, destinationPerson.id)}
          >
            Duplicate to {destinationPerson ? destinationPerson.name : 'person'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
