import { getDb, now, FOLDERS, KINDS, HttpError, log, getSetting, setSetting } from './db.ts';
import { INTERVIEW } from './seed.ts';
import { normalize } from '../shared/translit.ts';

export type Note = {
  id: number; folder: string; title: string; body: string; kind: string; status: string; decision_status: string | null;
  project_id: number | null; source: string; source_ref: string; system_key: string | null;
  vault_path: string | null; vault_hash: string | null; created_at: string; updated_at: string; deleted_at: string | null;
};

const s = (v: any, max = 200000) => (v == null ? '' : String(v)).normalize('NFC').slice(0, max);

export function getNote(id: number): Note {
  const n = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined;
  if (!n) throw new HttpError(404, 'Ёзув топилмади.');
  return n;
}
export function listNotes(q: { folder?: string; kind?: string; status?: string; projectId?: number | 'none'; search?: string; trash?: boolean; limit?: number }) {
  const where: string[] = [q.trash ? 'n.deleted_at IS NOT NULL' : 'n.deleted_at IS NULL'];
  const args: any[] = [];
  if (q.folder) { where.push('n.folder = ?'); args.push(q.folder); }
  if (q.kind) { where.push('n.kind = ?'); args.push(q.kind); }
  if (q.status) { where.push('n.status = ?'); args.push(q.status); }
  if (q.projectId === 'none') where.push('n.project_id IS NULL');
  else if (q.projectId) { where.push('n.project_id = ?'); args.push(q.projectId); }
  let rows = getDb().prepare(`SELECT n.*, p.name project_name FROM notes n LEFT JOIN projects p ON p.id = n.project_id
    WHERE ${where.join(' AND ')} ORDER BY n.updated_at DESC LIMIT ?`).all(...args, q.search ? 5000 : q.limit ?? 500) as any[];
  if (q.search) {
    const needle = normalize(q.search);
    rows = rows.filter((r) => normalize(r.title + ' ' + r.body).includes(needle)).slice(0, q.limit ?? 500);
  }
  return rows;
}

function validate(d: any, partial = false) {
  const out: any = {};
  if (!partial || d.folder !== undefined) {
    if (!FOLDERS.includes(d.folder)) throw new HttpError(400, 'Папка нотўғри.');
    out.folder = d.folder;
  }
  if (!partial || d.title !== undefined) {
    out.title = s(d.title, 300).trim();
    if (!out.title) throw new HttpError(400, 'Сарлавҳа киритинг.');
  }
  if (d.body !== undefined) out.body = s(d.body);
  if (d.kind !== undefined) {
    if (!KINDS.includes(d.kind)) throw new HttpError(400, 'Ёзув тури нотўғри.');
    out.kind = d.kind;
  }
  if (d.project_id !== undefined) out.project_id = d.project_id ? Number(d.project_id) : null;
  if (d.source !== undefined) out.source = s(d.source, 500);
  if (d.source_ref !== undefined) out.source_ref = s(d.source_ref, 2000);
  if (d.status !== undefined) {
    if (!['active', 'archived'].includes(d.status)) throw new HttpError(400, 'Ҳолат нотўғри.');
    out.status = d.status;
  }
  return out;
}

/**
 * Ёзув яратиш. Муҳим: AI ёки жараён натижасида келган қарор ҳар доим 'draft' бўлади.
 * 'accepted' ҳолатини фақат фойдаланувчи acceptDecision() орқали қўяди.
 */
export function createNote(d: any, origin: 'user' | 'ai' | 'system' = 'user'): Note {
  const v = validate(d);
  let kind = v.kind ?? 'note';
  if (origin === 'ai' && kind === 'fact') kind = 'assumption'; // AI фактни тасдиқлай олмайди
  const decision_status = kind === 'decision' ? 'draft' : null;
  const t = now();
  const r = getDb().prepare(`INSERT INTO notes(folder, title, body, kind, status, decision_status, project_id, source, source_ref, system_key, created_at, updated_at)
    VALUES (?,?,?,?, 'active', ?,?,?,?,?,?,?)`).run(v.folder, v.title, v.body ?? '', kind, decision_status, v.project_id ?? null, v.source ?? '', v.source_ref ?? '', d.system_key ?? null, t, t);
  log('note_created', 'note', Number(r.lastInsertRowid), `${v.folder}/${v.title} [${kind}] (${origin})`);
  return getNote(Number(r.lastInsertRowid));
}

export function saveVersion(n: Note, reason: string) {
  getDb().prepare('INSERT INTO note_versions(note_id, title, body, reason, saved_at) VALUES (?,?,?,?,?)').run(n.id, n.title, n.body, reason, now());
}

export function updateNote(id: number, d: any, reason = 'таҳрир'): Note {
  const n = getNote(id);
  const v = validate(d, true);
  if (v.kind && v.kind !== n.kind) {
    // decision → accepted фақат acceptDecision орқали; тур ўзгарса қарор ҳолати draft'га тушади
    (v as any).decision_status = v.kind === 'decision' ? 'draft' : null;
  }
  if ((v.body !== undefined && v.body !== n.body) || (v.title !== undefined && v.title !== n.title)) saveVersion(n, reason);
  const keys = Object.keys(v);
  if (!keys.length) return n;
  getDb().prepare(`UPDATE notes SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => (v as any)[k]), now(), id);
  log('note_updated', 'note', id, keys.join(','));
  return getNote(id);
}

export function setDecisionStatus(id: number, status: 'accepted' | 'rejected' | 'draft') {
  const n = getNote(id);
  if (n.kind !== 'decision') throw new HttpError(400, 'Бу ёзув қарор эмас.');
  const folder = status === 'accepted' ? '09_DECISIONS' : n.folder;
  getDb().prepare('UPDATE notes SET decision_status = ?, folder = ?, updated_at = ? WHERE id = ?').run(status, folder, now(), id);
  log('decision_' + status, 'note', id, n.title);
  return getNote(id);
}

export function trashNote(id: number) {
  const n = getNote(id);
  getDb().prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(now(), id);
  log('note_trashed', 'note', id, n.title);
}
export function restoreNote(id: number) {
  getDb().prepare('UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now(), id);
  log('note_restored', 'note', id);
  return getNote(id);
}
export function purgeNote(id: number) {
  const n = getNote(id);
  if (!n.deleted_at) throw new HttpError(400, 'Аввал саватга ўтказинг.');
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM note_versions WHERE note_id = ?').run(id);
    db.prepare('DELETE FROM vault_conflicts WHERE note_id = ?').run(id);
    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  })();
  log('note_purged', 'note', id, n.title);
}
export function versions(id: number) {
  return getDb().prepare('SELECT * FROM note_versions WHERE note_id = ? ORDER BY id DESC').all(id);
}
export function restoreVersion(noteId: number, versionId: number) {
  const v = getDb().prepare('SELECT * FROM note_versions WHERE id = ? AND note_id = ?').get(versionId, noteId) as any;
  if (!v) throw new HttpError(404, 'Версия топилмади.');
  return updateNote(noteId, { title: v.title, body: v.body }, `версия #${versionId} тикланди`);
}

// ===== Профиль ва интервью =====
type Interview = { answers: Record<string, string>; skipped: string[]; index: number; status: 'new' | 'paused' | 'done' };
export const getInterview = (): Interview => ({ answers: {}, skipped: [], index: 0, status: 'new', ...getSetting<Partial<Interview>>('interview', {}) });

export function interviewState() {
  const st = getInterview();
  const idx = INTERVIEW.findIndex((q, i) => i >= 0 && !(q.key in st.answers) && !st.skipped.includes(q.key));
  return { ...st, total: INTERVIEW.length, answered: Object.keys(st.answers).length, questions: INTERVIEW, current: idx >= 0 ? INTERVIEW[idx] : null };
}
export function answerInterview(key: string, answer: string | null) {
  const st = getInterview();
  if (!INTERVIEW.some((q) => q.key === key)) throw new HttpError(400, 'Савол топилмади.');
  if (answer == null || !String(answer).trim()) { if (!st.skipped.includes(key)) st.skipped.push(key); delete st.answers[key]; }
  else { st.answers[key] = s(answer, 5000).trim(); st.skipped = st.skipped.filter((k) => k !== key); }
  st.status = 'paused';
  setSetting('interview', st);
  const next = interviewState();
  if (!next.current) { st.status = 'done'; setSetting('interview', st); }
  return interviewState();
}
export function resetSkipped() { const st = getInterview(); st.skipped = []; setSetting('interview', st); return interviewState(); }

function upsertSystemNote(key: string, folder: string, title: string, body: string, kind = 'fact') {
  const db = getDb();
  const ex = db.prepare('SELECT * FROM notes WHERE system_key = ?').get(key) as Note | undefined;
  if (ex) return updateNote(ex.id, { title, body, folder, kind }, 'интервьюдан қайта яратилди');
  return createNote({ folder, title, body, kind, source: 'Танишув интервьюси', system_key: key }, 'system');
}

/** Интервью жавобларидан «Менинг иш профилим» ва «Jarvis operating manual»ни яратади (AI'сиз, жавоблар сўзма-сўз). */
export function buildProfile() {
  const st = getInterview();
  const a = st.answers;
  if (!Object.keys(a).length) throw new HttpError(400, 'Аввал интервью саволларига жавоб беринг.');
  const sections = new Map<string, string[]>();
  for (const q of INTERVIEW) if (a[q.key]) {
    if (!sections.has(q.section)) sections.set(q.section, []);
    sections.get(q.section)!.push(`**${q.q}**\n${a[q.key]}`);
  }
  const profile = [`> Манба: танишув интервьюси (${new Date().toISOString().slice(0, 10)}). Жавоблар фойдаланувчи томонидан киритилган — тасдиқланган факт.`, '',
    ...[...sections].map(([sec, items]) => `## ${sec}\n\n${items.join('\n\n')}`)].join('\n');
  const pick = (k: string) => a[k] ? a[k] : '_(киритилмаган)_';
  const manual = `> JARVIS шу йўриқнома асосида ишлайди. Уни истаган вақт таҳрирлашингиз мумкин.

## Мен ким билан ишлайман
${pick('who')}

## Лойиҳалар
${pick('business')}

## Аудитория
${pick('audience')}

## Услуб
- Ёзиш услубим: ${pick('style')}
- Ёқтирмайдиганларим (булардан қоч): ${pick('style_dislike')}
- Тил ва ёзув: ${pick('language')}

## Жавоб формати
${pick('format')}

## Менинг қоидаларим
${pick('jarvis_rules')}

## JARVIS ҳеч қачон қилмайди
${pick('jarvis_never')}
- Мен бермаган фактни ўйлаб топмайди; тахминни "Тахмин" деб белгилайди.
- AI таклифини мен қабул қилган қарор деб белгиламайди.
- Ташқи хабар юбориш, нашр қилиш ва пул сарфлашни менинг тасдиғимсиз бажармайди.

## Иш тартиби (PDF асосида)
1. Катта вазифа: МАҚСАД → КОНТЕКСТ → ВАРИАНТЛАР → ТАВСИЯ → КЕЙИНГИ ҚАДАМ.
2. Маълумот етишмаса — энг муҳим саволларни беради.
3. Нотўғри фикрни маъқулламайди, сабабини тушунтириб яхшироқ вариант беради.
4. Такрорий вазифа учун SOP ёки промпт таклиф қилади.

## Такрорий вазифалар ва автоматлаштириш
${pick('repeat')}

${pick('automate')}
`;
  const p = upsertSystemNote('identity.profile', '01_IDENTITY', 'Менинг иш профилим', profile);
  const m = upsertSystemNote('identity.manual', '01_IDENTITY', 'Jarvis operating manual', manual);
  return { profile: p, manual: m };
}

/** Чат учун шахсий контекст: профил, йўриқнома ва тасдиқланган фактлар. */
export function personalContext(projectId: number | null, maxChars = 8000) {
  const db = getDb();
  const sys = db.prepare("SELECT title, body FROM notes WHERE system_key IN ('identity.manual','identity.profile') AND deleted_at IS NULL AND status='active' ORDER BY system_key DESC").all() as any[];
  const facts = db.prepare(`SELECT title, body FROM notes WHERE kind='fact' AND status='active' AND deleted_at IS NULL AND system_key IS NULL
    AND (project_id IS NULL ${projectId ? 'OR project_id = ?' : ''}) ORDER BY updated_at DESC LIMIT 40`).all(...(projectId ? [projectId] : [])) as any[];
  const decisions = db.prepare(`SELECT title, body FROM notes WHERE kind='decision' AND decision_status='accepted' AND deleted_at IS NULL
    AND (project_id IS NULL ${projectId ? 'OR project_id = ?' : ''}) ORDER BY updated_at DESC LIMIT 15`).all(...(projectId ? [projectId] : [])) as any[];
  let out = '';
  for (const n of sys) out += `### ${n.title}\n${n.body}\n\n`;
  if (facts.length) out += '### Тасдиқланган фактлар\n' + facts.map((f) => `- ${f.title}: ${f.body.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n') + '\n\n';
  if (decisions.length) out += '### Қабул қилинган қарорлар\n' + decisions.map((f) => `- ${f.title}: ${f.body.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n') + '\n';
  return out.slice(0, maxChars);
}
