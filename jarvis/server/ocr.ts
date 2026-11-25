import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DATA_DIR } from './db.ts';
import type { Page } from './docs.ts';

/**
 * Скан PDF учун маҳаллий OCR (Tesseract, интернетсиз). Тиллар: ўзбек (лотин ва кирилл), рус, инглиз.
 * Матн қатлами бўлмаган бетларни расмга айлантириб ўқийди. Натижа сифати скан сифатига боғлиқ.
 */
const require = createRequire(import.meta.url);
export const OCR_LANGS = ['uzb', 'uzb_cyrl', 'rus', 'eng'];

function tessdataDir(): string {
  const dir = path.join(DATA_DIR, 'tessdata');
  fs.mkdirSync(dir, { recursive: true });
  for (const l of OCR_LANGS) {
    const dst = path.join(dir, `${l}.traineddata.gz`);
    if (fs.existsSync(dst)) continue;
    const pkg = path.dirname(require.resolve(`@tesseract.js-data/${l}/package.json`));
    fs.copyFileSync(path.join(pkg, '4.0.0_best_int', `${l}.traineddata.gz`), dst);
  }
  return dir;
}

export function ocrAvailable() {
  try { require.resolve('tesseract.js'); require.resolve('@napi-rs/canvas'); return true; } catch { return false; }
}

let worker: any = null;
async function getWorker() {
  if (worker) return worker;
  const { createWorker } = await import('tesseract.js');
  worker = await createWorker(OCR_LANGS.join('+'), 1, { langPath: tessdataDir(), gzip: true, cacheMethod: 'none', logger: () => {} });
  return worker;
}
export async function stopOcr() { if (worker) { await worker.terminate(); worker = null; } }

let queue: Promise<any> = Promise.resolve();
/** Берилган бетларни OCR қилади (кетма-кет, бир вақтда битта иш). */
export function ocrPdf(buf: Buffer, pages: number[], maxPages = 40): Promise<Page[]> {
  const job = queue.then(async () => {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 });
    const doc = await task.promise;
    const w = await getWorker();
    const out: Page[] = [];
    try {
      for (const n of pages.slice(0, maxPages)) {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: 2.5 });
        const { canvas, context } = doc.canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height));
        await page.render({ canvasContext: context, viewport: vp, canvas }).promise;
        const png = canvas.toBuffer('image/png');
        const r = await w.recognize(png);
        out.push({ page: n, text: String(r.data.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() });
        page.cleanup();
      }
    } finally { await task.destroy(); }
    return out;
  });
  queue = job.catch(() => {});
  return job;
}
