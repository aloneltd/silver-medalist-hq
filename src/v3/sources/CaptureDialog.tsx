import { MousePointerClick } from 'lucide-react';
import { Btn, Dialog } from '../ui';
import { useToast } from '../../ui';
import { bookmarkletHref, bookmarkletSource } from './bookmarklet';

/**
 * "Get the button" — the Capture bookmarklet dialog (DESIGN-v3.md pillar 1). A draggable
 * bookmark, a copy-to-clipboard fallback for browsers that block bookmark-bar dragging from a
 * dialog, and three plain steps. Said as plainly as the recruiter seat wants: this is a
 * bookmark, not an extension, and it only ever sends what is already visible on the page.
 */
export function CaptureDialog({ onClose }: { onClose: () => void }) {
  const { push } = useToast();

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletSource());
      push('Copied. Paste it as the URL when you create a new bookmark by hand.', { tone: 'success' });
    } catch {
      push("Couldn't reach the clipboard — drag the button above instead.", { tone: 'danger' });
    }
  };

  return (
    <Dialog title="Get the Capture button" onClose={onClose} width={560} footer={<Btn onClick={onClose}>Done</Btn>}>
      <div className="p-col p-gap-5">
        <div className="p-story">
          This is a bookmark, not an extension — nothing to install, nothing running in the background. It only ever
          sends what's already visible on the page you click it on, and only when you click it.
        </div>

        <div className="src-bookmarklet-bar">
          <a
            className="src-bookmarklet-btn"
            href={bookmarkletHref()}
            draggable="true"
            aria-label="Bench Capture — drag this to your bookmarks bar"
            title="Drag me to your bookmarks bar"
          >
            <MousePointerClick size={16} /> Bench Capture
          </a>
          <div className="p-sec">← Drag this to your bookmarks bar</div>
        </div>

        <button type="button" className="src-link" onClick={copyCode}>
          Can't drag it from here? Copy the button's code instead
        </button>

        <BookmarksBarPicture />

        <div className="p-col p-gap-4">
          <Step n={1}>
            Make sure your browser's bookmarks bar is showing (in most browsers: <span className="p-strong">View → Show
            bookmarks bar</span>, or press <span className="p-mono">⌘⇧B</span> / <span className="p-mono">Ctrl+Shift+B</span>).
          </Step>
          <Step n={2}>
            Drag the <span className="p-strong">Bench Capture</span> button above onto that bar. If dragging is blocked
            here, use "Copy the button's code" and paste it as the URL when you add a new bookmark by hand.
          </Step>
          <Step n={3}>
            Open a LinkedIn profile, a job board listing or an ATS candidate page, then click the bookmark. A new tab
            opens here with what it read, ready for you to check and add.
          </Step>
        </div>
      </div>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="src-step">
      <span className="src-step-num" aria-hidden="true">{n}</span>
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

/** A small illustrative diagram of where the button lands — a browser bar with the button being dragged in. */
function BookmarksBarPicture() {
  return (
    <svg viewBox="0 0 480 96" width="100%" height="96" role="img" aria-label="The Bench Capture button being dragged onto a browser's bookmarks bar">
      <rect x="0" y="0" width="480" height="34" rx="8" fill="var(--p-bg)" stroke="var(--p-line)" />
      <circle cx="16" cy="17" r="4" fill="var(--p-line)" />
      <circle cx="30" cy="17" r="4" fill="var(--p-line)" />
      <circle cx="44" cy="17" r="4" fill="var(--p-line)" />
      <rect x="70" y="8" width="220" height="18" rx="9" fill="var(--p-surface)" stroke="var(--p-line)" />
      <rect x="0" y="40" width="480" height="30" fill="var(--p-surface)" stroke="var(--p-line)" />
      <rect x="14" y="47" width="86" height="16" rx="6" fill="var(--p-bg)" />
      <rect x="112" y="47" width="70" height="16" rx="6" fill="var(--p-bg)" />
      <rect x="352" y="46" width="112" height="18" rx="6" fill="var(--p-wash)" stroke="var(--p-accent)" strokeDasharray="3 3" />
      <text x="408" y="59" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--p-accent-ink)">Bench Capture</text>
      <path d="M240 80 L240 68" stroke="var(--p-faint)" strokeWidth="2" strokeDasharray="3 3" />
      <path d="M234 72 L240 66 L246 72" stroke="var(--p-faint)" strokeWidth="2" fill="none" />
      <text x="240" y="92" textAnchor="middle" fontSize="10" fill="var(--p-ink-2)">the bookmarks bar</text>
    </svg>
  );
}
