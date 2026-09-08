import { memo } from 'react';
import { avatarStyle, initials } from '../../features/bench/lib/tokens';

export interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

/**
 * Initials avatar with a colour derived from the person's name — same person, same hue, on
 * every screen and across reloads. Not decoration: it's how a recruiter re-finds a row after
 * a re-sort, and it gives the bench, Today and the board a shared visual identity per person.
 */
function AvatarInner({ name, size = 28, className = '' }: AvatarProps) {
  const style = avatarStyle(name);
  return (
    <span
      aria-hidden="true"
      className={`smhq-avatar ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.38)),
        ...style,
      }}
    >
      {initials(name)}
    </span>
  );
}

export const Avatar = memo(AvatarInner);
