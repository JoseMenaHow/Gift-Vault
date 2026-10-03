import { useState } from 'react';
import type { GiftIdea } from '../../types';

interface Props {
  personId: string;
  initialIdea?: GiftIdea;
  onSave: (idea: Omit<GiftIdea, 'id' | 'createdAt'> | GiftIdea) => void;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['🎁', '⭐️', '❤️', '🎉', '🎈', '🎂', '💝', '🌟'];

export default function AddIdeaModal({ personId, initialIdea, onSave, onClose }: Props) {
  const [title, setTitle] = useState(initialIdea?.title || '');
  const [description, setDescription] = useState(initialIdea?.description || '');
  const [link, setLink] = useState(initialIdea?.link || '');
  const [occasionTags, setOccasionTags] = useState(initialIdea?.occasionTags?.join(', ') || '');
  const [imageUrl, setImageUrl] = useState(initialIdea?.imageUrl || '');
  const [emoji, setEmoji] = useState(initialIdea?.emoji || '');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImageUrl(dataUrl);
      setEmoji('');
    };
    reader.readAsDataURL(file);
  };

  const handleEmojiSelect = (selectedEmoji: string) => {
    setEmoji(selectedEmoji);
    setImageUrl('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = occasionTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (initialIdea) {
      // Editing existing idea (preserve id and createdAt)
      onSave({
        ...initialIdea,
        title: title.trim(),
        description: description.trim() || undefined,
        link: link.trim() || undefined,
        occasionTags: tags.length > 0 ? tags : undefined,
        imageUrl: imageUrl.trim() || undefined,
        emoji: emoji || undefined,
      });
    } else {
      // Adding new idea
      onSave({
        personId,
        title: title.trim(),
        description: description.trim() || undefined,
        link: link.trim() || undefined,
        occasionTags: tags.length > 0 ? tags : undefined,
        imageUrl: imageUrl.trim() || undefined,
        emoji: emoji || undefined,
      });
    }
  };

  return (
    <div className="fullscreen-modal-overlay">
      <div className="fullscreen-modal-content">
        <div className="fullscreen-modal-header">
          <h2 className="fullscreen-modal-title">{initialIdea ? 'Edit gift idea' : 'New gift idea'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="fullscreen-modal-close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="fullscreen-modal-form">
          <div className="fullscreen-modal-scroll">
            <div className="form-group">
              <label className="form-label">Title</label>
              <input
                type="text"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <textarea
                className="form-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Link (optional)</label>
              <input
                type="url"
                className="form-input"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Occasion tags (optional)</label>
              <input
                type="text"
                className="form-input"
                value={occasionTags}
                onChange={(e) => setOccasionTags(e.target.value)}
                placeholder="Birthday, Christmas, Anniversary (comma-separated)"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Image (optional)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleFileUpload}
              className="form-input form-file-input"
            />
            {(imageUrl || emoji) && (
              <div className="media-preview media-preview-idea">
                {imageUrl ? (
                  <img src={imageUrl} alt="Preview" className="media-preview-image" />
                ) : emoji ? (
                  <div className="media-preview-fallback" aria-hidden="true">{emoji}</div>
                ) : null}
                <button
                  type="button"
                    onClick={() => {
                    setImageUrl('');
                    setEmoji('');
                  }}
                  className="media-remove"
                >
                  Remove
                </button>
                </div>
              )}
            </div>

          <div className="form-group">
            <label className="form-label">Or choose an emoji placeholder</label>
            <div className="emoji-picker emoji-picker-large">
              {EMOJI_OPTIONS.map((emojiOption) => (
                <button
                  key={emojiOption}
                  type="button"
                  onClick={() => handleEmojiSelect(emojiOption)}
                  className={`emoji-option${emoji === emojiOption ? ' is-selected' : ''}`}
                  aria-pressed={emoji === emojiOption}
                >
                  {emojiOption}
                </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Image URL (optional)</label>
              <input
                type="url"
                className="form-input"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setEmoji('');
                }}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="fullscreen-modal-footer">
            <button
              type="submit"
              className="btn-primary"
              disabled={!title.trim()}
            >
              Save
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
