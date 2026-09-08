/**
 * Design-token class fragments shared by bench/map/dossier/outreach.
 *
 * B3 publishes the real values as CSS custom properties on `src/ui/tokens.css`
 * (--bg, --panel, --ink, --muted, --accent, --amber, --green, --danger, plus radii/shadows).
 * Every fragment below reads the variable with a fallback so these features render correctly
 * even before tokens.css lands, and pick up the real values automatically once it does.
 */

export const token = {
  bg: 'var(--bg,#0e1013)',
  panel: 'var(--panel,#161a1f)',
  panel2: 'var(--panel-2,#1c2127)',
  ink: 'var(--ink,#e8ecef)',
  muted: 'var(--muted,#8b95a1)',
  accent: 'var(--accent,#35e0c8)',
  amber: 'var(--amber,#f5b53f)',
  green: 'var(--green,#4ade80)',
  danger: 'var(--danger,#f0555d)',
  border: 'var(--border,#262c34)',
  radius: 'var(--radius,10px)',
  radiusSm: 'var(--radius-sm,6px)',
  shadow: 'var(--shadow,0 8px 24px rgba(0,0,0,.35))',
} as const;

/** Tailwind arbitrary-value class fragments — bracket syntax, no spaces after commas. */
export const cx = {
  surface: `bg-[${token.panel}] text-[${token.ink}] border border-[${token.border}]`,
  surface2: `bg-[${token.panel2}] text-[${token.ink}] border border-[${token.border}]`,
  ink: `text-[${token.ink}]`,
  muted: `text-[${token.muted}]`,
  accentText: `text-[${token.accent}]`,
  accentBg: `bg-[${token.accent}]`,
  amberText: `text-[${token.amber}]`,
  amberBg: `bg-[${token.amber}]`,
  greenText: `text-[${token.green}]`,
  greenBg: `bg-[${token.green}]`,
  dangerText: `text-[${token.danger}]`,
  dangerBg: `bg-[${token.danger}]`,
  border: `border-[${token.border}]`,
  radius: `rounded-[${token.radius}]`,
  radiusSm: `rounded-[${token.radiusSm}]`,
  shadow: `shadow-[${token.shadow}]`,
  focusRing: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[${token.accent}] focus-visible:ring-offset-2 focus-visible:ring-offset-[${token.bg}]`,
} as const;

/** Status → label/color mapping used by bench rows, the map, and the dossier header chip. */
export const STATUS_META: Record<
  string,
  { label: string; dotClass: string; textClass: string; greyed: boolean }
> = {
  active: { label: 'Active', dotClass: cx.accentBg, textClass: cx.accentText, greyed: false },
  silent: { label: 'Silent', dotClass: 'bg-[var(--muted,#8b95a1)]', textClass: cx.muted, greyed: true },
  took_role: { label: 'Took a role', dotClass: cx.amberBg, textClass: cx.amberText, greyed: true },
  do_not_reapproach: { label: 'Do not re-approach', dotClass: cx.dangerBg, textClass: cx.dangerText, greyed: true },
  opted_out: { label: 'Opted out', dotClass: cx.dangerBg, textClass: cx.dangerText, greyed: true },
};
