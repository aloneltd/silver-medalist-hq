import type { ReactNode } from 'react';

/** Renders a keyboard shortcut hint, e.g. <Kbd>⌘K</Kbd> or <Kbd keys={['j','k']} />. */
export function Kbd({ children, keys }: { children?: ReactNode; keys?: string[] }) {
  if (keys) {
    return (
      <span className="smhq-kbd-group">
        {keys.map((k, i) => (
          <span key={i} className="smhq-kbd">{k}</span>
        ))}
      </span>
    );
  }
  return <span className="smhq-kbd">{children}</span>;
}
