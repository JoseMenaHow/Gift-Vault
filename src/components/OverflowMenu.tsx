import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  onEdit?: () => void;
  onDelete?: () => void;
  ariaLabel?: string;
}

export default function OverflowMenu({ onEdit, onDelete, ariaLabel = 'Actions' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = 144;
    const menuHeight = (onEdit ? 44 : 0) + (onDelete ? 44 : 0) + 8;
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= menuHeight + viewportPadding
      ? rect.bottom + 6
      : Math.max(viewportPadding, rect.top - menuHeight - 6);
    const left = Math.min(
      window.innerWidth - menuWidth - viewportPadding,
      Math.max(viewportPadding, rect.right - menuWidth)
    );

    setMenuPosition({ top, left });
  }, [onDelete, onEdit]);

  useLayoutEffect(() => {
    if (isOpen) updateMenuPosition();
  }, [isOpen, updateMenuPosition]);

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

    const handleViewportChange = () => updateMenuPosition();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, updateMenuPosition]);

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
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="overflow-menu-dropdown"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          role="menu"
        >
          {onEdit && (
            <button className="overflow-menu-item" onClick={handleEdit} role="menuitem">
              Edit
            </button>
          )}
          {onDelete && (
            <button className="overflow-menu-item is-danger" onClick={handleDelete} role="menuitem">
              Delete
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
