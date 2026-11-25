import fs from 'node:fs';
import path from 'node:path';
import { getDb, getSetting, setSetting, now, FOLDERS, BACKUPS_DIR, HttpError, log } from './db.ts';
import { noteToMarkdown, notePath, projectToMarkdown, md5, parseFrontmatter, importMarkdownFile, type ImportResult } from './markdown.ts';
import { getNote, updateNote, createNote, type Note } from './memory.ts';

/**
 * Obsidian vault билан тўғридан-тўғри ишлаш.
 * - Фақат фойдаланувчи танлаган битта папка (realpath) ичида ишлайди; symlink орқали чиқиб кетиш тақиқланган.
 * - Файл ташқарида ўзгарган бўлса, устидан ёзилмайди — зиддият (conflict) сифатида қайд этилади.
 * - Устидан ёзишдан олдин эски файл data/backups/vault/ ичига нусхаланади.
 */
export function vaultRoot(): string | null { return getSetting<string | null>('vault.path', null); }

export function setVaultPath(p: string | null) {
  if (!p) { setSetting('vault.path', null); log('vault_disconnected', 'vault'); return null; }
  if (!path.isAbsolute(p)) throw new HttpError(400, 'Тўлиқ (absolute) йўлни киритинг, масалан /Users/siz/Obsidian/JARVIS');
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new HttpError(400, 'Папка топилмади. Бу йўл JARVIS ишлаётган компьютерда бўлиши керак.');
  const real = fs.realpathSync(p);
  if (real === '/' || real === path.parse(real).root || real === process.env.HOME) throw new HttpError(400, 'Бутун диск ёки уй папкасини танлаб бўлмайди — алоҳида vault папкасини танланг.');
  fs.accessSync(real, fs.constants.R_OK | fs.constants.W_OK);
  setSetting('vault.path', real);
  log('vault_connected', 'vault', '', real);
  return real;
}

function safe(rel: string): string {
  const root = vaultRoot();
  if (!root) throw new HttpError(400, 'Vault уланмаган.');
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new HttpError(400, 'Vault ташқарисига кириш тақиқланган.');
  if (fs.existsSync(abs)) {
    const real = fs.realpathSync(abs);
    if (real !== root && !real.startsWith(root + path.sep)) throw new HttpError(400, 'Symlink vault ташқарисига олиб чиқади — рад этилди.');
  }
  return abs;
}
function backupFile(rel: string, abs: string) {
  const dir = path.join(BACKUPS_DIR, 'vault', now().replace(/[:.]/g, '-'));
  const dst = path.join(dir, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(abs, dst);
}
function writeFile(rel: string, content: string) {
  const abs = safe(rel);
  if (fs.existsSync(abs)) backupFile(rel, abs);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = abs + '.jarvis-tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, abs);
}
function addConflict(noteId: number, rel: string, fileContent: string) {
  const ex = getDb().prepare('SELECT id FROM vault_conflicts WHERE note_id = ? AND resolved_at IS NULL').get(noteId) as any;
  if (ex) getDb().prepare('UPDATE vault_conflicts SET file_content = ?, detected_at = ?, path = ? WHERE id = ?').run(fileContent, now(), rel, ex.id);
  else getDb().prepare('INSERT INTO vault_conflicts(note_id, path, file_content, detected_at) VALUES (?,?,?,?)').run(noteId, rel, fileContent, now());
}

/** Икки томонлама синхронлаш. */
export function syncVault() {
  const root = vaultRoot();
  if (!root) throw new HttpError(400, 'Vault уланмаган. Созламаларда папкани танланг.');
  const db = getDb();
  const lastSync = getSetting<string>('vault.lastSync', '1970-01-01');
  const report = { written: 0, imported: 0, unchanged: 0, conflicts: 0, newFromVault: 0, errors: [] as string[] };
  for (const f of FOLDERS) fs.mkdirSync(safe(f), { recursive: true });

  // 1) JARVIS ёзувлари → vault
  const notes = db.prepare('SELECT * FROM notes WHERE deleted_at IS NULL').all() as Note[];
  const openConflicts = new Set((db.prepare('SELECT note_id FROM vault_conflicts WHERE resolved_at IS NULL').all() as any[]).map((r) => r.note_id));
  const taken = new Map<string, number>(); // vault_path(lower) → note id
  for (const n of notes) if (n.vault_path) taken.set(n.vault_path.toLowerCase(), n.id);
  /** Ҳар бир ёзув учун ноёб файл йўли: бошқа ёзувга ёки фойдаланувчининг файлига тегишли бўлса — « (2)» қўшимчаси. */
  const assignPath = (n: Note) => {
    const base = notePath(n);
    for (let i = 1; i < 500; i++) {
      const cand = i === 1 ? base : base.replace(/\.md$/, ` (${i}).md`);
      const owner = taken.get(cand.toLowerCase());
      if (owner !== undefined && owner !== n.id) continue;
      const abs = safe(cand);
      if (fs.existsSync(abs)) {
        const { meta } = parseFrontmatter(fs.readFileSync(abs, 'utf8'));
        if (Number(meta.jarvis_id) !== n.id) continue; // бошқа ёзув ёки қўлда ёзилган файл — устидан ёзмаймиз
      }
      taken.set(cand.toLowerCase(), n.id);
      db.prepare('UPDATE notes SET vault_path = ? WHERE id = ?').run(cand, n.id);
      return cand;
    }
    throw new Error('ноёб файл номи топилмади');
  };
  for (const n of notes) {
    try {
      if (openConflicts.has(n.id)) { report.conflicts++; continue; }
      const rel = n.vault_path ?? assignPath(n);
      const abs = safe(rel);
      const content = noteToMarkdown(n);
      if (fs.existsSync(abs)) {
        const disk = fs.readFileSync(abs, 'utf8');
        const diskHash = md5(disk);
        const fileChanged = n.vault_hash ? diskHash !== n.vault_hash : diskHash !== md5(content);
        const appChanged = !n.vault_hash || n.updated_at > lastSync;
        if (diskHash === md5(content)) { if (n.vault_hash !== diskHash) db.prepare('UPDATE notes SET vault_path=?, vault_hash=? WHERE id=?').run(rel, diskHash, n.id); report.unchanged++; continue; }
        if (fileChanged && appChanged) { addConflict(n.id, rel, disk); report.conflicts++; continue; }
        if (fileChanged && !appChanged) {
          // Файл vault'да таҳрирланган → JARVIS'га олиш (эски версия сақланади)
          const { meta, body } = parseFrontmatter(disk);
          updateNote(n.id, { title: meta.title || n.title, body: body.replace(/^\n+/, '') }, 'Obsidian vault’дан');
          db.prepare('UPDATE notes SET vault_path=?, vault_hash=? WHERE id=?').run(rel, diskHash, n.id);
          report.imported++; continue;
        }
      }
      writeFile(rel, content);
      db.prepare('UPDATE notes SET vault_path=?, vault_hash=? WHERE id=?').run(rel, md5(content), n.id);
      report.written++;
    } catch (e: any) { report.errors.push(`${n.title}: ${e.message}`); }
  }

  // 2) vault'даги янги файллар (JARVIS'да йўқ) → JARVIS
  const known = new Set((db.prepare('SELECT vault_path FROM notes WHERE vault_path IS NOT NULL').all() as any[]).map((r) => r.vault_path));
  const walk = (dir: string, rel = ''): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.')) return [];
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) return [];
    if (e.isDirectory()) return walk(path.join(dir, e.name), r);
    return e.name.toLowerCase().endsWith('.md') ? [r] : [];
  });
  for (const rel of walk(root)) {
    if (known.has(rel) || /^03_PROJECTS\/PROJECT\s*[—-]/.test(rel)) continue;
    try {
      const text = fs.readFileSync(safe(rel), 'utf8');
      const { meta } = parseFrontmatter(text);
      if (meta.jarvis_id && db.prepare('SELECT 1 FROM notes WHERE id = ?').get(Number(meta.jarvis_id))) continue;
      const res: ImportResult = { created: 0, updated: 0, unchanged: 0, projects: 0, skipped: [] };
      const before = (db.prepare('SELECT MAX(id) m FROM notes').get() as any).m ?? 0;
      importMarkdownFile(rel, text, res);
      const created = db.prepare('SELECT id FROM notes WHERE id > ? ORDER BY id DESC LIMIT 1').get(before) as any;
      if (created) {
        // Файлнинг ўзини ўзгартирмаймиз; фақат боғланишни эслаб қоламиз.
        db.prepare('UPDATE notes SET vault_path=?, vault_hash=? WHERE id=?').run(rel, md5(text), created.id);
        report.newFromVault++;
      }
    } catch (e: any) { report.errors.push(`${rel}: ${e.message}`); }
  }
  // 3) лойиҳа карталари (фақат JARVIS → vault, зиддият текшируви билан)
  const projPaths = new Set<string>();
  for (const p of db.prepare('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY id').all() as any[]) {
    try {
      let rel = `03_PROJECTS/PROJECT — ${p.name.replace(/[\\/:*?"<>|]/g, ' ').trim()}.md`;
      if (projPaths.has(rel.toLowerCase())) rel = rel.replace(/\.md$/, ` (${p.id}).md`);
      projPaths.add(rel.toLowerCase());
      const abs = safe(rel); const content = projectToMarkdown(p);
      if (fs.existsSync(abs)) {
        const h = md5(fs.readFileSync(abs, 'utf8'));
        if (h === md5(content)) { if (p.vault_hash !== h) db.prepare('UPDATE projects SET vault_hash=? WHERE id=?').run(h, p.id); continue; }
        if (!p.vault_hash || h !== p.vault_hash) { report.errors.push(`${rel}: vault’да қўлда ўзгартирилган — устидан ёзилмади. Markdown импорт орқали олинг.`); continue; }
      }
      writeFile(rel, content);
      db.prepare('UPDATE projects SET vault_hash=? WHERE id=?').run(md5(content), p.id);
    } catch (e: any) { report.errors.push(`${p.name}: ${e.message}`); }
  }
  setSetting('vault.lastSync', now());
  log('vault_sync', 'vault', '', JSON.stringify(report));
  return report;
}

export function listConflicts() {
  return getDb().prepare(`SELECT c.*, n.title, n.body note_body FROM vault_conflicts c JOIN notes n ON n.id = c.note_id WHERE c.resolved_at IS NULL ORDER BY c.id DESC`).all();
}
export function resolveConflict(id: number, resolution: 'keep_app' | 'keep_file' | 'keep_both') {
  const db = getDb();
  const c = db.prepare('SELECT * FROM vault_conflicts WHERE id = ? AND resolved_at IS NULL').get(id) as any;
  if (!c) throw new HttpError(404, 'Зиддият топилмади.');
  const n = getNote(c.note_id);
  if (resolution === 'keep_app') {
    const content = noteToMarkdown(n);
    writeFile(c.path, content); // эски файл backup'га нусхаланади
    db.prepare('UPDATE notes SET vault_hash=? WHERE id=?').run(md5(content), n.id);
  } else if (resolution === 'keep_file') {
    const { meta, body } = parseFrontmatter(c.file_content);
    updateNote(n.id, { title: meta.title || n.title, body: body.replace(/^\n+/, '') }, 'зиддият: vault версияси танланди');
    const fresh = getNote(n.id);
    const content = noteToMarkdown(fresh);
    writeFile(c.path, content);
    db.prepare('UPDATE notes SET vault_hash=? WHERE id=?').run(md5(content), n.id);
  } else {
    const { body } = parseFrontmatter(c.file_content);
    createNote({ folder: n.folder, title: `${n.title} (vault нусхаси)`, body: body.replace(/^\n+/, ''), kind: n.kind === 'decision' ? 'note' : n.kind, project_id: n.project_id, source: `Vault зиддияти: ${c.path}` });
    const content = noteToMarkdown(n);
    writeFile(c.path, content);
    db.prepare('UPDATE notes SET vault_hash=? WHERE id=?').run(md5(content), n.id);
  }
  db.prepare('UPDATE vault_conflicts SET resolved_at = ?, resolution = ? WHERE id = ?').run(now(), resolution, id);
  log('vault_conflict_resolved', 'note', n.id, resolution);
  return { ok: true };
}
