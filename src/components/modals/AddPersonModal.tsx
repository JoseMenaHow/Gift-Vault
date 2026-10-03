import { useState } from 'react';
import type { Person } from '../../types';

interface Props {
  initialPerson?: Person;
  onSave: (person: Omit<Person, 'id'> | Person) => void;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['❤️', '🎁', '⭐️', '😊', '📷'];

export default function AddPersonModal({ initialPerson, onSave, onClose }: Props) {
  const [name, setName] = useState(initialPerson?.name || '');
  const [relationship, setRelationship] = useState(initialPerson?.relationship || '');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !relationship.trim()) return;

    if (initialPerson) {
      // Editing existing person
      onSave({
        ...initialPerson,
        name: name.trim(),
        relationship: relationship.trim(),
        photoUrl: photoUrl.trim() || undefined,
        emoji: emoji || undefined,
        labelText: labelText.trim() || undefined,
      });
    } else {
      // Adding new person
      onSave({
        name: name.trim(),
        relationship: relationship.trim(),
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
            <label className="form-label">Relationship</label>
            <input
              type="text"
              className="form-input"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="e.g., Sister, Best friend"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Photo (optional)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleFileUpload}
              className="form-input"
            />
            {(photoUrl || emoji) && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {photoUrl ? (
                  <img src={photoUrl} alt="Preview" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : emoji ? (
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F7F8FC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>{emoji}</div>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setPhotoUrl('');
                    setEmoji('');
                  }}
                  style={{ fontSize: '14px', color: '#6B7280' }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Or choose an emoji placeholder</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {EMOJI_OPTIONS.map((emojiOption) => (
                <button
                  key={emojiOption}
                  type="button"
                  onClick={() => handleEmojiSelect(emojiOption)}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: emoji === emojiOption ? '#4F6EF7' : '#F7F8FC',
                    border: emoji === emojiOption ? '2px solid #4F6EF7' : '1px solid #E5E7EB',
                    fontSize: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
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
              disabled={!name.trim() || !relationship.trim()}
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
