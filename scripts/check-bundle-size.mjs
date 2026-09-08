#!/usr/bin/env node
/**
 * Bundle guard — BLUEPRINT-v2.md: "Initial JS ≤ 190 kB gzipped."
 *
 * Walks `dist/.vite/manifest.json` (from `build: { manifest: true }` in vite.config.ts) starting
 * at the HTML entry, following only STATIC `imports` (never `dynamicImports` — those are the
 * React.lazy() route chunks, which is the whole point of the split). Sums the gzip size of every
 * JS file reachable that way: that set is exactly what a first-time visitor's browser has to
 * download before Today can render. Run via `npm run size` (also wired into `npm run build`).
 */
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const BUDGET_KB = 190;
const DIST = path.resolve(process.cwd(), 'dist');
const MANIFEST_PATH = path.join(DIST, '.vite', 'manifest.json');

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    console.error(`[size] Could not read ${MANIFEST_PATH} — run \`vite build\` first (with build.manifest: true).`);
    process.exit(1);
  }

  const entryKey = Object.keys(manifest).find(k => manifest[k].isEntry);
  if (!entryKey) {
    console.error('[size] No entry chunk found in the manifest.');
    process.exit(1);
  }

  const visited = new Set();
  const queue = [entryKey];
  const jsFiles = new Set();

  while (queue.length) {
    const key = queue.shift();
    if (visited.has(key)) continue;
    visited.add(key);
    const entry = manifest[key];
    if (!entry) continue;
    if (entry.file && entry.file.endsWith('.js')) jsFiles.add(entry.file);
    for (const imp of entry.imports ?? []) queue.push(imp); // static only — dynamicImports skipped on purpose
  }

  let totalBytes = 0;
  const rows = [];
  for (const file of jsFiles) {
    const buf = await readFile(path.join(DIST, file));
    const gz = gzipSync(buf, { level: 9 }).length;
    totalBytes += gz;
    rows.push({ file, kb: (gz / 1024).toFixed(2) });
  }

  rows.sort((a, b) => Number(b.kb) - Number(a.kb));
  console.log('[size] Initial JS (entry + static imports only):');
  for (const r of rows) console.log(`  ${r.kb.padStart(8)} kB gz  ${r.file}`);

  const totalKB = totalBytes / 1024;
  console.log(`[size] Total: ${totalKB.toFixed(2)} kB gzipped (budget ${BUDGET_KB} kB)`);

  if (totalKB > BUDGET_KB) {
    console.error(`[size] OVER BUDGET by ${(totalKB - BUDGET_KB).toFixed(2)} kB.`);
    process.exit(1);
  }
  console.log(`[size] OK — ${(BUDGET_KB - totalKB).toFixed(2)} kB of headroom.`);
}

main();
