import { getDb, now, HttpError, log } from './db.ts';

const FIELDS = ['name', 'goal', 'audience', 'offer', 'kpi', 'materials', 'next_steps', 'status'] as const;

export function listProjects(includeArchived = false) {
  return getDb().prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id AND d.deleted_at IS NULL) docs,
      (SELECT COUNT(*) FROM notes n WHERE n.project_id = p.id AND n.deleted_at IS NULL) notes,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status != 'done') open_tasks
    FROM projects p WHERE p.deleted_at IS NULL ${includeArchived ? '' : "AND p.status = 'active'"} ORDER BY p.name`).all();
}
export function getProject(id: number) {
  const p = getDb().prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL').get(id) as any;
  if (!p) throw new HttpError(404, 'Лойиҳа топилмади.');
  return p;
}
function clean(d: any, partial: boolean) {
  const out: any = {};
  for (const f of FIELDS) if (d[f] !== undefined) out[f] = String(d[f] ?? '').normalize('NFC').slice(0, 20000);
  if (!partial || out.name !== undefined) {
    out.name = (out.name ?? '').trim();
    if (!out.name) throw new HttpError(400, 'Лойиҳа номини киритинг.');
  }
  if (out.status && !['active', 'archived'].includes(out.status)) throw new HttpError(400, 'Ҳолат нотўғри.');
  return out;
}
export function createProject(d: any) {
  const v = clean(d, false);
  const keys = Object.keys(v); const t = now();
  const r = getDb().prepare(`INSERT INTO projects(${keys.join(',')}, created_at, updated_at) VALUES (${keys.map(() => '?').join(',')}, ?, ?)`).run(...keys.map((k) => v[k]), t, t);
  log('project_created', 'project', Number(r.lastInsertRowid), v.name);
  return getProject(Number(r.lastInsertRowid));
}
export function updateProject(id: number, d: any) {
  getProject(id);
  const v = clean(d, true); const keys = Object.keys(v);
  if (keys.length) getDb().prepare(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(',')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => v[k]), now(), id);
  log('project_updated', 'project', id, keys.join(','));
  return getProject(id);
}
export function trashProject(id: number) {
  const p = getProject(id);
  getDb().prepare('UPDATE projects SET deleted_at = ? WHERE id = ?').run(now(), id);
  log('project_trashed', 'project', id, p.name);
}
export function restoreProject(id: number) {
  getDb().prepare('UPDATE projects SET deleted_at = NULL WHERE id = ?').run(id);
  log('project_restored', 'project', id);
}
export function projectCard(id: number | null) {
  if (!id) return '';
  const p = getProject(id);
  const line = (k: string, v: string) => (v?.trim() ? `- ${k}: ${v.trim()}` : `- ${k}: (киритилмаган)`);
  return [`Лойиҳа: ${p.name}`, line('Мақсад', p.goal), line('Аудитория', p.audience), line('Таклиф (offer)', p.offer), line('KPI', p.kpi), line('Материаллар', p.materials), line('Кейинги қадамлар', p.next_steps)].join('\n');
}
