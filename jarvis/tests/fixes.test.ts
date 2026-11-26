// Код-ревьюда топилган хатолар учун регрессия тестлари.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startApp } from './helpers.ts';

const app = await startApp({ mock: true });
test.after(() => app.close());
const { call } = app;
await app.login();
const { getDb, tashkentToDate } = await import('../server/db.ts');

test('backup тозалаш: автоматик backup’лар pre-restore/pre-import’ни ўчириб юбормайди', async () => {
  const { createBackup, listBackups } = await import('../server/backup.ts');
  await createBackup('pre-restore'); await createBackup('pre-import'); await createBackup('manual');
  for (let i = 0; i < 16; i++) await createBackup('auto');
  const names = listBackups().map((b) => b.name);
  assert.equal(names.filter((n) => n.endsWith('-auto.zip')).length, 14);
  assert.ok(names.some((n) => n.endsWith('-pre-restore.zip')));
  assert.ok(names.some((n) => n.endsWith('-pre-import.zip')));
  assert.ok(names.some((n) => n.endsWith('-manual.zip')));
});

test('фонда иш бажарилаётганда backup’дан тиклаш рад этилади', async () => {
  const { registerBusyCheck, listBackups } = await import('../server/backup.ts');
  let busy = true;
  registerBusyCheck(() => (busy ? 'синов иши' : null));
  const r = await call('POST', `/backups/${listBackups()[0].name}/restore`, { confirm: 'ТИКЛАШ' });
  assert.equal(r.status, 409); assert.match(r.data.error, /синов иши/);
  busy = false;
});

test('URL: ички манзиллар (IP ва DNS орқали) блокланади', async () => {
  const { safeFetch } = await import('../server/docs.ts');
  await assert.rejects(safeFetch('http://127.0.0.1:1/'), /Ички тармоқ/);
  await assert.rejects(safeFetch('http://localhost:1/'), /Ички тармоқ/);
  await assert.rejects(safeFetch('http://[::1]:1/'), /Ички тармоқ/);
  assert.equal((await call('POST', '/documents/url', { url: 'http://169.254.169.254/latest' })).status, 400);
});

test('vault: бир хил сарлавҳали икки ёзув алоҳида файлга ёзилади, зиддият йўқ', async () => {
  const vdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault2-'));
  await call('POST', '/vault/path', { path: vdir });
  const a = (await call('POST', '/notes', { folder: '06_KNOWLEDGE', title: 'Бир хил ном', body: 'A матн' })).data;
  const b = (await call('POST', '/notes', { folder: '06_KNOWLEDGE', title: 'Бир хил ном', body: 'B матн' })).data;
  const r = (await call('POST', '/vault/sync')).data;
  assert.equal(r.conflicts, 0, JSON.stringify(r));
  const f1 = fs.readFileSync(path.join(vdir, '06_KNOWLEDGE', 'Бир хил ном.md'), 'utf8');
  const f2 = fs.readFileSync(path.join(vdir, '06_KNOWLEDGE', 'Бир хил ном (2).md'), 'utf8');
  assert.ok([f1, f2].some((t) => t.includes('A матн')) && [f1, f2].some((t) => t.includes('B матн')));
  const r2 = (await call('POST', '/vault/sync')).data;
  assert.equal(r2.conflicts + r2.imported, 0);
  assert.equal((await call('GET', `/notes/${a.id}`)).data.body, 'A матн');
  assert.equal((await call('GET', `/notes/${b.id}`)).data.body, 'B матн');
  // қўлда таҳрирланган лойиҳа картаси (hash йўқ) устидан ёзилмайди
  const pfile = path.join(vdir, '03_PROJECTS', 'PROJECT — INNA FLOWERS.md');
  fs.writeFileSync(pfile, 'қўлда ёзилган');
  getDb().prepare('UPDATE projects SET vault_hash = NULL').run();
  const r3 = (await call('POST', '/vault/sync')).data;
  assert.equal(fs.readFileSync(pfile, 'utf8'), 'қўлда ёзилган');
  assert.ok(r3.errors.some((e: string) => e.includes('INNA FLOWERS')));
  await call('POST', '/vault/path', { path: null });
});

test('лойиҳа саватга ўтказилса ҳам унинг суҳбати ва жараёни ишлайди', async () => {
  const p = (await call('POST', '/projects', { name: 'Ўчириладиган' })).data;
  const c = (await call('POST', '/conversations', { project_id: p.id, source_mode: 'off' })).data;
  const w = (await call('POST', '/workflows', { type: 'content', input: 'ғоя', project_id: p.id })).data;
  await call('DELETE', `/projects/${p.id}`);
  assert.equal((await call('POST', `/conversations/${c.id}/messages`, { text: 'салом' })).status, 200);
  assert.equal((await call('POST', `/workflows/${w.id}/run`)).data.status, 'done');
});

test('такрорий иш қайта ёқилганда ўчиқ пайтдаги слотлар бажарилмайди', async () => {
  const { schedulerTick } = await import('../server/tasks.ts');
  const id = (await call('POST', '/recurring', { kind: 'task', title: 'Қайта ёқиш синови', freq: 'daily', time: '09:00' })).data.id;
  getDb().prepare('UPDATE recurring SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', id);
  schedulerTick(tashkentToDate('2026-01-01T10:00'));
  await call('PUT', `/recurring/${id}`, { enabled: false });
  await call('PUT', `/recurring/${id}`, { enabled: true }); // ҳозир (2026-11) қайта ёқилди
  getDb().prepare('UPDATE recurring SET enabled_at = ? WHERE id = ?').run(tashkentToDate('2026-03-01T12:00').toISOString(), id);
  schedulerTick(tashkentToDate('2026-03-01T13:00'));
  const runs = getDb().prepare('SELECT slot, status FROM job_runs WHERE recurring_id = ?').all(id) as any[];
  assert.deepEqual(runs.map((r) => r.status), ['done']);
  schedulerTick(tashkentToDate('2026-03-02T09:05'));
  assert.equal((getDb().prepare("SELECT COUNT(*) n FROM job_runs WHERE recurring_id = ? AND status='done'").get(id) as any).n, 2);
});

test('саватдаги профилни қайта яратиш уни тиклайди', async () => {
  await call('POST', '/interview/answer', { key: 'who', answer: 'Тадбиркор' });
  const b = (await call('POST', '/interview/build')).data;
  await call('DELETE', `/notes/${b.profile.id}`);
  const b2 = (await call('POST', '/interview/build')).data;
  assert.equal(b2.profile.id, b.profile.id);
  assert.equal((await call('GET', `/notes/${b.profile.id}`)).data.deleted_at, null);
});

test('нотўғри провайдер ва қарор ҳолати 400 қайтаради', async () => {
  assert.equal((await call('POST', '/conversations', { provider: 'foo' })).status, 400);
  const d = (await call('POST', '/notes', { folder: '09_DECISIONS', title: 'q', kind: 'decision' })).data;
  assert.equal((await call('POST', `/notes/${d.id}/decision`, { status: 'yes' })).status, 400);
  assert.equal((await call('GET', `/notes/${d.id}`)).data.decision_status, 'draft');
});

test('импорт: бошқа ёзувга тегишли jarvis_id мавжуд ёзувни бузмайди', async () => {
  const n = (await call('POST', '/notes', { folder: '06_KNOWLEDGE', title: 'Асл ёзув', body: 'асл' })).data;
  const fd = new FormData();
  fd.append('files', new Blob([`---\njarvis_id: ${n.id}\ntitle: Бошқа JARVIS ёзуви\nfolder: 06_KNOWLEDGE\n---\nбегона матн`]), 'x.md');
  const r = (await call('POST', '/import/markdown', fd)).data;
  assert.equal(r.created, 1); assert.equal(r.updated, 0);
  assert.equal((await call('GET', `/notes/${n.id}`)).data.body, 'асл');
});

test('автоматик backup Тошкент куни бўйича: UTC санаси алмашса ҳам бир кунга фақат битта нусха', async () => {
  const { maybeAutoBackup, listBackups } = await import('../server/backup.ts');
  const { setSetting } = await import('../server/db.ts');
  setSetting('backup.lastAutoDate', null);
  void listBackups;
  // 26-ноябрь 23:30 Тошкент (18:30 UTC) — 26-ноябр учун биринчи нусха
  assert.ok(await maybeAutoBackup(new Date('2026-11-26T18:30:00Z')));
  assert.equal(await maybeAutoBackup(new Date('2026-11-26T18:59:00Z')), null);
  // 27-ноябрь 00:30 Тошкент (UTC ҳали 26-ноябр) — янги Тошкент куни: битта нусха
  assert.ok(await maybeAutoBackup(new Date('2026-11-26T19:30:00Z')));
  // UTC санаси 27-ноябрга ўтди (Тошкентда 05:10), Тошкент куни ўша — иккинчи нусха олинмайди
  assert.equal(await maybeAutoBackup(new Date('2026-11-27T00:10:00Z')), null);
  // ҳар 30 сонияда tick — ҳеч бири нусха олмайди
  for (let i = 0; i < 40; i++) assert.equal(await maybeAutoBackup(new Date(Date.parse('2026-11-27T00:10:00Z') + i * 30000)), null);
  assert.equal(await maybeAutoBackup(new Date('2026-11-27T18:59:00Z')), null); // 27-ноябрь 23:59 Тошкент
  // натижада фақат иккита нусха олинди (26 ва 27-ноябр Тошкент кунлари учун)
});

test('қўлда қўйилган суҳбат номи биринчи хабар билан алмашмайди', async () => {
  const c = (await call('POST', '/conversations', { title: 'Синов суҳбати', source_mode: 'off' })).data;
  await call('POST', `/conversations/${c.id}/messages`, { text: 'Салом' });
  assert.equal((await call('GET', `/conversations/${c.id}`)).data.title, 'Синов суҳбати');
  const d = (await call('POST', '/conversations', { source_mode: 'off' })).data;
  await call('POST', `/conversations/${d.id}/messages`, { text: 'Бугунги режа' });
  assert.equal((await call('GET', `/conversations/${d.id}`)).data.title, 'Бугунги режа');
});
