import { useState, useRef, useEffect } from 'react';

interface Props {
  onEdit?: () => void;
  onDelete?: () => void;
  ariaLabel?: string;
}

export default function OverflowMenu({ onEdit, onDelete, ariaLabel = 'Actions' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    onEdit?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    onDelete?.();
  };

  return (
    <div className="overflow-menu-container">
      <button
        ref={buttonRef}
        className="overflow-menu-button"
        onClick={handleToggle}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        ⋯
      </button>
      {isOpen && (
        <div ref={menuRef} className="overflow-menu-dropdown">
          {onEdit && (
            <button className="overflow-menu-item" onClick={handleEdit}>
              Edit
            </button>
          )}
          {onDelete && (
            <button className="overflow-menu-item" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
