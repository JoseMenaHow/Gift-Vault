import { ArrowLeft, ExternalLink, Pencil } from 'lucide-react';
import type { GiftIdea, Person } from '../types';
import { getTagColorClassName } from '../tagColors';
import GiftIdeaMedia from './GiftIdeaMedia';

interface Props {
  person: Person;
  idea: GiftIdea;
  onBack: () => void;
  onEdit: () => void;
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getWebsiteName(link: string) {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, '');
    const name = hostname.split('.')[0];
    return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'gift';
  }
}

export default function GiftDetail({ person, idea, onBack, onEdit }: Props) {
  const links = idea.links || [];

  return (
    <div className="gift-detail">
      <button type="button" className="gift-detail-back" onClick={onBack}>
        <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        Back to {idea.giftedAt ? 'Delivered gifts' : 'Ideas'}
      </button>

      <article className="gift-detail-card">
        <div className="gift-detail-heading">
          <button
            type="button"
            className="gift-detail-edit"
            onClick={onEdit}
            aria-label="Edit gift"
            title="Edit gift"
          >
            <Pencil size={17} strokeWidth={2} aria-hidden="true" />
          </button>
          <p className="page-eyebrow">Gift idea for {person.name}</p>
          <h1>{idea.title}</h1>
          {idea.giftedAt && (
            <p className="gift-detail-status">Gifted {formatDate(idea.giftedAt)}</p>
          )}
        </div>

        <div className="gift-detail-media-frame">
          <GiftIdeaMedia imageUrl={idea.imageUrl} links={links} variant="detail" />
        </div>

        <div className="gift-detail-content">
          {idea.description && <p className="gift-detail-description">{idea.description}</p>}

          {idea.occasionTags && idea.occasionTags.length > 0 && (
            <div className="gift-detail-tags" aria-label="Occasions">
              {idea.occasionTags.map((tag) => (
                <span key={tag} className={`idea-tag ${getTagColorClassName(tag)}`}>{tag}</span>
              ))}
            </div>
          )}

          {links.length === 1 && (
            <a
              href={links[0]}
              target="_blank"
              rel="noopener noreferrer"
            className="gift-detail-visit"
          >
              Visit {getWebsiteName(links[0])}
              <ExternalLink size={17} strokeWidth={2} aria-hidden="true" />
            </a>
          )}

          {links.length > 1 && (
            <section className="gift-detail-links" aria-labelledby="gift-detail-links-title">
              <h2 id="gift-detail-links-title">Options</h2>
              <div className="gift-detail-link-list">
                {links.map((link, index) => (
                  <a
                    key={`${link}-${index}`}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gift-detail-link-option"
                  >
                    <span>{getWebsiteName(link)}</span>
                    <ExternalLink size={17} strokeWidth={2} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </section>
          )}

          <p className="gift-detail-created">Saved {formatDate(idea.createdAt)}</p>
        </div>
      </article>
    </div>
  );
}
