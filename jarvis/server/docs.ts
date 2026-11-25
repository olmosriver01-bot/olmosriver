import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { getDb, now, UPLOADS_DIR, HttpError, log } from './db.ts';
import { normalize, tokens } from '../shared/translit.ts';

export type Page = { page: number | null; text: string };

export async function extractPdf(buf: Buffer): Promise<Page[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  const pages: Page[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const c = await p.getTextContent();
    let text = '';
    for (const it of c.items as any[]) { text += it.str ?? ''; text += it.hasEOL ? '\n' : ' '; }
    pages.push({ page: i, text: text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim() });
  }
  await (task.destroy?.() ?? doc.cleanup?.());
  return pages;
}

export function chunkText(text: string, size = 900): string[] {
  const out: string[] = [];
  const paras = text.split(/\n{2,}|(?<=[.!?])\s+(?=\p{Lu})/u).map((s) => s.trim()).filter(Boolean);
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (let p of paras) {
    while (p.length > size) { push(); out.push(p.slice(0, size)); p = p.slice(size); }
    if (cur.length + p.length + 1 > size) push();
    cur += (cur ? '\n' : '') + p;
  }
  push();
  return out;
}

function saveChunks(documentId: number, pages: Page[]) {
  const db = getDb();
  const ins = db.prepare('INSERT INTO chunks(document_id, page, idx, text) VALUES (?,?,?,?)');
  const fts = db.prepare('INSERT INTO chunks_fts(rowid, norm) VALUES (?,?)');
  let idx = 0;
  for (const pg of pages) for (const c of chunkText(pg.text)) {
    const r = ins.run(documentId, pg.page, idx++, c);
    fts.run(r.lastInsertRowid, normalize(c));
  }
}

function insertDoc(d: { projectId: number | null; name: string; type: string; file?: string; url?: string; pages: Page[]; error?: string }) {
  const db = getDb();
  const chars = d.pages.reduce((n, p) => n + p.text.length, 0);
  let status = 'ready', error = d.error ?? null;
  if (d.error) status = 'error';
  else if (chars < Math.max(20, d.pages.length * 15)) {
    status = 'unreadable';
    error = d.type === 'pdf'
      ? 'PDF ичида матн қатлами топилмади (скан ёки расм бўлиши мумкин). OCR қўлланмаган — ҳужжат ўқилмади.'
      : 'Ҳужжатда ўқиладиган матн топилмади.';
  }
  return db.transaction(() => {
    const r = db.prepare('INSERT INTO documents(project_id, name, type, file, url, status, pages, chars, error, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(d.projectId, d.name, d.type, d.file ?? null, d.url ?? null, status, d.pages.length, chars, error, now());
    const id = Number(r.lastInsertRowid);
    if (status === 'ready') saveChunks(id, d.pages);
    log('document_added', 'document', id, `${d.name} (${status})`);
    return getDoc(id);
  })();
}
export function getDoc(id: number) {
  return getDb().prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
}

export async function addFile(projectId: number | null, originalName: string, buf: Buffer) {
  const ext = path.extname(originalName).toLowerCase();
  const type = ext === '.pdf' ? 'pdf' : ext === '.md' || ext === '.markdown' ? 'md' : ext === '.txt' ? 'txt' : null;
  if (!type) throw new HttpError(400, 'Фақат PDF, TXT ва Markdown файллар қабул қилинади.');
  const file = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, file), buf);
  let pages: Page[] = [], error: string | undefined;
  try {
    if (type === 'pdf') pages = await extractPdf(buf);
    else {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buf).replace(/^﻿/, '');
      pages = [{ page: null, text }];
    }
  } catch (e: any) { error = 'Файлни ўқиб бўлмади: ' + (e?.message || e); }
  return insertDoc({ projectId, name: originalName, type, file, pages, error });
}

function isPrivate(ip: string) {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cde]/i.test(ip) || ip.startsWith('::ffff:') && isPrivate(ip.slice(7));
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
}
export function htmlToText(html: string) {
  return html.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h\d|li|tr|section|article|br)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}
export async function addUrl(projectId: number | null, rawUrl: string) {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new HttpError(400, 'URL нотўғри.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'Фақат http/https манзиллар.');
  if (!process.env.JARVIS_ALLOW_PRIVATE_URLS) {
    const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length) throw new HttpError(400, 'Сайт манзили топилмади.');
    if (addrs.some((a) => isPrivate(a.address))) throw new HttpError(400, 'Ички тармоқ манзилларига рухсат йўқ.');
  }
  let pages: Page[] = [], error: string | undefined, title = u.hostname + u.pathname;
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'JarvisPersonal/1.0' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    const raw = await res.text();
    if (raw.length > 5_000_000) throw new Error('саҳифа жуда катта');
    const m = raw.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    if (m) title = htmlToText(m[1]);
    pages = [{ page: null, text: ct.includes('html') || /^\s*</.test(raw) ? htmlToText(raw) : raw }];
  } catch (e: any) { error = 'Саҳифани юклаб бўлмади: ' + (e?.message || e); }
  return insertDoc({ projectId, name: title, type: 'url', url: u.toString(), pages, error });
}

export type Hit = { chunkId: number; documentId: number; docName: string; docType: string; url: string | null; page: number | null; text: string; score: number };

/** Манбалардан қидириш. projectId: number — фақат шу лойиҳа; null — фақат умумий манбалар. Лойиҳалар аралашмайди. */
export function search(q: string, projectId: number | null, documentIds?: number[], limit = 8): Hit[] {
  const toks = [...new Set(tokens(q).filter((t) => t.length >= 3))].slice(0, 24);
  if (!toks.length) return [];
  const match = toks.map((t) => `"${t.length > 5 ? t.slice(0, t.length - 2) : t}"*`).join(' OR ');
  const ids = (documentIds ?? []).filter(Number.isInteger);
  const sql = `SELECT c.id chunkId, c.document_id documentId, d.name docName, d.type docType, d.url url, c.page page, c.text text, bm25(chunks_fts) score
    FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN documents d ON d.id = c.document_id
    WHERE chunks_fts MATCH ? AND d.deleted_at IS NULL AND d.status = 'ready'
      AND ${projectId == null ? 'd.project_id IS NULL' : 'd.project_id = ?'}
      ${ids.length ? `AND d.id IN (${ids.join(',')})` : ''}
    ORDER BY score LIMIT ?`;
  const args: any[] = [match]; if (projectId != null) args.push(projectId); args.push(limit);
  return getDb().prepare(sql).all(...args) as Hit[];
}

/** Жараёнлар учун: ҳар бир ҳужжатнинг бошидан парчалар. */
export function leadChunks(projectId: number, perDoc = 6, maxChars = 24000): Hit[] {
  const rows = getDb().prepare(`SELECT c.id chunkId, c.document_id documentId, d.name docName, d.type docType, d.url url, c.page page, c.text text, 0 score, c.idx idx
    FROM chunks c JOIN documents d ON d.id = c.document_id
    WHERE d.project_id = ? AND d.deleted_at IS NULL AND d.status = 'ready' AND c.idx < ? ORDER BY d.id, c.idx`).all(projectId, perDoc) as any[];
  const out: Hit[] = []; let n = 0;
  for (const r of rows) { if (n + r.text.length > maxChars) break; n += r.text.length; out.push(r); }
  return out;
}

export function removeDocChunks(documentId: number) {
  const db = getDb();
  db.prepare('DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE document_id = ?)').run(documentId);
  db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
}
