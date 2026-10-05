import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface Props {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  ariaLabel: string;
}

export default function WorkspaceNudge({ children, icon, onClick, ariaLabel }: Props) {
  return (
    <button type="button" className="workspace-nudge" onClick={onClick} aria-label={ariaLabel}>
      <span className="workspace-nudge-icon" aria-hidden="true">{icon}</span>
      <span className="workspace-nudge-message">{children}</span>
      <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
