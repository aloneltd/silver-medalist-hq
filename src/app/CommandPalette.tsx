import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { m, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
import { db } from '../db';
import { useAppUI } from './store';
import { useDossierLink } from './useDossierLink';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** ⌘K / Ctrl+K palette — jump to a person or role, or run a shell-level action. Mounted once
 * in <AppShell>; open state lives in useAppUI() so any feature can trigger it too. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, toggleTheme, openPasteRole, setSelectedRoleId } = useAppUI();
  const { openCandidate } = useDossierLink();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const candidates = useLiveQuery(() => db.candidates.toArray(), [], []) ?? [];
  const roles = useLiveQuery(() => db.roles.toArray(), [], []) ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
      if (e.key === 'Escape' && paletteOpen) setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen]);

  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [paletteOpen]);

  const commands = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const actions: Command[] = [
      { id: 'go-today', label: 'Go to Today', run: () => navigate('/') },
      { id: 'go-bench', label: 'Go to Bench', run: () => navigate('/bench') },
      { id: 'go-map', label: 'Go to Map', run: () => navigate('/map') },
      { id: 'go-board', label: 'Go to Board', run: () => navigate('/board') },
      { id: 'go-roles', label: 'Go to Roles', run: () => navigate('/roles') },
      { id: 'go-import', label: 'Go to Import', run: () => navigate('/import') },
      { id: 'go-settings', label: 'Go to Settings', run: () => navigate('/settings') },
      { id: 'paste-role', label: 'Paste a role…', run: () => openPasteRole() },
      { id: 'toggle-theme', label: 'Toggle Graphite / Paper theme', run: toggleTheme },
    ];

    const roleCmds: Command[] = roles
      .filter(r => r.title.toLowerCase().includes(q))
      .slice(0, 6)
      .map(r => ({
        id: `role-${r.id}`,
        label: r.title,
        hint: 'Role',
        run: () => { setSelectedRoleId(r.id); navigate('/bench'); },
      }));

    const candidateCmds: Command[] = candidates
      .filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map(c => ({
        id: `cand-${c.id}`,
        label: c.name,
        hint: `${c.currentTitle} · ${c.currentEmployer}`,
        run: () => openCandidate(c.id),
      }));

    const actionCmds = q ? actions.filter(a => a.label.toLowerCase().includes(q)) : actions;
    return [...candidateCmds, ...roleCmds, ...actionCmds];
  }, [query, candidates, roles, navigate, openPasteRole, toggleTheme, setSelectedRoleId, openCandidate]);

  const runActive = () => {
    const cmd = commands[activeIndex];
    if (!cmd) return;
    cmd.run();
    setPaletteOpen(false);
  };

  if (!paletteOpen) return null;

  return createPortal(
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        <div className="smhq-palette-layer" role="presentation">
          <m.div className="smhq-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPaletteOpen(false)} />
          <m.div
            className="smhq-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <input
              ref={inputRef}
              className="smhq-palette-input"
              placeholder="Jump to a person, a role, or run an action…"
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(commands.length - 1, i + 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)); }
                if (e.key === 'Enter') { e.preventDefault(); runActive(); }
              }}
              aria-activedescendant={commands[activeIndex]?.id}
              role="combobox"
              aria-expanded
              aria-controls="smhq-palette-list"
            />
            <ul id="smhq-palette-list" className="smhq-palette-list" role="listbox">
              {commands.length === 0 && <li className="smhq-palette-empty">No matches.</li>}
              {commands.map((cmd, i) => (
                <li
                  key={cmd.id}
                  id={cmd.id}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`smhq-palette-item ${i === activeIndex ? 'smhq-palette-item-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => { cmd.run(); setPaletteOpen(false); }}
                >
                  <span>{cmd.label}</span>
                  {cmd.hint && <span className="smhq-palette-hint">{cmd.hint}</span>}
                </li>
              ))}
            </ul>
          </m.div>
        </div>
      </AnimatePresence>
    </LazyMotion>,
    document.body,
  );
}
