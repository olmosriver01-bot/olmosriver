import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import { getDb, now, FOLDERS, KINDS, log } from './db.ts';
import { createNote, updateNote, getNote, type Note } from './memory.ts';
import { createProject, updateProject } from './projects.ts';

export const md5 = (s: string) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

export function slug(title: string) {
  return title.normalize('NFC').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'nomsiz';
}
const yamlStr = (v: any) => (v == null || v === '' ? '' : /^[\w.@+-]+$/u.test(String(v)) ? String(v) : JSON.stringify(String(v)));

export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const t = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: t };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([\w-]+):\s*(.*)$/);
    if (!mm) continue;
    let v = mm[2].trim();
    if (v.startsWith('"')) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } }
    else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    meta[mm[1]] = v;
  }
  return { meta, body: t.slice(m[0].length) };
}

export function noteToMarkdown(n: Note & { project_name?: string | null }) {
  const projectName = n.project_name ?? (n.project_id ? (getDb().prepare('SELECT name FROM projects WHERE id=?').get(n.project_id) as any)?.name : '');
  const meta: [string, any][] = [
    ['jarvis_id', n.id], ['title', n.title], ['folder', n.folder], ['kind', n.kind], ['status', n.status],
    ['decision_status', n.decision_status ?? ''], ['project', projectName ?? ''], ['source', n.source], ['source_ref', n.source_ref],
    ['created', n.created_at], ['updated', n.updated_at],
  ];
  return `---\n${meta.map(([k, v]) => `${k}: ${yamlStr(v)}`).join('\n')}\n---\n\n${n.body.trimEnd()}\n`;
}
export function notePath(n: Note) { return `${n.folder}/${slug(n.title)}.md`; }

const PROJECT_SECTIONS: [string, string][] = [['goal', 'Мақсад'], ['audience', 'Аудитория'], ['offer', 'Таклиф (offer)'], ['kpi', 'KPI'], ['materials', 'Материаллар ва манбалар'], ['next_steps', 'Кейинги қадамлар']];
export function projectToMarkdown(p: any) {
  const db = getDb();
  const docs = db.prepare('SELECT name, type, url, pages, status FROM documents WHERE project_id = ? AND deleted_at IS NULL').all(p.id) as any[];
  const decisions = db.prepare("SELECT title, decision_status FROM notes WHERE project_id = ? AND kind = 'decision' AND deleted_at IS NULL").all(p.id) as any[];
  const notes = db.prepare("SELECT title, folder FROM notes WHERE project_id = ? AND kind != 'decision' AND deleted_at IS NULL ORDER BY folder").all(p.id) as any[];
  const sec = (k: string, title: string) => `## ${title}\n\n${(p[k] || '').trim() || '_(киритилмаган)_'}\n`;
  return `---\njarvis_project_id: ${p.id}\ntitle: ${yamlStr('PROJECT — ' + p.name)}\nproject: ${yamlStr(p.name)}\nstatus: ${p.status}\nupdated: ${p.updated_at}\n---\n\n# PROJECT — ${p.name}\n\n` +
    PROJECT_SECTIONS.map(([k, t]) => sec(k, t)).join('\n') +
    `\n## Юкланган манбалар\n\n${docs.map((d) => `- ${d.name} (${d.type}${d.pages ? `, ${d.pages} бет` : ''}${d.status !== 'ready' ? `, ${d.status}` : ''})${d.url ? ` — ${d.url}` : ''}`).join('\n') || '_(йўқ)_'}\n` +
    `\n## Қарорлар\n\n${decisions.map((d) => `- [[${slug(d.title)}]] — ${d.decision_status === 'accepted' ? 'қабул қилинган' : d.decision_status === 'rejected' ? 'рад этилган' : 'лойиҳа (тасдиқланмаган)'}`).join('\n') || '_(йўқ)_'}\n` +
    `\n## Боғланган ёзувлар\n\n${notes.map((n) => `- [[${slug(n.title)}]] (${n.folder})`).join('\n') || '_(йўқ)_'}\n`;
}
export function parseProjectMarkdown(text: string) {
  const { meta, body } = parseFrontmatter(text);
  const name = meta.project || (body.match(/^#\s*PROJECT\s*[—-]\s*(.+)$/m)?.[1] ?? '').trim();
  const out: any = { name };
  for (const [k, title] of PROJECT_SECTIONS) {
    const re = new RegExp(`^##\\s*${title.replace(/[()]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm');
    const m = body.match(re);
    if (m) { const v = m[1].trim(); out[k] = v === '_(киритилмаган)_' ? '' : v; }
  }
  return { id: meta.jarvis_project_id ? Number(meta.jarvis_project_id) : null, data: out };
}

export function exportZip(opts: { projectId?: number | null } = {}) {
  const db = getDb();
  const zip = new AdmZip();
  for (const f of FOLDERS) zip.addFile(`JARVIS/${f}/`, Buffer.alloc(0));
  const where = opts.projectId ? 'AND n.project_id = ?' : '';
  const notes = db.prepare(`SELECT n.*, p.name project_name FROM notes n LEFT JOIN projects p ON p.id = n.project_id WHERE n.deleted_at IS NULL ${where}`).all(...(opts.projectId ? [opts.projectId] : [])) as any[];
  const used = new Set<string>();
  const uniq = (p: string) => { let x = p, i = 2; while (used.has(x.toLowerCase())) x = p.replace(/\.md$/, ` (${i++}).md`); used.add(x.toLowerCase()); return x; };
  for (const n of notes) zip.addFile('JARVIS/' + uniq(n.status === 'archived' ? `10_ARCHIVE/${slug(n.title)}.md` : notePath(n)), Buffer.from(noteToMarkdown(n), 'utf8'));
  const projects = db.prepare(`SELECT * FROM projects WHERE deleted_at IS NULL ${opts.projectId ? 'AND id = ?' : ''}`).all(...(opts.projectId ? [opts.projectId] : [])) as any[];
  for (const p of projects) zip.addFile('JARVIS/' + uniq(`03_PROJECTS/PROJECT — ${slug(p.name)}.md`), Buffer.from(projectToMarkdown(p), 'utf8'));
  zip.addFile('JARVIS/README.md', Buffer.from(`# JARVIS vault экспорти\n\nЭкспорт санаси: ${now()}\n\nБу папкани Obsidian'да vault сифатида очишингиз мумкин. Ҳар бир ёзувнинг юқорисидаги \`jarvis_id\` — импорт қилганда ёзувни таниб олиш учун.\n`, 'utf8'));
  log('markdown_export', 'vault', '', `${notes.length} ёзув, ${projects.length} лойиҳа`);
  return zip.toBuffer();
}

export type ImportResult = { created: number; updated: number; unchanged: number; projects: number; skipped: string[] };

/** Битта Markdown файлни импорт қилиш. Мавжуд ёзув ўзгарса — эски версия сақланади. */
export function importMarkdownFile(path: string, text: string, res: ImportResult) {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const file = parts[parts.length - 1];
  if (!file.toLowerCase().endsWith('.md') || file === 'README.md') return;
  const folderFromPath = parts.find((p) => (FOLDERS as readonly string[]).includes(p));
  if (/^PROJECT\s*[—-]/.test(file) || /jarvis_project_id:/.test(text.slice(0, 300))) {
    const { id, data } = parseProjectMarkdown(text);
    if (!data.name) { res.skipped.push(path + ' (лойиҳа номи йўқ)'); return; }
    const ex = id ? getDb().prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL').get(id) as any
      : getDb().prepare('SELECT id FROM projects WHERE name = ? AND deleted_at IS NULL').get(data.name) as any;
    if (ex) updateProject(ex.id, data); else createProject(data);
    res.projects++;
    return;
  }
  const { meta, body } = parseFrontmatter(text);
  const title = (meta.title || file.replace(/\.md$/i, '')).trim();
  const folder = (FOLDERS as readonly string[]).includes(meta.folder) ? meta.folder : folderFromPath ?? '00_INBOX';
  const kind = (KINDS as readonly string[]).includes(meta.kind) ? meta.kind : 'note';
  let projectId: number | null = null;
  if (meta.project) projectId = ((getDb().prepare('SELECT id FROM projects WHERE name = ? AND deleted_at IS NULL').get(meta.project) as any)?.id) ?? null;
  const data = { folder: folder === '10_ARCHIVE' && meta.folder ? meta.folder : folder, title, body: body.replace(/^\n+/, ''), kind, project_id: projectId,
    source: meta.source || `Markdown импорт: ${path}`, source_ref: meta.source_ref || '', status: meta.status === 'archived' || folder === '10_ARCHIVE' ? 'archived' : 'active' };
  if (!(FOLDERS as readonly string[]).includes(data.folder)) data.folder = '00_INBOX';
  const id = Number(meta.jarvis_id);
  const ex = id ? (getDb().prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL').get(id) as Note | undefined) : undefined;
  if (ex) {
    if (ex.body.trim() === data.body.trim() && ex.title === data.title && ex.kind === data.kind && ex.status === data.status) { res.unchanged++; return; }
    const { kind: k, ...rest } = data;
    updateNote(ex.id, ex.kind === 'decision' ? rest : { ...rest, kind: k }, 'Markdown импорт');
    res.updated++;
  } else {
    const n = createNote(data, 'user');
    if (data.status === 'archived') updateNote(n.id, { status: 'archived' });
    // Импортдаги "accepted" қарор ҳам автоматик қабул қилинмайди — фойдаланувчи қайта тасдиқлайди.
    res.created++;
  }
}

export function importBuffer(name: string, buf: Buffer): ImportResult {
  const res: ImportResult = { created: 0, updated: 0, unchanged: 0, projects: 0, skipped: [] };
  const db = getDb();
  db.transaction(() => {
    if (name.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(buf);
      const entries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.md'));
      // лойиҳалар олдин (ёзувлар уларга боғланиши учун)
      entries.sort((a, b) => Number(/PROJECT/.test(b.entryName)) - Number(/PROJECT/.test(a.entryName)));
      for (const e of entries) {
        if (e.entryName.includes('..')) { res.skipped.push(e.entryName); continue; }
        importMarkdownFile(e.entryName, e.getData().toString('utf8'), res);
      }
    } else importMarkdownFile(name, buf.toString('utf8'), res);
  })();
  log('markdown_import', 'vault', '', JSON.stringify(res));
  return res;
}

export { getNote };
