import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

/* ------------------------------------------------------------------ buttons */

type BtnTone = 'default' | 'primary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md' | 'lg';

function btnClass(tone: BtnTone = 'default', size: BtnSize = 'md', extra?: string) {
  return [
    'p-btn',
    tone === 'primary' ? 'p-btn-primary' : '',
    tone === 'ghost' ? 'p-btn-ghost' : '',
    tone === 'danger' ? 'p-btn-danger' : '',
    size === 'sm' ? 'p-btn-sm' : '',
    size === 'lg' ? 'p-btn-lg' : '',
    extra ?? '',
  ].filter(Boolean).join(' ');
}

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: BtnTone;
  size?: BtnSize;
}
export function Btn({ tone, size, className, type = 'button', ...rest }: BtnProps) {
  return <button type={type} className={btnClass(tone, size, className)} {...rest} />;
}

export function BtnLink(
  { to, tone, size, className, children, ...rest }:
  { to: string; tone?: BtnTone; size?: BtnSize; className?: string; children: ReactNode } & Record<string, unknown>,
) {
  return <Link to={to} className={btnClass(tone, size, className)} {...rest}>{children}</Link>;
}

/* -------------------------------------------------------------------- cards */

export function Card(
  { children, pad = true, lift = false, accent = false, className, ...rest }:
  { children: ReactNode; pad?: boolean; lift?: boolean; accent?: boolean; className?: string } & Record<string, unknown>,
) {
  const cls = ['p-card', pad ? 'p-card-pad' : '', lift ? 'p-card-lift' : '', accent ? 'p-card-accent' : '', className ?? '']
    .filter(Boolean).join(' ');
  return <div className={cls} {...rest}>{children}</div>;
}

/* ------------------------------------------------------------------- pills */

export function Pill(
  { children, tone, sm, className }:
  { children: ReactNode; tone?: 'wash' | 'amber'; sm?: boolean; className?: string },
) {
  const cls = ['p-pill', tone === 'wash' ? 'p-pill-wash' : '', tone === 'amber' ? 'p-pill-amber' : '', sm ? 'p-pill-sm' : '', className ?? '']
    .filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}

export function Dot({ tone }: { tone?: 'amber' | 'grey' | 'blue' }) {
  return <span className={`p-dot${tone ? ` p-dot-${tone}` : ''}`} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ avatars */

const TINTS = ['', 'p-avatar-amber', 'p-avatar-blue', 'p-avatar-violet', 'p-avatar-grey'] as const;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic tint from the name, so a person keeps the same colour on every screen. */
export function tintOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function Avatar({ name, size = 'lg' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = ['p-avatar', size === 'sm' ? 'p-avatar-sm' : '', size === 'md' ? 'p-avatar-md' : '', tintOf(name)]
    .filter(Boolean).join(' ');
  return <div className={cls} aria-hidden="true">{initialsOf(name)}</div>;
}

/* -------------------------------------------------------------- page header */

export function PageHeader(
  { title, lede, actions }: { title: string; lede?: ReactNode; actions?: ReactNode },
) {
  return (
    <div className="p-spread" style={{ alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
      <div style={{ maxWidth: 760 }}>
        <h1 className="p-serif p-h1">{title}</h1>
        {lede && <div className="p-lede p-mt-3">{lede}</div>}
      </div>
      {actions && <div className="p-row p-gap-3 p-wrap">{actions}</div>}
    </div>
  );
}

export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="p-spread p-mt-16" style={{ alignItems: 'baseline', marginBottom: 20, gap: 16 }}>
      <h2 className="p-serif p-h2">{title}</h2>
      {right && <div className="p-sec">{right}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="p-empty">
      <div className="p-empty-title">{title}</div>
      {children && <div className="p-lede" style={{ maxWidth: 520, margin: '0 auto' }}>{children}</div>}
      {action && <div className="p-mt-6">{action}</div>}
    </Card>
  );
}

export function Skel({ height = 20, width }: { height?: number; width?: number | string }) {
  return <div className="p-skel" style={{ height, width: width ?? '100%' }} aria-hidden="true" />;
}
