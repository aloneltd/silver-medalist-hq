/** PLACEHOLDER — owned by builder B3 (Home + People). Everyone else imports it read-only. */
import type { Candidate, Match, Process, Role } from '../../types';

export interface PersonCardProps {
  candidate: Candidate;
  processes: Process[];
  roles: Role[];
  matches: Match[];
  /** The primary action's label and handler, e.g. "Write a warm note". */
  action?: { label: string; onClick: () => void };
  onOpen?: () => void;
  /** Set on the first card of a list so the tour can point at its parts. */
  tourAnchors?: boolean;
  muted?: boolean;
}

export function PersonCard({ candidate }: PersonCardProps) {
  return <div className="p-card p-person">{candidate.name}</div>;
}
