/**
 * The lazy readers, exercised for real.
 *
 * pdfjs, mammoth, SheetJS and JSZip are all loaded with `await import(...)` inside the reader
 * that needs them. That keeps them out of the first-paint bundle, but it also means a broken
 * import only shows up when somebody drops a file — so these tests actually run them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db/schema';
import { MIN_TEXT_LAYER_CHARS, readPdfText, readZip } from '../v3/import/readers';
import { buildPlanFromFiles } from '../v3/import';
import { forgetPlans } from '../v3/import/plan';
import { clearAiCache } from '../v3/import/ai';

/**
 * The smallest real PDF that has a text layer: one page, one Helvetica string, a correct
 * cross-reference table. Written by hand so there is no fixture file to go stale.
 */
function makePdf(lines: string[]): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td 14 TL\n${lines.map(l => `(${l.replace(/([()\\])/g, '\\$1')}) Tj T*`).join('\n')}\nET`;
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

function bytesToBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

beforeEach(async () => {
  await Promise.all([db.candidates.clear(), db.roles.clear(), db.imports.clear(), db.activities.clear()]);
  forgetPlans();
  clearAiCache();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in tests')));
});

afterEach(() => vi.unstubAllGlobals());

describe('readPdfText', () => {
  it('pulls the text layer out of a real PDF', async () => {
    const pdf = makePdf(['Kofi Mensah', 'Staff SRE at Monzo', 'kofi@example.com']);
    const read = await readPdfText(bytesToBuffer(pdf));
    expect(read.text).toContain('Kofi Mensah');
    expect(read.text).toContain('Staff SRE at Monzo');
  });

  it('leaves the caller\'s bytes intact, so the vision fallback still has something to send', async () => {
    // pdf.js detaches the buffer it is given. If it were handed the original, every scanned
    // PDF would blow up on the way to the vision reader instead of being imported.
    const bytes = bytesToBuffer(makePdf(['Kofi Mensah', 'Staff SRE at Monzo']));
    await readPdfText(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(() => new Uint8Array(bytes)).not.toThrow();
  });

  it('says a PDF with almost no text has no text layer, so the vision path takes over', async () => {
    const read = await readPdfText(bytesToBuffer(makePdf(['x'])));
    expect(read.hasTextLayer).toBe(false);
    expect(read.text.length).toBeLessThan(MIN_TEXT_LAYER_CHARS);
  });

  it('sends a scanned PDF to the vision reader rather than the text one', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('no network in tests'));
    vi.stubGlobal('fetch', fetchMock);
    // One short line means no usable text layer.
    const file = new File([bytesToBuffer(makePdf(['x']))], 'scan.pdf', { type: 'application/pdf' });
    const plan = await buildPlanFromFiles([file]);
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/parse-resume'))).toBe(true);
    expect(plan.notes.join(' ')).toMatch(/no text in them/);
  });

  it('reads a CV with a text layer through /api/map-columns, not the vision reader', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('no network in tests'));
    vi.stubGlobal('fetch', fetchMock);
    const pdf = makePdf([
      'Kofi Mensah',
      'Staff Site Reliability Engineer at Monzo',
      'London, United Kingdom',
      'kofi@example.com',
      'Go, Kubernetes, Terraform, PostgreSQL, Prometheus and a good deal more besides.',
    ]);
    const plan = await buildPlanFromFiles([new File([bytesToBuffer(pdf)], 'kofi.pdf', { type: 'application/pdf' })]);

    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.some(u => u.includes('/api/map-columns'))).toBe(true);
    expect(urls.some(u => u.includes('/api/parse-resume'))).toBe(false);

    // The AI was refused, so the no-AI reader had to carry it — and it still produced a person.
    expect(plan.kind).toBe('resume');
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0].draft.name).toBe('Kofi Mensah');
    expect(plan.people[0].draft.email).toBe('kofi@example.com');
    expect(plan.people[0].warnings?.join(' ')).toMatch(/could not read this CV with the AI/);
  });

  it('keeps three résumés to at most three model calls in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      throw new Error('no network in tests');
    }));

    const files = Array.from({ length: 9 }, (_, i) =>
      new File([bytesToBuffer(makePdf([`Person Number${i}`, 'Staff Engineer at Monzo', `person${i}@example.com`, 'Go, Kubernetes, Terraform and more besides.']))],
        `cv-${i}.pdf`, { type: 'application/pdf' }));
    await buildPlanFromFiles(files);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('readZip', () => {
  it('reads spreadsheets out of a zip that is not a Slack export', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('Connections.csv', 'First Name,Last Name,Email Address,Company,Position\nElena,Rossi,elena@example.com,Stripe,Staff Engineer');
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });

    const read = await readZip(bytes, 'linkedin-export.zip');
    expect(read.shape).toBe('table');
    expect(read.tables[0].cells[1][0]).toBe('Elena');
  });

  it('says plainly when a zip holds nothing it can read', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('readme.txt', 'hello');
    const read = await readZip(await zip.generateAsync({ type: 'arraybuffer' }), 'empty.zip');
    expect(read.shape).toBe('empty');
    expect(read.notes.join(' ')).toMatch(/found nothing we could read/);
  });

  it('reads a LinkedIn connections zip into people', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('Connections.csv', 'First Name,Last Name,Email Address,Company,Position\nElena,Rossi,elena@example.com,Stripe,Staff Engineer');
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });

    const plan = await buildPlanFromFiles([new File([bytes], 'linkedin-export.zip', { type: 'application/zip' })]);
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0].draft.name).toBe('Elena Rossi');
    expect(plan.people[0].draft.currentEmployer).toBe('Stripe');
    expect(plan.people[0].draft.currentTitle).toBe('Staff Engineer');
  });
});
