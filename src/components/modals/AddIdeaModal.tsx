import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { GiftIdea } from '../../types';
import { getTagColorClassName } from '../../tagColors';

interface Props {
  personId: string;
  initialIdea?: GiftIdea;
  availableTags: string[];
  onSave: (idea: Omit<GiftIdea, 'id' | 'createdAt'> | GiftIdea) => void;
  onClose: () => void;
}

export default function AddIdeaModal({ personId, initialIdea, availableTags, onSave, onClose }: Props) {
  const [title, setTitle] = useState(initialIdea?.title || '');
  const [description, setDescription] = useState(initialIdea?.description || '');
  const [links, setLinks] = useState(initialIdea?.links?.length ? initialIdea.links : ['']);
  const [selectedTags, setSelectedTags] = useState(initialIdea?.occasionTags || []);
  const [tagInput, setTagInput] = useState('');
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState(initialIdea?.imageUrl || '');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
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
    if (!title.trim()) return;

    const savedLinks = links.map((link) => link.trim()).filter(Boolean);

    if (initialIdea) {
      // Editing existing idea (preserve id and createdAt)
      onSave({
        ...initialIdea,
        title: title.trim(),
        description: description.trim() || undefined,
        links: savedLinks.length > 0 ? savedLinks : undefined,
        occasionTags: selectedTags.length > 0 ? selectedTags : undefined,
        imageUrl: imageUrl.trim() || undefined,
      });
    } else {
      // Adding new idea
      onSave({
        personId,
        title: title.trim(),
        description: description.trim() || undefined,
        links: savedLinks.length > 0 ? savedLinks : undefined,
        occasionTags: selectedTags.length > 0 ? selectedTags : undefined,
        imageUrl: imageUrl.trim() || undefined,
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
              <label className="form-label">Links (optional)</label>
              <div className="gift-link-fields">
                {links.map((link, index) => (
                  <div key={index} className="gift-link-field">
                    <input
                      type="url"
                      className="form-input"
                      value={link}
                      onChange={(event) => {
                        setLinks((currentLinks) => currentLinks.map((currentLink, currentIndex) => (
                          currentIndex === index ? event.target.value : currentLink
                        )));
                      }}
                      placeholder="https://..."
                      aria-label={`Link ${index + 1}`}
                    />
                    <button
                      type="button"
                      className="gift-link-remove"
                      onClick={() => {
                        setLinks((currentLinks) => (
                          currentLinks.length === 1
                            ? ['']
                            : currentLinks.filter((_, currentIndex) => currentIndex !== index)
                        ));
                      }}
                      aria-label={`Remove link ${index + 1}`}
                      title="Remove link"
                    >
                      <X size={17} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="gift-link-add"
                onClick={() => setLinks((currentLinks) => [...currentLinks, ''])}
              >
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Add another link
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Occasion tags (optional)</label>
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
                    aria-controls="idea-tag-options"
                    aria-autocomplete="list"
                  />
                </div>
                {isTagPickerOpen && (matchingTags.length > 0 || canCreateTag) && (
                  <div id="idea-tag-options" className="tag-picker-menu" role="listbox">
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
              <label className="form-label">Image (optional)</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleFileUpload}
                className="form-input form-file-input"
              />
              {imageUrl && (
                <div className="media-preview media-preview-idea">
                  <img src={imageUrl} alt="Preview" className="media-preview-image" />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="media-remove"
                  >
                    Remove
                  </button>
                </div>
              )}
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
