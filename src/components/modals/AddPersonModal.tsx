import { useState } from 'react';
import type { Person } from '../../types';
import { getTagColorClassName } from '../../tagColors';

interface Props {
  initialPerson?: Person;
  availableTags: string[];
  onSave: (person: Omit<Person, 'id'> | Person) => void;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['❤️', '🎁', '⭐️', '😊', '📷'];

export default function AddPersonModal({ initialPerson, availableTags, onSave, onClose }: Props) {
  const [name, setName] = useState(initialPerson?.name || '');
  const [selectedTags, setSelectedTags] = useState(initialPerson?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(initialPerson?.photoUrl || '');
  const [emoji, setEmoji] = useState(initialPerson?.emoji || '');
  const [labelText, setLabelText] = useState(initialPerson?.labelText || '');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPhotoUrl(dataUrl);
      setEmoji('');
    };
    reader.readAsDataURL(file);
  };

  const handleEmojiSelect = (selectedEmoji: string) => {
    setEmoji(selectedEmoji);
    setPhotoUrl('');
  };

  const isTagSelected = (tag: string) => (
    selectedTags.some((selectedTag) => selectedTag.toLocaleLowerCase() === tag.toLocaleLowerCase())
  );

  const addTag = (rawTag: string) => {
    const tag = rawTag.trim();
    if (!tag || isTagSelected(tag)) {
      setTagInput('');
      return;
    }

    setSelectedTags((currentTags) => [...currentTags, tag]);
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setSelectedTags((currentTags) => currentTags.filter((currentTag) => currentTag !== tag));
  };

  const tagQuery = tagInput.trim().toLocaleLowerCase();
  const matchingTags = availableTags.filter((tag) => (
    !isTagSelected(tag) && (!tagQuery || tag.toLocaleLowerCase().includes(tagQuery))
  ));
  const canCreateTag = Boolean(tagInput.trim()) && !availableTags.some(
    (tag) => tag.toLocaleLowerCase() === tagQuery
  ) && !isTagSelected(tagInput.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (initialPerson) {
      // Editing existing person
      onSave({
        ...initialPerson,
        name: name.trim(),
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        photoUrl: photoUrl.trim() || undefined,
        emoji: emoji || undefined,
        labelText: labelText.trim() || undefined,
      });
    } else {
      // Adding new person
      onSave({
        name: name.trim(),
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        photoUrl: photoUrl.trim() || undefined,
        emoji: emoji || undefined,
        labelText: labelText.trim() || undefined,
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{initialPerson ? 'Edit person' : 'Add person'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Tags (optional)</label>
            <div className="tag-picker">
              <div className="tag-picker-control" onClick={() => setIsTagPickerOpen(true)}>
                {selectedTags.map((tag) => (
                  <span key={tag} className={`tag-picker-chip ${getTagColorClassName(tag)}`}>
                    {tag}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeTag(tag);
                      }}
                      aria-label={`Remove ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  className="tag-picker-input"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onFocus={() => setIsTagPickerOpen(true)}
                  onBlur={() => window.setTimeout(() => setIsTagPickerOpen(false), 120)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault();
                      addTag(tagInput);
                    }
                    if (event.key === 'Backspace' && !tagInput && selectedTags.length > 0) {
                      setSelectedTags((currentTags) => currentTags.slice(0, -1));
                    }
                    if (event.key === 'Escape') setIsTagPickerOpen(false);
                  }}
                  placeholder={selectedTags.length === 0 ? 'Search or create a tag' : 'Add a tag'}
                  aria-expanded={isTagPickerOpen}
                  aria-controls="person-tag-options"
                  aria-autocomplete="list"
                />
              </div>
              {isTagPickerOpen && (matchingTags.length > 0 || canCreateTag) && (
                <div id="person-tag-options" className="tag-picker-menu" role="listbox">
                  {matchingTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="tag-picker-option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addTag(tag)}
                      role="option"
                    >
                      <span className={`tag-picker-option-swatch ${getTagColorClassName(tag)}`} aria-hidden="true" />
                      {tag}
                    </button>
                  ))}
                  {canCreateTag && (
                    <button
                      type="button"
                      className="tag-picker-option tag-picker-create"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addTag(tagInput)}
                      role="option"
                    >
                      <span className={`tag-picker-option-swatch ${getTagColorClassName(tagInput.trim())}`} aria-hidden="true" />
                      Create “{tagInput.trim()}”
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Photo (optional)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleFileUpload}
              className="form-input form-file-input"
            />
            {(photoUrl || emoji) && (
              <div className="media-preview media-preview-person">
                {photoUrl ? (
                  <img src={photoUrl} alt="Preview" className="media-preview-image" />
                ) : emoji ? (
                  <div className="media-preview-fallback" aria-hidden="true">{emoji}</div>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setPhotoUrl('');
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
            <div className="emoji-picker">
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
            <label className="form-label">Photo URL (optional)</label>
            <input
              type="url"
              className="form-input"
              value={photoUrl}
              onChange={(e) => {
                setPhotoUrl(e.target.value);
                setEmoji('');
              }}
              placeholder="https://..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Custom label (optional)</label>
            <input
              type="text"
              className="form-input"
              value={labelText}
              onChange={(e) => setLabelText(e.target.value)}
              placeholder="e.g., Anniversary in 23 days"
            />
          </div>

          <div className="button-group">
            <button
              type="submit"
              className="btn-primary"
              disabled={!name.trim()}
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
