import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { GiftIdea, Person } from '../types';
import GiftIdeaMedia from './GiftIdeaMedia';

interface Props {
  person: Person;
  idea: GiftIdea;
  onBack: () => void;
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function GiftDetail({ person, idea, onBack }: Props) {
  return (
    <div className="gift-detail">
      <button type="button" className="gift-detail-back" onClick={onBack}>
        <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        Back to {idea.giftedAt ? 'Delivered gifts' : 'Ideas'}
      </button>

      <article className="gift-detail-card">
        <div className="gift-detail-heading">
          <p className="page-eyebrow">Gift idea for {person.name}</p>
          <h1>{idea.title}</h1>
          {idea.giftedAt && (
            <p className="gift-detail-status">Gifted {formatDate(idea.giftedAt)}</p>
          )}
        </div>

        <GiftIdeaMedia imageUrl={idea.imageUrl} link={idea.link} variant="detail" />

        <div className="gift-detail-content">
          {idea.description && <p className="gift-detail-description">{idea.description}</p>}

          {idea.occasionTags && idea.occasionTags.length > 0 && (
            <div className="gift-detail-tags" aria-label="Occasions">
              {idea.occasionTags.map((tag) => (
                <span key={tag} className="idea-tag">{tag}</span>
              ))}
            </div>
          )}

          {idea.link && (
            <a
              href={idea.link}
              target="_blank"
              rel="noopener noreferrer"
              className="gift-detail-visit"
            >
              Visit gift
              <ExternalLink size={17} strokeWidth={2} aria-hidden="true" />
            </a>
          )}

          <p className="gift-detail-created">Saved {formatDate(idea.createdAt)}</p>
        </div>
      </article>
    </div>
  );
}
