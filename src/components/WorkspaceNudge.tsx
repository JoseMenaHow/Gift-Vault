import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface Props {
  children: ReactNode;
  icon: ReactNode;
  label?: string;
  onClick: () => void;
  ariaLabel: string;
}

export default function WorkspaceNudge({ children, icon, label, onClick, ariaLabel }: Props) {
  return (
    <button type="button" className="workspace-nudge" onClick={onClick} aria-label={ariaLabel}>
      <span className="workspace-nudge-icon" aria-hidden="true">{icon}</span>
      <span className="workspace-nudge-copy">
        {label && <span className="workspace-nudge-label">{label}</span>}
        <span className="workspace-nudge-message">{children}</span>
      </span>
      <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
