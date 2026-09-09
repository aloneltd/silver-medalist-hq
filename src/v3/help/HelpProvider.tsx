import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { HELP, type HelpKey } from './helpContent';
import { Drawer, Pill, Btn } from '../ui';

interface HelpCtx {
  /** Which route's help doc the header link opens. Routes set this on mount. */
  helpKey: HelpKey;
  setHelpKey: (k: HelpKey) => void;
  openHelp: () => void;
  closeHelp: () => void;
  helpOpen: boolean;
  startTour: () => void;
  tourRunning: boolean;
  stopTour: () => void;
}

const Ctx = createContext<HelpCtx | null>(null);

export function HelpProvider({ children }: { children: ReactNode }) {
  const [helpKey, setHelpKey] = useState<HelpKey>('home');
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);

  const value = useMemo<HelpCtx>(() => ({
    helpKey,
    setHelpKey,
    openHelp: () => setHelpOpen(true),
    closeHelp: () => setHelpOpen(false),
    helpOpen,
    startTour: () => { setHelpOpen(false); setTourRunning(true); },
    tourRunning,
    stopTour: () => setTourRunning(false),
  }), [helpKey, helpOpen, tourRunning]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHelp(): HelpCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHelp must be used inside <HelpProvider>');
  return ctx;
}

/** Every route calls this once so the persistent header link knows what to open. */
export function useHelpKey(key: HelpKey) {
  const { setHelpKey } = useHelp();
  useEffect(() => { setHelpKey(key); }, [key, setHelpKey]);
}

export function HowThisWorksDrawer() {
  const { helpKey, helpOpen, closeHelp, startTour } = useHelp();
  const close = useCallback(() => closeHelp(), [closeHelp]);
  if (!helpOpen) return null;
  const doc = HELP[helpKey];
  return (
    <Drawer title={doc.title} onClose={close}>
      <div className="p-story">{doc.intro}</div>
      <div className="p-col p-gap-5 p-mt-6">
        {doc.steps.map(step => (
          <div key={step.label}>
            <Pill tone="wash">{step.label}</Pill>
            <div style={{ fontSize: 15, lineHeight: 1.55, marginTop: 10 }}>{step.body}</div>
          </div>
        ))}
      </div>
      {doc.look && (
        <div className="p-note p-mt-6">
          <span className="p-strong">On this screen: </span>{doc.look}
        </div>
      )}
      <div className="p-row p-gap-3 p-mt-6">
        <Btn tone="primary" size="sm" onClick={startTour}>Take the two-minute tour</Btn>
        <Btn size="sm" onClick={close}>Close</Btn>
      </div>
    </Drawer>
  );
}
