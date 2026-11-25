import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, getDb, ROOT, UPLOADS_DIR, FOLDERS, HttpError, log, now, getSetting } from './db.ts';
import * as auth from './auth.ts';
import { seed } from './seed.ts';
import * as mem from './memory.ts';
import * as proj from './projects.ts';
import * as docs from './docs.ts';
import * as ai from './ai.ts';
import * as chat from './chat.ts';
import * as wf from './workflows.ts';
import * as tasks from './tasks.ts';
import * as md from './markdown.ts';
import * as vault from './vault.ts';
import * as backup from './backup.ts';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
type H = (req: Request, res: Response) => any;
const h = (fn: H) => async (req: Request, res: Response, next: NextFunction) => {
  try { const out = await fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); } catch (e) { next(e); }
};
const id = (req: Request, k = 'id') => { const n = Number(req.params[k]); if (!Number.isInteger(n)) throw new HttpError(400, 'ID нотўғри.'); return n; };
/** multer латин-1 сифатида ўқийди — ўзбекча/кирилл номларни UTF-8 га қайтарамиз. */
const fileName = (f: Express.Multer.File) => { const n = Buffer.from(f.originalname, 'latin1').toString('utf8'); return n.includes('�') ? f.originalname : n; };

/** PDF 13-бетдаги «Тезкор checklist» — ҳақиқий маълумотлардан ҳисобланади. */
function checklist() {
  const db = getDb();
  const one = (sql: string) => !!db.prepare(sql).get();
  const n = (sql: string) => (db.prepare(sql).get() as any).n as number;
  const items: [string, boolean, string][] = [
    ['JARVIS хотира тузилмаси (00_INBOX … 10_ARCHIVE)', true, 'memory'],
    ['Obsidian vault уланди ёки Markdown экспорт қилинди', !!getSetting('vault.path', null) || one("SELECT 1 FROM audit_log WHERE action='markdown_export'"), 'memory/io'],
    ['Иш профилингиз ёзилди', one("SELECT 1 FROM notes WHERE system_key='identity.profile' AND deleted_at IS NULL"), 'memory/profile'],
    ['Jarvis operating manual сақланди', one("SELECT 1 FROM notes WHERE system_key='identity.manual' AND deleted_at IS NULL"), 'memory/profile'],
    ['AI провайдер уланди (API калити)', !!ai.resolveProvider(null, true) && ai.resolveProvider(null, true) !== 'mock', 'settings'],
    ['1 та лойиҳа манбалар билан синалди', one("SELECT 1 FROM documents WHERE project_id IS NOT NULL AND status='ready' AND deleted_at IS NULL") && one("SELECT 1 FROM messages WHERE citations LIKE '%\"cited\":true%'"), 'sources'],
    ['Камида 3 та AI рол', n('SELECT COUNT(*) n FROM roles WHERE deleted_at IS NULL') >= 3, 'roles'],
    ['Биринчи иш жараёни якунланди', one("SELECT 1 FROM workflow_runs WHERE status='done' AND deleted_at IS NULL"), 'workflows'],
    ['Биринчи такрорий иш автоматлаштирилди', one("SELECT 1 FROM recurring WHERE kind='task' AND enabled=1 AND deleted_at IS NULL"), 'tasks'],
    ['5 та яхши промпт сақланди', n("SELECT COUNT(*) n FROM notes WHERE folder='07_PROMPTS' AND deleted_at IS NULL") >= 5, 'prompts'],
    ['Камида 3 та SOP ёзилди', n("SELECT COUNT(*) n FROM notes WHERE folder='08_SOP' AND deleted_at IS NULL") >= 3, 'sop'],
    ['Ҳафталик AI аудит белгиланди', one("SELECT 1 FROM recurring WHERE kind='audit' AND enabled=1 AND deleted_at IS NULL"), 'tasks'],
  ];
  return items.map(([label, done, link]) => ({ label, done, link }));
}

/** Сервер кутилмаганда тўхтаган бўлса, «running» ҳолатда қолиб кетган ишларни тиклаш (такрорий бажармасдан). */
export function recoverInterrupted() {
  const db = getDb();
  const runs = db.prepare("SELECT id, steps FROM workflow_runs WHERE status = 'running'").all() as any[];
  for (const r of runs) {
    const steps = JSON.parse(r.steps).map((s: any) => s.status === 'running' ? { ...s, status: 'error', error: 'Сервер қайта ишга тушди — қадам якунланмади. «Хатодан давом эттириш» тугмасини босинг.' } : s);
    db.prepare("UPDATE workflow_runs SET status = 'error', steps = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(steps), now(), r.id);
  }
  const jobs = db.prepare("UPDATE job_runs SET status = 'error', detail = 'Сервер иш давомида тўхтаган — натижани текширинг (такрорий бажарилмайди).' WHERE status = 'running'").run();
  if (runs.length || jobs.changes) log('recovered_after_restart', 'system', '', `workflows: ${runs.length}, jobs: ${jobs.changes}`);
}

export function createApp() {
  openDb();
  seed();
  recoverInterrupted();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    next();
  });
  app.use(express.json({ limit: '5mb' }));
  const api = express.Router();
  api.use(auth.csrf);

  // ---- auth (ҳимоясиз) ----
  api.get('/auth/status', h((req) => ({ setup: auth.isSetup(), authed: auth.isAuthed(req) })));
  api.post('/auth/setup', h((req, res) => {
    if (auth.isSetup()) throw new HttpError(400, 'Парол аллақачон ўрнатилган.');
    auth.setPassword(req.body.password);
    log('password_set', 'auth');
    auth.setCookie(req, res, auth.createSession());
  }));
  api.post('/auth/login', h((req, res) => { auth.setCookie(req, res, auth.login(req.body.password, req.ip ?? '')); }));
  api.post('/auth/logout', h((req, res) => { auth.logout(req); auth.setCookie(req, res, null); }));

  api.use(auth.requireAuth);
  api.post('/auth/password', h((req) => {
    auth.login(req.body.current, req.ip ?? '');
    auth.setPassword(req.body.password);
    getDb().prepare('DELETE FROM sessions').run();
    log('password_changed', 'auth');
    return { ok: true, relogin: true };
  }));

  // ---- dashboard ----
  api.get('/dashboard', h(() => {
    const db = getDb();
    const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
    const week = new Date(Date.now() + 5 * 3600000 + 7 * 86400000).toISOString().slice(0, 10);
    return {
      today,
      projects: proj.listProjects(),
      tasks: db.prepare(`SELECT t.*, p.name project_name FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE t.deleted_at IS NULL AND t.status != 'done' AND (t.due_date IS NULL OR t.due_date <= ?)
        ORDER BY COALESCE(t.due_date,'9999'), CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END LIMIT 8`).all(week),
      overdue: (db.prepare("SELECT COUNT(*) n FROM tasks WHERE deleted_at IS NULL AND status!='done' AND due_date < ?").get(today) as any).n,
      results: db.prepare(`SELECT n.id, n.title, n.folder, n.kind, n.updated_at, n.source, p.name project_name FROM notes n LEFT JOIN projects p ON p.id=n.project_id
        WHERE n.deleted_at IS NULL AND n.system_key IS NULL ORDER BY n.updated_at DESC LIMIT 6`).all(),
      runs: wf.listRuns(5),
      integrations: {
        ai: ai.providerStatus(), usage: ai.usageSummary(), limits: ai.aiSettings(),
        vault: { path: vault.vaultRoot(), lastSync: getSetting('vault.lastSync', null), conflicts: vault.listConflicts().length },
        scheduler: tasks.schedulerInfo(), backups: backup.listBackups().slice(0, 1),
      },
      profileReady: !!db.prepare("SELECT 1 FROM notes WHERE system_key='identity.profile' AND deleted_at IS NULL").get(),
      checklist: checklist(),
    };
  }));

  // ---- projects ----
  api.get('/projects', h((req) => proj.listProjects(req.query.all === '1')));
  api.post('/projects', h((req) => proj.createProject(req.body)));
  api.get('/projects/:id', h((req) => {
    const p = proj.getProject(id(req));
    return { ...p, documents: getDb().prepare('SELECT * FROM documents WHERE project_id = ? AND deleted_at IS NULL ORDER BY id DESC').all(p.id),
      notes: mem.listNotes({ projectId: p.id, limit: 100 }), tasks: tasks.listTasks({ projectId: p.id }) };
  }));
  api.put('/projects/:id', h((req) => proj.updateProject(id(req), req.body)));
  api.delete('/projects/:id', h((req) => proj.trashProject(id(req))));
  api.post('/projects/:id/restore', h((req) => proj.restoreProject(id(req))));
  api.get('/projects/:id/markdown', h((req, res) => {
    const p = proj.getProject(id(req));
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`PROJECT — ${p.name}.md`)}`);
    res.send(md.projectToMarkdown(p));
  }));

  // ---- notes / memory ----
  api.get('/notes', h((req) => mem.listNotes({
    folder: req.query.folder as string, kind: req.query.kind as string, status: req.query.status as string,
    projectId: req.query.project === 'none' ? 'none' : req.query.project ? Number(req.query.project) : undefined,
    search: req.query.q as string, trash: req.query.trash === '1',
  })));
  api.post('/notes', h((req) => mem.createNote(req.body, 'user')));
  api.get('/notes/:id', h((req) => ({ ...mem.getNote(id(req)), versions: mem.versions(id(req)) })));
  api.put('/notes/:id', h((req) => mem.updateNote(id(req), req.body)));
  api.post('/notes/:id/decision', h((req) => mem.setDecisionStatus(id(req), req.body.status)));
  api.delete('/notes/:id', h((req) => mem.trashNote(id(req))));
  api.post('/notes/:id/restore', h((req) => mem.restoreNote(id(req))));
  api.delete('/notes/:id/purge', h((req) => { if (req.body?.confirm !== 'ЎЧИРИШ') throw new HttpError(400, 'Тасдиқлаш учун «ЎЧИРИШ» деб ёзинг.'); mem.purgeNote(id(req)); }));
  api.post('/notes/:id/versions/:vid/restore', h((req) => mem.restoreVersion(id(req), id(req, 'vid'))));
  api.get('/notes/:id/markdown', h((req, res) => {
    const n = mem.getNote(id(req));
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(md.slug(n.title) + '.md')}`);
    res.send(md.noteToMarkdown(n));
  }));
  api.get('/meta', h(() => ({ folders: FOLDERS })));

  // ---- profile / interview ----
  api.get('/interview', h(() => mem.interviewState()));
  api.post('/interview/answer', h((req) => mem.answerInterview(req.body.key, req.body.answer)));
  api.post('/interview/reset-skipped', h(() => mem.resetSkipped()));
  api.post('/interview/build', h(() => mem.buildProfile()));

  // ---- documents ----
  api.get('/documents', h((req) => {
    const pid = req.query.project;
    const w = pid === 'none' ? 'project_id IS NULL' : pid ? 'project_id = ?' : '1=1';
    return getDb().prepare(`SELECT d.*, p.name project_name FROM documents d LEFT JOIN projects p ON p.id = d.project_id WHERE d.deleted_at IS NULL AND ${w} ORDER BY d.id DESC`)
      .all(...(pid && pid !== 'none' ? [Number(pid)] : []));
  }));
  api.post('/documents/upload', upload.array('files', 20), h(async (req) => {
    const pid = req.body.project_id ? Number(req.body.project_id) : null;
    if (pid) proj.getProject(pid);
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw new HttpError(400, 'Файл танланмаган.');
    const out: any[] = [];
    for (const f of files) out.push(await docs.addFile(pid, fileName(f), f.buffer));
    return out;
  }));
  api.post('/documents/url', h(async (req) => {
    const pid = req.body.project_id ? Number(req.body.project_id) : null;
    if (pid) proj.getProject(pid);
    return docs.addUrl(pid, String(req.body.url ?? ''));
  }));
  api.get('/documents/:id', h((req) => {
    const d = docs.getDoc(id(req));
    if (!d || d.deleted_at) throw new HttpError(404, 'Ҳужжат топилмади.');
    return { ...d, chunks: getDb().prepare('SELECT id, page, idx, text FROM chunks WHERE document_id = ? ORDER BY idx LIMIT 400').all(d.id) };
  }));
  api.get('/documents/:id/file', h((req, res) => {
    const d = docs.getDoc(id(req));
    if (!d?.file || d.deleted_at) throw new HttpError(404, 'Файл йўқ.');
    const p = path.join(UPLOADS_DIR, path.basename(d.file));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(d.name)}`);
    res.sendFile(p);
  }));
  api.put('/documents/:id', h((req) => {
    const d = docs.getDoc(id(req));
    if (!d) throw new HttpError(404, 'Ҳужжат топилмади.');
    if (req.body.project_id !== undefined) {
      const pid = req.body.project_id ? Number(req.body.project_id) : null;
      if (pid) proj.getProject(pid);
      getDb().prepare('UPDATE documents SET project_id = ? WHERE id = ?').run(pid, d.id);
      log('document_moved', 'document', d.id, `→ ${pid ?? 'умумий'}`);
    }
    return docs.getDoc(d.id);
  }));
  api.delete('/documents/:id', h((req) => {
    getDb().prepare('UPDATE documents SET deleted_at = ? WHERE id = ?').run(now(), id(req));
    log('document_trashed', 'document', id(req));
  }));
  api.post('/documents/:id/restore', h((req) => { getDb().prepare('UPDATE documents SET deleted_at = NULL WHERE id = ?').run(id(req)); }));
  api.get('/search', h((req) => {
    const pid = req.query.project === 'none' || !req.query.project ? null : Number(req.query.project);
    return docs.search(String(req.query.q ?? ''), pid, undefined, 15);
  }));

  // ---- roles ----
  api.get('/roles', h(() => getDb().prepare('SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY builtin DESC, id').all()));
  const roleBody = (b: any) => {
    const name = String(b.name ?? '').trim();
    if (!name) throw new HttpError(400, 'Рол номини киритинг.');
    return [name, String(b.purpose ?? ''), String(b.system_prompt ?? ''), String(b.output_format ?? '')];
  };
  api.post('/roles', h((req) => {
    const r = getDb().prepare('INSERT INTO roles(name, purpose, system_prompt, output_format, builtin, updated_at) VALUES (?,?,?,?,0,?)').run(...[...roleBody(req.body), now()]);
    log('role_created', 'role', Number(r.lastInsertRowid));
    return getDb().prepare('SELECT * FROM roles WHERE id = ?').get(r.lastInsertRowid);
  }));
  api.put('/roles/:id', h((req) => {
    getDb().prepare('UPDATE roles SET name=?, purpose=?, system_prompt=?, output_format=?, updated_at=? WHERE id=?').run(...[...roleBody(req.body), now(), id(req)]);
    log('role_updated', 'role', id(req));
    return getDb().prepare('SELECT * FROM roles WHERE id = ?').get(id(req));
  }));
  api.post('/roles/:id/reset', h(async (req) => {
    const r = getDb().prepare('SELECT * FROM roles WHERE id = ?').get(id(req)) as any;
    const { ROLES } = await import('./seed.ts');
    const def = ROLES.find((x) => x.key === r?.key);
    if (!def) throw new HttpError(400, 'Бу рол учун бошланғич ҳолат йўқ.');
    getDb().prepare('UPDATE roles SET name=?, purpose=?, system_prompt=?, output_format=?, updated_at=? WHERE id=?').run(def.name, def.purpose, def.system_prompt, def.output_format, now(), r.id);
    return getDb().prepare('SELECT * FROM roles WHERE id = ?').get(r.id);
  }));
  api.delete('/roles/:id', h((req) => { getDb().prepare('UPDATE roles SET deleted_at=? WHERE id=? AND builtin=0').run(now(), id(req)); }));

  // ---- chat ----
  api.get('/conversations', h(() => chat.listConversations()));
  api.post('/conversations', h((req) => chat.createConversation(req.body)));
  api.get('/conversations/:id', h((req) => chat.getConversation(id(req))));
  api.put('/conversations/:id', h((req) => chat.updateConversation(id(req), req.body)));
  api.delete('/conversations/:id', h((req) => chat.deleteConversation(id(req))));
  api.post('/conversations/:id/preview', h((req) => {
    const c = chat.buildContext(chat.getConversation(id(req)), String(req.body.text ?? ''));
    return { summary: c.summary, system: c.system };
  }));
  api.post('/conversations/:id/messages', h((req) => chat.sendMessage(id(req), req.body.text)));
  // Оқимли жавоб (SSE): event delta → матн бўлаклари, done → тўлиқ суҳбат, error → тушунарли хато
  api.post('/conversations/:id/stream', async (req, res) => {
    let cid: number;
    try { cid = id(req); chat.getConversation(cid); } catch (e: any) { return res.status(e.status ?? 400).json({ error: e.message }); }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    try {
      const r = await chat.sendMessage(cid, req.body.text, (t) => send('delta', { t }));
      send('done', r);
    } catch (e: any) {
      send('error', { error: e instanceof HttpError ? e.message : 'Ички хато юз берди.', code: e.code ?? 'error', conversation: (() => { try { return chat.getConversation(cid); } catch { return null; } })() });
    } finally { clearInterval(ping); res.end(); }
  });
  api.post('/messages/:id/save', h(async (req) => {
    const m = getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id(req)) as any;
    if (!m) throw new HttpError(404, 'Хабар топилмади.');
    const conv = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(m.conversation_id) as any;
    const meta = JSON.parse(m.meta);
    const cites = (JSON.parse(m.citations) as any[]).filter((c) => c.cited);
    const as = String(req.body.as);
    const title = String(req.body.title || m.content.split('\n').find((l: string) => l.trim())?.replace(/^[#*\s]+/, '').slice(0, 80) || 'Суҳбатдан');
    const srcNote = cites.length ? `\n\n## Манбалар\n${cites.map((c) => `- [S${c.n}] ${c.docName}${c.page ? `, ${c.page}-бет` : ''}${c.url ? ` — ${c.url}` : ''}`).join('\n')}` : '';
    const mockNote = meta.mock ? '> ⚠️ MOCK жавоб — ҳақиқий AI эмас.\n\n' : '';
    const projectId = req.body.project_id !== undefined ? (req.body.project_id || null) : conv.project_id;
    const common = { title, project_id: projectId, source: `Суҳбат #${conv.id}${meta.provider ? ` (${meta.provider}/${meta.model})` : ''}`, source_ref: cites.map((c) => `${c.docName}${c.page ? `#${c.page}` : ''}`).join('; ') };
    const origin = m.role === 'assistant' ? 'ai' : 'user';
    const map: Record<string, any> = {
      knowledge: { folder: '06_KNOWLEDGE', kind: origin === 'ai' ? 'assumption' : 'note' },
      prompt: { folder: '07_PROMPTS', kind: 'note' }, content: { folder: '04_CONTENT', kind: 'note' },
      decision: { folder: '09_DECISIONS', kind: 'decision' }, sop: { folder: '08_SOP', kind: 'note' },
    };
    if (as === 'task') return { task: tasks.createTask({ title, description: m.content.slice(0, 5000), project_id: projectId }) };
    if (!map[as]) throw new HttpError(400, 'Сақлаш тури нотўғри.');
    return { note: mem.createNote({ ...common, ...map[as], body: mockNote + m.content + srcNote }, origin as any) };
  }));

  // ---- workflows ----
  api.get('/workflows', h(() => ({ types: Object.fromEntries(Object.entries(wf.WORKFLOWS).map(([k, v]) => [k, { name: v.name, folder: v.folder, needsProject: v.needsProject, needsInput: v.needsInput, steps: v.steps.map((s) => ({ name: s.name, ai: s.ai })) }])), briefFields: wf.BRIEF_FIELDS, runs: wf.listRuns() })));
  api.post('/workflows', h((req) => wf.createRun(req.body)));
  api.get('/workflows/:id', h((req) => wf.getRun(id(req))));
  api.post('/workflows/:id/run', h((req) => wf.executeRun(id(req), req.body?.answers)));
  api.delete('/workflows/:id', h((req) => wf.deleteRun(id(req))));

  // ---- tasks & automation ----
  api.get('/tasks', h((req) => tasks.listTasks({ projectId: req.query.project ? Number(req.query.project) : undefined, status: req.query.status as string })));
  api.post('/tasks', h((req) => tasks.createTask(req.body)));
  api.put('/tasks/:id', h((req) => tasks.updateTask(id(req), req.body)));
  api.delete('/tasks/:id', h((req) => tasks.trashTask(id(req))));
  api.post('/tasks/:id/restore', h((req) => tasks.restoreTask(id(req))));
  api.post('/tasks/:id/sop', h((req) => tasks.taskToSop(id(req), !!req.body.ai)));
  api.get('/recurring', h(() => ({ items: tasks.listRecurring(), scheduler: tasks.schedulerInfo() })));
  api.post('/recurring', h((req) => ({ id: tasks.createRecurring(req.body) })));
  api.put('/recurring/:id', h((req) => tasks.updateRecurring(id(req), req.body)));
  api.delete('/recurring/:id', h((req) => tasks.deleteRecurring(id(req))));
  api.post('/audit/run', h(() => tasks.weeklyAudit()));

  // ---- markdown / vault ----
  api.get('/export/markdown', h((req, res) => {
    const pid = req.query.project ? Number(req.query.project) : null;
    const buf = md.exportZip({ projectId: pid });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="JARVIS-vault-${new Date().toISOString().slice(0, 10)}.zip"`);
    res.send(buf);
  }));
  api.post('/import/markdown', upload.array('files', 200), h(async (req) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw new HttpError(400, 'Файл танланмаган.');
    const pre = await backup.createBackup('pre-import');
    const total: md.ImportResult = { created: 0, updated: 0, unchanged: 0, projects: 0, skipped: [] };
    for (const f of files) {
      const r = md.importBuffer(fileName(f), f.buffer);
      total.created += r.created; total.updated += r.updated; total.unchanged += r.unchanged; total.projects += r.projects; total.skipped.push(...r.skipped);
    }
    return { ...total, backup: pre.name };
  }));
  api.get('/vault', h(() => ({ path: vault.vaultRoot(), lastSync: getSetting('vault.lastSync', null), conflicts: vault.listConflicts() })));
  api.post('/vault/path', h((req) => ({ path: vault.setVaultPath(req.body.path || null) })));
  api.post('/vault/sync', h(() => vault.syncVault()));
  api.post('/vault/conflicts/:id', h((req) => vault.resolveConflict(id(req), req.body.resolution)));

  // ---- settings, AI, backups, log ----
  api.get('/settings/ai', h(() => ({ ...ai.providerStatus(), settings: ai.aiSettings(), usage: ai.usageSummary() })));
  api.put('/settings/ai', h((req) => ai.saveAiSettings(req.body)));
  api.post('/settings/ai/key', h((req) => { ai.setKey(req.body.provider, req.body.key || null); log(req.body.key ? 'api_key_set' : 'api_key_removed', 'provider', req.body.provider); return ai.providerStatus(); }));
  api.post('/settings/ai/check', h((req) => ai.checkProvider(req.body.provider)));
  api.get('/usage', h(() => getDb().prepare('SELECT * FROM usage ORDER BY id DESC LIMIT 100').all()));
  api.get('/backups', h(() => backup.listBackups()));
  api.post('/backups', h(() => backup.createBackup('manual')));
  api.get('/backups/:name', h((req, res) => res.download(backup.backupPath(String(req.params.name)))));
  api.post('/backups/:name/restore', h((req) => { if (req.body?.confirm !== 'ТИКЛАШ') throw new HttpError(400, 'Тасдиқлаш учун «ТИКЛАШ» деб ёзинг.'); return backup.restoreBackup(String(req.params.name)); }));
  api.post('/backups-upload/restore', upload.single('file'), h((req) => {
    if (req.body?.confirm !== 'ТИКЛАШ') throw new HttpError(400, 'Тасдиқлаш учун «ТИКЛАШ» деб ёзинг.');
    if (!req.file) throw new HttpError(400, 'Файл танланмаган.');
    return backup.restoreBackup(req.file.buffer);
  }));
  api.get('/log', h(() => getDb().prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all()));
  api.get('/trash', h(() => {
    const db = getDb();
    return {
      notes: db.prepare('SELECT id, title, folder, deleted_at FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all(),
      projects: db.prepare('SELECT id, name, deleted_at FROM projects WHERE deleted_at IS NOT NULL').all(),
      documents: db.prepare('SELECT id, name, deleted_at FROM documents WHERE deleted_at IS NOT NULL').all(),
      tasks: db.prepare('SELECT id, title, deleted_at FROM tasks WHERE deleted_at IS NOT NULL').all(),
    };
  }));

  app.use('/api', api);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API йўли топилмади.')));

  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : err?.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
    const message = err instanceof HttpError ? err.message : err?.code === 'LIMIT_FILE_SIZE' ? 'Файл жуда катта (50 МБ гача).' : 'Ички хато юз берди.';
    if (status >= 500 && !(err instanceof HttpError)) console.error('[jarvis] error:', err?.message);
    res.status(status).json({ error: message, code: err?.code ?? 'error' });
  });
  return app;
}
