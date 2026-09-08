/**
 * Design-token class fragments shared by bench/map/dossier/outreach.
 *
 * ⚠️ 2026-09-08 (polish pass) — these used to be Tailwind *arbitrary-value* fragments built
 * from template literals, e.g. `` `bg-[${token.panel}]` ``. Tailwind v4 scans raw source text
 * for candidates: it sees the literal characters `bg-[${token.panel}]`, which is not a valid
 * utility, so it emitted **nothing** for any of them. Result: every B2 surface (bench rows,
 * shortlist, map tooltip, dossier, composer) shipped with no background, no border colour, no
 * ink colour, no accent and no focus ring — the single biggest reason the app read as flat.
 *
 * They are now plain, hand-authored class names defined in `src/features/bench/bench.css`,
 * which reads the same tokens from `src/ui/tokens.css`. Same call sites, real pixels.
 */

export const token = {
  bg: 'var(--ground)',
  panel: 'var(--panel)',
  panel2: 'var(--panel-hover)',
  ink: 'var(--ink)',
  muted: 'var(--ink-muted)',
  accent: 'var(--accent)',
  amber: 'var(--amber)',
  green: 'var(--green)',
  danger: 'var(--danger)',
  border: 'var(--panel-border)',
  radius: 'var(--radius-md)',
  radiusSm: 'var(--radius-sm)',
  shadow: 'var(--shadow-md)',
} as const;

/** Real CSS classes (see bench.css) — never Tailwind arbitrary values built at runtime. */
export const cx = {
  surface: 'smhq-surface',
  surface2: 'smhq-surface-2',
  ink: 'smhq-ink',
  muted: 'smhq-muted',
  accentText: 'smhq-accent-text',
  accentBg: 'smhq-accent-bg',
  amberText: 'smhq-amber-text',
  amberBg: 'smhq-amber-bg',
  greenText: 'smhq-green-text',
  greenBg: 'smhq-green-bg',
  dangerText: 'smhq-danger-text',
  dangerBg: 'smhq-danger-bg',
  border: 'smhq-border',
  radius: 'smhq-radius',
  radiusSm: 'smhq-radius-sm',
  shadow: 'smhq-shadow',
  focusRing: 'smhq-focus-ring',
} as const;

export type StatusTone = 'active' | 'silent' | 'took_role' | 'do_not_reapproach' | 'opted_out';

/**
 * Status → label/colour mapping used by bench rows, the map and the dossier header chip.
 * The polish pass gives each status its own hue (BLUEPRINT-v2 / Fable check item 4):
 * active teal · silent grey · took-a-role blue · do-not amber · opted-out red.
 */
export const STATUS_META: Record<
  string,
  { label: string; short: string; dotClass: string; textClass: string; chipClass: string; greyed: boolean }
> = {
  active: {
    label: 'Active', short: 'Active',
    dotClass: 'smhq-dot-active', textClass: 'smhq-accent-text',
    chipClass: 'smhq-status-chip smhq-status-active', greyed: false,
  },
  silent: {
    label: 'Silent', short: 'Silent',
    dotClass: 'smhq-dot-silent', textClass: 'smhq-muted',
    chipClass: 'smhq-status-chip smhq-status-silent', greyed: true,
  },
  took_role: {
    label: 'Took a role', short: 'Took a role',
    dotClass: 'smhq-dot-took', textClass: 'smhq-info-text',
    chipClass: 'smhq-status-chip smhq-status-took', greyed: true,
  },
  do_not_reapproach: {
    label: 'Do not re-approach', short: 'Do not',
    dotClass: 'smhq-dot-donot', textClass: 'smhq-amber-text',
    chipClass: 'smhq-status-chip smhq-status-donot', greyed: true,
  },
  opted_out: {
    label: 'Opted out', short: 'Opted out',
    dotClass: 'smhq-dot-opted', textClass: 'smhq-danger-text',
    chipClass: 'smhq-status-chip smhq-status-opted', greyed: true,
  },
};

/** 8 stable avatar hues. Same person ⇒ same colour, forever (hashed off the name). */
const AVATAR_HUES = [188, 262, 12, 152, 32, 210, 320, 96];

export function avatarStyle(name: string): { background: string; color: string; borderColor: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = AVATAR_HUES[h % AVATAR_HUES.length];
  return {
    background: `hsla(${hue}, 58%, 48%, 0.18)`,
    color: `hsl(${hue}, 58%, 58%)`,
    borderColor: `hsla(${hue}, 45%, 45%, 0.45)`,
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
