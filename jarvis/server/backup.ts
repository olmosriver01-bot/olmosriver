import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { getSetting, setSetting, tashkentParts, getDb, closeDb, openDb, migrate, DATA_DIR, UPLOADS_DIR, BACKUPS_DIR, DB_FILE, now, HttpError, log } from './db.ts';

/** Фонда ишлаётган ишлар (OCR, AI жараён, оқимли чат) — тиклаш пайтида эски ID’лар билан янги базага ёзмаслиги учун. */
const busyChecks: (() => string | null)[] = [];
export function registerBusyCheck(fn: () => string | null) { busyChecks.push(fn); }

/** Тўлиқ backup: база (онлайн snapshot) + юкланган файллар → zip. Шифрлаш калити (secret.key) алоҳида — қуйида изоҳ. */
export async function createBackup(label = 'manual') {
  const stamp = now().replace(/[:.]/g, '-');
  const tmpDb = path.join(BACKUPS_DIR, `.tmp-${stamp}.db`);
  await getDb().backup(tmpDb);
  const zip = new AdmZip();
  zip.addLocalFile(tmpDb, '', 'jarvis.db');
  if (fs.existsSync(UPLOADS_DIR)) zip.addLocalFolder(UPLOADS_DIR, 'uploads');
  zip.addFile('BACKUP.txt', Buffer.from(`JARVIS backup\nСана: ${now()}\nТури: ${label}\n\nЭслатма: API калитлари шифрланган ҳолда базада. Уларни очиш учун data/secret.key (ёки JARVIS_SECRET) керак — у бу архивга киритилмаган.\n`, 'utf8'));
  const name = `jarvis-${stamp}-${label}.zip`;
  zip.writeZip(path.join(BACKUPS_DIR, name));
  fs.rmSync(tmpDb, { force: true });
  log('backup_created', 'backup', '', name);
  pruneBackups();
  return { name, size: fs.statSync(path.join(BACKUPS_DIR, name)).size };
}
/**
 * Кунлик автоматик backup: Asia/Tashkent санаси бўйича кунига бир марта.
 * UTC санаси алмашса ҳам (Тошкентда 05:00), ўша Тошкент куни учун иккинчи нусха олинмайди.
 */
export async function maybeAutoBackup(at = new Date()): Promise<string | null> {
  const today = tashkentParts(at).date;
  if (getSetting<string | null>('backup.lastAutoDate', null) === today) return null;
  setSetting('backup.lastAutoDate', today); // аввал белгиланади — параллел tick такрорламайди
  try { return (await createBackup('auto')).name; }
  catch (e: any) { setSetting('backup.lastAutoDate', null); log('backup_error', 'backup', '', e.message); throw e; }
}

export function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs.readdirSync(BACKUPS_DIR).filter((f) => /^jarvis-.*\.zip$/.test(f)).sort().reverse()
    .map((f) => ({ name: f, size: fs.statSync(path.join(BACKUPS_DIR, f)).size }));
}
/** Автоматик ва «pre-*» backup’лар алоҳида гуруҳларда тозаланади; қўлда олинганлари ўчирилмайди. */
function pruneBackups() {
  const all = listBackups();
  for (const [re, keep] of [[/-auto\.zip$/, 14], [/-pre-restore\.zip$/, 10], [/-pre-import\.zip$/, 10]] as [RegExp, number][])
    for (const b of all.filter((x) => re.test(x.name)).slice(keep)) fs.rmSync(path.join(BACKUPS_DIR, b.name), { force: true });
}
export function backupPath(name: string) {
  if (!/^jarvis-[\w.-]+\.zip$/.test(name)) throw new HttpError(400, 'Backup номи нотўғри.');
  const p = path.join(BACKUPS_DIR, name);
  if (!fs.existsSync(p)) throw new HttpError(404, 'Backup топилмади.');
  return p;
}

/** Тиклаш: аввал жорий ҳолат "pre-restore" сифатида сақланади, кейин база ва файллар алмаштирилади. */
export async function restoreBackup(source: string | Buffer) {
  const busy = busyChecks.map((f) => f()).filter(Boolean);
  if (busy.length) throw new HttpError(409, `Ҳозир фонда иш бажарилмоқда (${busy.join(', ')}). У тугагач қайта уриниб кўринг.`, 'busy');
  const zip = new AdmZip(typeof source === 'string' ? backupPath(source) : source);
  const dbEntry = zip.getEntry('jarvis.db');
  if (!dbEntry) throw new HttpError(400, 'Архивда jarvis.db йўқ — бу JARVIS backup’и эмас.');
  const tmp = path.join(BACKUPS_DIR, `.restore-${Date.now()}.db`);
  fs.writeFileSync(tmp, dbEntry.getData());
  try {
    const t = new Database(tmp, { readonly: true });
    const ok = t.prepare("SELECT name FROM sqlite_master WHERE name IN ('notes','projects')").all().length === 2;
    const integrity = (t.prepare('PRAGMA integrity_check').get() as any)?.integrity_check;
    t.close();
    if (!ok) throw new Error('jadvallar topilmadi');
    if (integrity !== 'ok') throw new Error('integrity_check: ' + integrity);
    // Миграцияларни вақтинча нусхада синаймиз — хато бўлса жорий база алмаштирилмайди
    const m = new Database(tmp); migrate(m); m.close();
  } catch (e: any) { fs.rmSync(tmp, { force: true }); throw new HttpError(400, 'Backup базаси шикастланган: ' + e.message); }
  const pre = await createBackup('pre-restore');
  closeDb();
  for (const suf of ['', '-wal', '-shm']) fs.rmSync(DB_FILE + suf, { force: true });
  fs.renameSync(tmp, DB_FILE);
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  for (const e of zip.getEntries()) {
    if (e.isDirectory || !e.entryName.startsWith('uploads/')) continue;
    const name = path.basename(e.entryName);
    if (name.includes('..')) continue;
    fs.writeFileSync(path.join(UPLOADS_DIR, name), e.getData());
  }
  openDb();
  log('backup_restored', 'backup', '', `pre-restore: ${pre.name}`);
  return { ok: true, preRestore: pre.name };
}
export { DATA_DIR };
