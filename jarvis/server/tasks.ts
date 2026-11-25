import { getDb, now, HttpError, log, tashkentParts, tashkentToDate, getSetting, setSetting } from './db.ts';
import { createNote, updateNote } from './memory.ts';
import { complete, resolveProvider } from './ai.ts';

const PRIORITIES = ['high', 'medium', 'low'];
const STATUSES = ['todo', 'doing', 'done'];

export function listTasks(q: { projectId?: number; status?: string } = {}) {
  const w = ['t.deleted_at IS NULL']; const a: any[] = [];
  if (q.projectId) { w.push('t.project_id = ?'); a.push(q.projectId); }
  if (q.status) { w.push('t.status = ?'); a.push(q.status); }
  return getDb().prepare(`SELECT t.*, p.name project_name, n.title sop_title FROM tasks t LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN notes n ON n.id = t.sop_note_id
    WHERE ${w.join(' AND ')} ORDER BY CASE t.status WHEN 'done' THEN 1 ELSE 0 END, COALESCE(t.due_date, '9999'), CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.id DESC`).all(...a);
}
function getTask(id: number) {
  const t = getDb().prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL').get(id) as any;
  if (!t) throw new HttpError(404, 'Вазифа топилмади.');
  return t;
}
function clean(d: any, partial: boolean) {
  const o: any = {};
  if (!partial || d.title !== undefined) { o.title = String(d.title ?? '').normalize('NFC').trim().slice(0, 300); if (!o.title) throw new HttpError(400, 'Вазифа номини киритинг.'); }
  if (d.description !== undefined) o.description = String(d.description ?? '').normalize('NFC').slice(0, 20000);
  if (d.project_id !== undefined) o.project_id = d.project_id ? Number(d.project_id) : null;
  if (d.due_date !== undefined) { if (d.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(d.due_date)) throw new HttpError(400, 'Муддат санаси нотўғри.'); o.due_date = d.due_date || null; }
  if (d.priority !== undefined) { if (!PRIORITIES.includes(d.priority)) throw new HttpError(400, 'Устуворлик нотўғри.'); o.priority = d.priority; }
  if (d.status !== undefined) { if (!STATUSES.includes(d.status)) throw new HttpError(400, 'Ҳолат нотўғри.'); o.status = d.status; }
  if (d.sop_note_id !== undefined) o.sop_note_id = d.sop_note_id ? Number(d.sop_note_id) : null;
  return o;
}
export function createTask(d: any, extra: { recurring_id?: number } = {}) {
  const o = { ...clean(d, false), ...extra }; const t = now();
  const k = Object.keys(o);
  const r = getDb().prepare(`INSERT INTO tasks(${k.join(',')}, created_at, updated_at) VALUES (${k.map(() => '?').join(',')},?,?)`).run(...k.map((x) => (o as any)[x]), t, t);
  log('task_created', 'task', Number(r.lastInsertRowid), o.title);
  return getTask(Number(r.lastInsertRowid));
}
export function updateTask(id: number, d: any) {
  const cur = getTask(id);
  const o = clean(d, true);
  if (o.status === 'done' && cur.status !== 'done') o.completed_at = now();
  if (o.status && o.status !== 'done') o.completed_at = null;
  const k = Object.keys(o);
  if (k.length) getDb().prepare(`UPDATE tasks SET ${k.map((x) => `${x}=?`).join(',')}, updated_at=? WHERE id=?`).run(...k.map((x) => o[x]), now(), id);
  if (o.status) log('task_status', 'task', id, o.status);
  return getTask(id);
}
export function trashTask(id: number) { getTask(id); getDb().prepare('UPDATE tasks SET deleted_at=? WHERE id=?').run(now(), id); log('task_trashed', 'task', id); }
export function restoreTask(id: number) { getDb().prepare('UPDATE tasks SET deleted_at=NULL WHERE id=?').run(id); }

/** Вазифа → қадамлар → SOP. AI уланган бўлса қадамларни AI ёзади (тахмин сифатида), бўлмаса шаблон яратилади. */
export async function taskToSop(id: number, useAi: boolean) {
  const t = getTask(id);
  let body: string; let source = `Вазифа #${id}`; let origin: 'user' | 'ai' = 'user';
  if (useAi) {
    if (!resolveProvider(null, true)) throw new HttpError(409, 'AI провайдер уланмаган — шаблон билан яратинг ёки калит киритинг.', 'no_provider');
    const r = await complete({ kind: 'sop', system: 'Сен иш жараёнларини SOP (стандарт иш йўриқномаси) сифатида ёзадиган ёрдамчисан. Ўзбек тилида, қисқа ва амалий ёз. Билмаган фактни ўйлаб топма — номаълум жойни [ ... ] қилиб қолдир.',
      messages: [{ role: 'user', content: `Вазифа: ${t.title}\nТавсиф: ${t.description || '—'}\n\nШу вазифа учун SOP ёз: Мақсад; Қачон ишлатилади; Керакли нарсалар; Рақамланган қадамлар; Текшириш рўйхати; Хатолар ва ечимлар.` }] });
    body = (r.mock ? '> ⚠️ MOCK натижа — ҳақиқий AI эмас.\n\n' : '> AI тайёрлаган лойиҳа — текшириб, тузатинг.\n\n') + r.text;
    source += ` (AI: ${r.provider}/${r.model})`; origin = 'ai';
  } else {
    const steps = String(t.description || '').split('\n').map((s) => s.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean);
    body = `**Мақсад:** ${t.title}\n\n**Қачон ишлатилади:** [ ... ]\n\n## Қадамлар\n${(steps.length ? steps : ['[биринчи қадам]', '[иккинчи қадам]', '[учинчи қадам]']).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n## Текшириш\n- [ ] Натижа текширилди\n- [ ] Хотирага сақланди\n`;
  }
  const n = createNote({ folder: '08_SOP', title: `SOP: ${t.title}`, body, kind: 'note', project_id: t.project_id, source }, origin);
  updateTask(id, { sop_note_id: n.id });
  return n;
}

// ===== Такрорий вазифалар ва режалаштирувчи (Asia/Tashkent) =====
export function listRecurring() {
  const rows = getDb().prepare(`SELECT r.*, p.name project_name FROM recurring r LEFT JOIN projects p ON p.id = r.project_id WHERE r.deleted_at IS NULL ORDER BY r.id`).all() as any[];
  for (const r of rows) {
    r.lastRuns = getDb().prepare('SELECT slot, status, detail, ran_at FROM job_runs WHERE recurring_id = ? ORDER BY slot DESC LIMIT 5').all(r.id);
    r.nextRun = r.enabled ? nextSlot(r, new Date()) : null;
  }
  return rows;
}
function cleanRec(d: any, partial: boolean) {
  const o: any = {};
  if (!partial || d.kind !== undefined) { if (!['task', 'audit'].includes(d.kind)) throw new HttpError(400, 'Тур нотўғри.'); o.kind = d.kind; }
  if (!partial || d.title !== undefined) { o.title = String(d.title ?? '').trim().slice(0, 300); if (!o.title) throw new HttpError(400, 'Номини киритинг.'); }
  if (d.description !== undefined) o.description = String(d.description ?? '').slice(0, 5000);
  if (d.project_id !== undefined) o.project_id = d.project_id ? Number(d.project_id) : null;
  if (d.priority !== undefined) { if (!PRIORITIES.includes(d.priority)) throw new HttpError(400, 'Устуворлик нотўғри.'); o.priority = d.priority; }
  if (d.sop_note_id !== undefined) o.sop_note_id = d.sop_note_id ? Number(d.sop_note_id) : null;
  if (!partial || d.freq !== undefined) { if (!['daily', 'weekly', 'monthly'].includes(d.freq)) throw new HttpError(400, 'Даврийлик нотўғри.'); o.freq = d.freq; }
  if (d.weekday !== undefined) { const w = Number(d.weekday); if (!(w >= 0 && w <= 6)) throw new HttpError(400, 'Ҳафта куни нотўғри.'); o.weekday = w; }
  if (d.monthday !== undefined) { const m = Number(d.monthday); if (!(m >= 1 && m <= 31)) throw new HttpError(400, 'Ой куни нотўғри.'); o.monthday = m; }
  if (d.time !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)) throw new HttpError(400, 'Вақт нотўғри (СС:ДД).'); o.time = d.time; }
  if (d.enabled !== undefined) o.enabled = d.enabled ? 1 : 0;
  return o;
}
export function createRecurring(d: any) {
  const o = cleanRec(d, false); const k = Object.keys(o);
  const r = getDb().prepare(`INSERT INTO recurring(${k.join(',')}, created_at) VALUES (${k.map(() => '?').join(',')}, ?)`).run(...k.map((x) => o[x]), now());
  log('recurring_created', 'recurring', Number(r.lastInsertRowid), o.title);
  return Number(r.lastInsertRowid);
}
export function updateRecurring(id: number, d: any) {
  const o = cleanRec(d, true); const k = Object.keys(o);
  if (k.length) getDb().prepare(`UPDATE recurring SET ${k.map((x) => `${x}=?`).join(',')} WHERE id=?`).run(...k.map((x) => o[x]), id);
}
export function deleteRecurring(id: number) { getDb().prepare('UPDATE recurring SET deleted_at=? WHERE id=?').run(now(), id); }

const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function matches(r: any, date: string) {
  const d = new Date(date + 'T00:00:00Z');
  if (r.freq === 'daily') return true;
  if (r.freq === 'weekly') return d.getUTCDay() === r.weekday;
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return d.getUTCDate() === Math.min(r.monthday, last);
}
/** from..to оралиғидаги барча слотлар (Тошкент вақтида "YYYY-MM-DDTHH:MM"). */
export function slotsBetween(r: any, from: Date, to: Date, cap = 400): string[] {
  const out: string[] = [];
  let date = tashkentParts(from).date;
  const end = tashkentParts(to).date;
  while (date <= end && out.length < cap) {
    if (matches(r, date)) {
      const slot = `${date}T${r.time}`;
      const at = tashkentToDate(slot);
      if (at > from && at <= to) out.push(slot);
    }
    date = addDays(date, 1);
  }
  return out;
}
export function nextSlot(r: any, from: Date) {
  const s = slotsBetween(r, from, new Date(from.getTime() + 40 * 86400000), 1);
  return s[0] ?? null;
}

const GRACE_MS = 60 * 60000; // 1 соат
/**
 * Режалаштирувчи қадами. Ҳар бир слот job_runs(UNIQUE recurring_id, slot) орқали фақат бир марта ишлов олади.
 * Сервер ўчиқ бўлган пайтдаги слотлар "missed" деб ёзилади (бажарилди деб белгиланмайди);
 * энг сўнгги ўтказиб юборилган слот учун иш "late" сифатида бир марта бажарилади.
 */
export function schedulerTick(at = new Date()) {
  const db = getDb();
  const results: any[] = [];
  setSetting('scheduler.lastTick', at.toISOString());
  for (const r of db.prepare('SELECT * FROM recurring WHERE enabled = 1 AND deleted_at IS NULL').all() as any[]) {
    const last = db.prepare('SELECT MAX(slot) s FROM job_runs WHERE recurring_id = ?').get(r.id) as any;
    const from = last?.s ? tashkentToDate(last.s) : new Date(Date.parse(r.created_at));
    const slots = slotsBetween(r, from, at);
    if (!slots.length) continue;
    const latest = slots[slots.length - 1];
    for (const s of slots.slice(0, -1)) {
      db.prepare('INSERT OR IGNORE INTO job_runs(recurring_id, slot, status, detail, ran_at) VALUES (?,?,?,?,?)')
        .run(r.id, s, 'missed', 'Сервер ўчиқ бўлган — бу вақтда ишга тушмади.', at.toISOString());
    }
    const late = at.getTime() - tashkentToDate(latest).getTime() > GRACE_MS;
    const claim = db.prepare('INSERT OR IGNORE INTO job_runs(recurring_id, slot, status, detail, ran_at) VALUES (?,?,?,?,?)')
      .run(r.id, latest, 'running', '', at.toISOString());
    if (claim.changes !== 1) continue; // бошқа жараён аллақачон олган
    let status = late ? 'late' : 'done', detail = '';
    try {
      if (r.kind === 'task') {
        const t = createTask({ title: r.title, description: r.description, project_id: r.project_id, priority: r.priority, due_date: latest.slice(0, 10), sop_note_id: r.sop_note_id }, { recurring_id: r.id });
        detail = `Вазифа #${t.id} яратилди${late ? ' (кечикиб — сервер ўчиқ эди)' : ''}`;
      } else {
        const n = weeklyAudit(at);
        detail = `Аудит ёзуви #${n.id}${late ? ' (кечикиб)' : ''}`;
      }
    } catch (e: any) { status = 'error'; detail = e.message; }
    db.prepare('UPDATE job_runs SET status = ?, detail = ? WHERE recurring_id = ? AND slot = ?').run(status, detail, r.id, latest);
    log('job_run', 'recurring', r.id, `${latest} ${status} ${detail}`);
    results.push({ recurringId: r.id, slot: latest, status, detail, missed: slots.length - 1 });
  }
  return results;
}

/** Ҳафталик аудит — базадаги ҳақиқий маълумотлардан, AI'сиз. */
export function weeklyAudit(at = new Date()) {
  const db = getDb();
  const since = new Date(at.getTime() - 7 * 86400000).toISOString();
  const today = tashkentParts(at).date;
  const done = db.prepare("SELECT t.title, p.name pn FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE t.status='done' AND t.completed_at >= ? AND t.deleted_at IS NULL").all(since) as any[];
  const autoRuns = db.prepare("SELECT r.title, j.slot, j.status FROM job_runs j JOIN recurring r ON r.id=j.recurring_id WHERE j.ran_at >= ? AND j.status IN ('done','late')").all(since) as any[];
  const wfDone = db.prepare("SELECT title FROM workflow_runs WHERE status='done' AND updated_at >= ? AND deleted_at IS NULL").all(since) as any[];
  const open = db.prepare("SELECT t.title, t.due_date, t.priority, p.name pn FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE t.status!='done' AND t.deleted_at IS NULL ORDER BY COALESCE(t.due_date,'9999'), CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END").all() as any[];
  const wfErr = db.prepare("SELECT title, steps FROM workflow_runs WHERE status='error' AND deleted_at IS NULL").all() as any[];
  const jobErr = db.prepare("SELECT r.title, j.slot, j.status, j.detail FROM job_runs j JOIN recurring r ON r.id=j.recurring_id WHERE j.ran_at >= ? AND j.status IN ('missed','error')").all(since) as any[];
  const aiErr = db.prepare("SELECT COUNT(*) n FROM usage WHERE ok=0 AND created_at >= ?").get(since) as any;
  const unreadable = db.prepare("SELECT name FROM documents WHERE status!='ready' AND deleted_at IS NULL").all() as any[];
  const li = (a: string[]) => (a.length ? a.map((x) => `- ${x}`).join('\n') : '- _(йўқ)_');
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const body = `> Автоматик ҳисобот (${today}, Asia/Tashkent). Маълумотлар JARVIS базасидан олинди, AI ишлатилмади.

## 1. Нима бажарилди (охирги 7 кун)
${li(done.map((t) => `${t.title}${t.pn ? ` — ${t.pn}` : ''}`))}

Якунланган иш жараёнлари:
${li(wfDone.map((w) => w.title))}

## 2. Нима автоматлаштирилди
${li(autoRuns.map((r) => `${r.title} — ${r.slot.replace('T', ' ')}${r.status === 'late' ? ' (кечикиб)' : ''}`))}

## 3. Нима қўлда қолди
Очиқ вазифалар: ${open.length} та, шундан муддати ўтган: ${overdue.length} та.
${li(overdue.map((t) => `⚠️ ${t.title} — муддат ${t.due_date}`))}

## 4. Қайси жараёнда хато бор
${li([
    ...wfErr.map((w) => { const st = (JSON.parse(w.steps) as any[]).find((s) => s.status === 'error'); return `Жараён «${w.title}» — «${st?.name}» қадамида: ${st?.error ?? ''}`; }),
    ...jobErr.map((j) => `${j.title} — ${j.slot.replace('T', ' ')}: ${j.status === 'missed' ? 'ўтказиб юборилган (сервер ўчиқ)' : j.detail}`),
    ...(aiErr.n ? [`AI сўровларида ${aiErr.n} та хато`] : []),
    ...unreadable.map((d) => `Ўқилмаган ҳужжат: ${d.name}`),
  ])}

## 5. Кейинги устувор ишлар
${li(open.slice(0, 7).map((t) => `${t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '⚪'} ${t.title}${t.due_date ? ` — ${t.due_date}` : ''}${t.pn ? ` (${t.pn})` : ''}`))}
`;
  return createNote({ folder: '06_KNOWLEDGE', title: `Ҳафталик аудит — ${today}`, body, kind: 'note', source: 'Автоматик ҳафталик аудит' }, 'system');
}

export function schedulerInfo() {
  return { timezone: 'Asia/Tashkent', lastTick: getSetting<string | null>('scheduler.lastTick', null),
    where: 'JARVIS сервер жараёни ичида (ҳар 30 сонияда текширади). Сервер ўчиқ бўлса, иш бажарилмайди ва «ўтказиб юборилган» деб белгиланади.' };
}
export { updateNote };
