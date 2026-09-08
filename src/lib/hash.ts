/**
 * Small, fast, deterministic string hash (FNV-1a-ish, two 32-bit lanes concatenated).
 * Same input -> same output, always. Shared by api/_lib/fastai.ts (its response LRU cache
 * key) and src/services/dataService.ts (the client-side "is this role+candidate set already
 * scored?" short-circuit) so both sides agree without two copies of the algorithm drifting
 * apart. Not cryptographic — collision resistance for cache-key purposes only.
 */
export function contentHash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 + c, 2654435761);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
