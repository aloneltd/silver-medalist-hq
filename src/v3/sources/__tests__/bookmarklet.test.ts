import { describe, expect, it } from 'vitest';
import { bookmarkletHref, decodeCaptureFragment } from '../bookmarklet';

describe('bookmarklet', () => {
  it('produces a javascript: href', () => {
    const href = bookmarkletHref();
    expect(href.startsWith('javascript:')).toBe(true);
    expect(href).toContain('location.origin');
  });

  it('round-trips a UTF-8 payload the way the runtime script encodes it', () => {
    const payload = { name: 'Kofi Österberg', headline: 'Staff SRE at Ünïcørn', url: 'https://example.com/in/kofi', text: 'Some visible page text…' };
    const json = JSON.stringify(payload);
    // Same encode path as the runtime string in bookmarklet.ts.
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const decoded = decodeCaptureFragment(b64);
    expect(decoded).toEqual(payload);
  });

  it('returns null for garbage input instead of throwing', () => {
    expect(decodeCaptureFragment('not-base64-!!!')).toBeNull();
    expect(decodeCaptureFragment('')).toBeNull();
  });
});
