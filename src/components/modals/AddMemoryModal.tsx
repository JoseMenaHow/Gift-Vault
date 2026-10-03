import { useState } from 'react';
import type { Memory } from '../../types';

interface Props {
  personId: string;
  initialMemory?: Memory;
  onSave: (memory: Omit<Memory, 'id' | 'createdAt'> | Memory) => void;
  onClose: () => void;
}

export default function AddMemoryModal({ personId, initialMemory, onSave, onClose }: Props) {
  const [text, setText] = useState(initialMemory?.text || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    if (initialMemory) {
      // Editing existing memory (preserve id and createdAt)
      onSave({
        ...initialMemory,
        text: text.trim(),
      });
    } else {
      // Adding new memory
      onSave({
        personId,
        text: text.trim(),
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{initialMemory ? 'Edit memory' : 'New memory'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Memory</label>
            <textarea
              className="form-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              placeholder="What do you want to remember"
            />
          </div>

          <div className="button-group">
            <button
              type="submit"
              className="btn-primary"
              disabled={!text.trim()}
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
