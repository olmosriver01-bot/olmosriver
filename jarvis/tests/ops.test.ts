// Режалаштирувчи, backup/тиклаш, Obsidian vault синхронлаш, қайта ишга тушганда сақланиш.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startApp } from './helpers.ts';

const app = await startApp({ mock: true });
test.after(() => app.close());
const { call } = app;
await app.login();
const { schedulerTick, slotsBetween } = await import('../server/tasks.ts');
const { tashkentToDate, getDb, closeDb } = await import('../server/db.ts');

test('Тошкент вақти: слотлар UTC+5 бўйича ҳисобланади', () => {
  const r = { freq: 'daily', time: '09:00', weekday: 1, monthday: 1 };
  const s = slotsBetween(r, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T05:00:00Z'));
  assert.deepEqual(s, ['2026-01-01T09:00']); // 09:00 Toshkent = 04:00 UTC
  assert.equal(tashkentToDate('2026-01-01T09:00').toISOString(), '2026-01-01T04:00:00.000Z');
  const m = slotsBetween({ freq: 'monthly', time: '10:00', weekday: 0, monthday: 31 }, new Date('2026-02-01T00:00:00Z'), new Date('2026-03-01T00:00:00Z'));
  assert.deepEqual(m, ['2026-02-28T10:00']);
});

test('такрорий вазифа ҳар бир слот учун фақат бир марта бажарилади; ўчиқ пайт «missed»', async () => {
  const id = (await call('POST', '/recurring', { kind: 'task', title: 'Кунлик пост', freq: 'daily', time: '09:00', priority: 'high' })).data.id;
  getDb().prepare('UPDATE recurring SET created_at = ? WHERE id = ?').run('2026-03-01T00:00:00.000Z', id);
  const at = tashkentToDate('2026-03-03T09:10'); // 1-март 09:00 дан кейин 3 та слот: 1, 2, 3-март
  const r1 = schedulerTick(at).filter((x) => x.recurringId === id);
  assert.equal(r1.length, 1); assert.equal(r1[0].status, 'done'); assert.equal(r1[0].missed, 2);
  // такрорий tick (масалан, қайта ишга тушиш) — қайта бажарилмайди
  assert.equal(schedulerTick(at).filter((x) => x.recurringId === id).length, 0);
  assert.equal(schedulerTick(new Date(at.getTime() + 60000)).filter((x) => x.recurringId === id).length, 0);
  const runs = getDb().prepare('SELECT slot, status FROM job_runs WHERE recurring_id = ? ORDER BY slot').all(id) as any[];
  assert.deepEqual(runs.map((r) => r.status), ['missed', 'missed', 'done']);
  const tasks = (await call('GET', '/tasks')).data.filter((t: any) => t.recurring_id === id);
  assert.equal(tasks.length, 1); assert.equal(tasks[0].due_date, '2026-03-03'); assert.equal(tasks[0].status, 'todo');
  // кейинги куни 1 соатдан кўп кечикиб — «late», лекин яна бир марта
  const r2 = schedulerTick(tashkentToDate('2026-03-04T12:00')).filter((x) => x.recurringId === id);
  assert.equal(r2.length, 1); assert.equal(r2[0].status, 'late');
});

test('ҳафталик аудит 5 бўлим билан 06_KNOWLEDGE’га сақланади', async () => {
  const n = (await call('POST', '/audit/run')).data;
  assert.equal(n.folder, '06_KNOWLEDGE');
  for (const s of ['Нима бажарилди', 'Нима автоматлаштирилди', 'Нима қўлда қолди', 'Қайси жараёнда хато бор', 'Кейинги устувор ишлар']) assert.ok(n.body.includes(s), s);
});

test('backup яратилади ва ундан тиклаш ишлайди (олдинги ҳолат ҳам сақланади)', async () => {
  const p = (await call('POST', '/projects', { name: 'Backup’дан олдинги лойиҳа' })).data;
  const b = (await call('POST', '/backups')).data;
  assert.match(b.name, /^jarvis-.*-manual\.zip$/);
  await call('DELETE', `/projects/${p.id}`);
  await call('POST', '/projects', { name: 'Backup’дан кейинги лойиҳа' });
  assert.equal((await call('POST', `/backups/${b.name}/restore`, {})).status, 400); // тасдиқсиз
  const r = (await call('POST', `/backups/${b.name}/restore`, { confirm: 'ТИКЛАШ' })).data;
  assert.ok(r.preRestore);
  const names = (await call('GET', '/projects')).data.map((x: any) => x.name);
  assert.ok(names.includes('Backup’дан олдинги лойиҳа'));
  assert.ok(!names.includes('Backup’дан кейинги лойиҳа'));
  assert.ok((await call('GET', '/backups')).data.some((x: any) => x.name === r.preRestore));
});

test('Obsidian vault: ёзиш, ташқи таҳрирни олиш, зиддиятни аниқлаш, backup ва тиклаш', async () => {
  const vdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  assert.equal((await call('POST', '/vault/path', { path: 'relative/path' })).status, 400);
  assert.equal((await call('POST', '/vault/path', { path: vdir })).status, 200);
  const n = (await call('POST', '/notes', { folder: '06_KNOWLEDGE', title: 'Vault синов', body: 'Биринчи матн' })).data;
  const s1 = (await call('POST', '/vault/sync')).data;
  assert.ok(s1.written > 0, JSON.stringify(s1));
  const file = path.join(vdir, '06_KNOWLEDGE', 'Vault синов.md');
  assert.ok(fs.existsSync(file));
  for (const f of ['00_INBOX', '10_ARCHIVE']) assert.ok(fs.existsSync(path.join(vdir, f)));
  // Obsidian'да таҳрир → JARVIS'га келади
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Биринчи матн', 'Obsidian’да ўзгартирилди'));
  await new Promise((r) => setTimeout(r, 5));
  const s2 = (await call('POST', '/vault/sync')).data;
  assert.equal(s2.imported, 1, JSON.stringify(s2));
  assert.match((await call('GET', `/notes/${n.id}`)).data.body, /Obsidian’да ўзгартирилди/);
  // иккала томонда ўзгариш → зиддият, файл устидан ёзилмайди
  await new Promise((r) => setTimeout(r, 5));
  await call('PUT', `/notes/${n.id}`, { body: 'JARVIS’да ўзгартирилди' });
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Obsidian’да ўзгартирилди', 'Яна Obsidian’да'));
  const s3 = (await call('POST', '/vault/sync')).data;
  assert.equal(s3.conflicts, 1);
  assert.match(fs.readFileSync(file, 'utf8'), /Яна Obsidian’да/);
  const conflicts = (await call('GET', '/vault')).data.conflicts;
  assert.equal(conflicts.length, 1);
  await call('POST', `/vault/conflicts/${conflicts[0].id}`, { resolution: 'keep_app' });
  assert.match(fs.readFileSync(file, 'utf8'), /JARVIS’да ўзгартирилди/);
  const bdir = path.join(app.dir, 'backups', 'vault');
  const backed = fs.readdirSync(bdir, { recursive: true }).map(String).filter((f) => f.endsWith('.md'));
  assert.ok(backed.length >= 1, 'устидан ёзишдан олдин нусха олиниши керак');
  // Obsidian'да қўлда яратилган файл импорт қилинади, файлнинг ўзи ўзгармайди
  const own = path.join(vdir, '00_INBOX', 'Қўлда ёзилган.md');
  fs.writeFileSync(own, 'Ўзим ёздим');
  const s4 = (await call('POST', '/vault/sync')).data;
  assert.equal(s4.newFromVault, 1);
  assert.equal(fs.readFileSync(own, 'utf8'), 'Ўзим ёздим');
  // vault ташқарисидаги symlink ишлатилмайди
  fs.symlinkSync(os.tmpdir(), path.join(vdir, 'escape'));
  assert.equal((await call('POST', '/vault/sync')).status, 200);
});

test('қайта ишга туширгандан ва қайта киргандан кейин маълумотлар сақланган', async () => {
  const p = (await call('POST', '/projects', { name: 'Доимий лойиҳа ғўза' })).data;
  closeDb(); // сервер ўчди
  const { createApp } = await import('../server/app.ts');
  createApp(); // база қайта очилди
  await call('POST', '/auth/logout');
  assert.equal((await call('GET', '/projects')).status, 401);
  const bad = await call('POST', '/auth/login', { password: 'notogri' });
  assert.equal(bad.status, 401);
  assert.equal((await call('POST', '/auth/login', { password: 'parol12345' })).status, 200);
  const g = await call('GET', `/projects/${p.id}`);
  assert.equal(g.data.name, 'Доимий лойиҳа ғўза');
});
