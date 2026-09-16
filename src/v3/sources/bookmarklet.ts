/**
 * The Capture bookmarklet — a tiny script the user drags to their bookmarks bar (DESIGN-v3.md
 * pillar 1, "LinkedIn / any web page"). It is a bookmark, not an extension: nothing installs,
 * nothing runs until it is clicked, and it only ever reads what is already visible on the page
 * the user is standing on.
 *
 * On click it reads document.title, location.href, the biggest visible <h1>, a headline/
 * subtitle guess, and the page's visible text (trimmed to ~4000 chars), packs that into JSON,
 * and opens `<origin>/capture#<payload>` in a new tab. The payload lives in the URL FRAGMENT,
 * never the query string, so a page's text can never end up in a server access log — fragments
 * are never sent over the wire at all.
 */

/** The bookmarklet's runtime, as source text (kept small and IIFE-wrapped). */
const RUNTIME = `(function(){
try{
  var hs=Array.prototype.slice.call(document.querySelectorAll('h1'));
  var vis=hs.filter(function(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0&&e.offsetParent!==null;});
  vis.sort(function(a,b){var ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return (rb.width*rb.height)-(ra.width*ra.height);});
  var h1=vis[0];
  var sub=document.querySelector('h2, [class*="headline" i], [class*="subtitle" i], [class*="tagline" i]');
  var clean=function(s){return (s||'').replace(/\\s+/g,' ').trim();};
  var payload={
    name: clean(h1 && h1.innerText || document.title).slice(0,200),
    headline: clean(sub && sub.innerText).slice(0,200),
    title: document.title || '',
    url: location.href,
    text: clean(document.body && document.body.innerText).slice(0,4000),
    site: location.hostname
  };
  var json=JSON.stringify(payload);
  var b64=btoa(unescape(encodeURIComponent(json))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
  window.open(location.origin+'/capture#'+b64,'_blank');
}catch(err){
  alert('Capture could not read this page: '+(err && err.message ? err.message : err));
}
})();`;

/** `javascript:...` href for the draggable bookmark anchor. */
export function bookmarkletHref(): string {
  return `javascript:${encodeURIComponent(RUNTIME)}`;
}

/** The raw script text, for the copy-to-clipboard fallback (shown as "paste this as the URL"). */
export function bookmarkletSource(): string {
  return `javascript:${RUNTIME}`;
}

/** What the bookmarklet packs into the JSON payload before it is base64url-encoded. */
export interface CapturePayload {
  name?: string;
  headline?: string;
  title?: string;
  url?: string;
  text?: string;
  site?: string;
}

/**
 * Decodes the base64url payload from a `/capture#...` fragment. Returns null on anything
 * malformed rather than throwing — a bad or truncated fragment should read as "nothing arrived"
 * to the caller, not crash the route.
 */
export function decodeCaptureFragment(fragment: string): CapturePayload | null {
  const trimmed = fragment.trim();
  if (!trimmed) return null;
  try {
    const b64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as CapturePayload;
  } catch {
    return null;
  }
}
