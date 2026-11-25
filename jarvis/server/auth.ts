import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { DATA_DIR, getDb, getSetting, setSetting, now, HttpError, log } from './db.ts';

const COOKIE = 'jarvis_session';
const SESSION_DAYS = 30;

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return test.length === real.length && crypto.timingSafeEqual(test, real);
}
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function isSetup() {
  if (getSetting<string | null>('auth.password', null)) return true;
  const env = process.env.JARVIS_PASSWORD;
  if (env && env.length >= 8) { setSetting('auth.password', hashPassword(env)); return true; }
  return false;
}
export function setPassword(password: string) {
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Парол камида 8 белгидан иборат бўлсин.');
  setSetting('auth.password', hashPassword(password));
}

const attempts = new Map<string, { n: number; until: number }>();
export function login(password: string, ip: string): string {
  const a = attempts.get(ip);
  if (a && a.n >= 5 && a.until > Date.now()) throw new HttpError(429, 'Жуда кўп уриниш. 15 дақиқадан кейин қайта уриниб кўринг.');
  const stored = getSetting<string | null>('auth.password', null);
  if (!stored || !verifyPassword(String(password ?? ''), stored)) {
    attempts.set(ip, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60000 });
    log('login_failed', 'auth');
    throw new HttpError(401, 'Парол нотўғри.');
  }
  attempts.delete(ip);
  return createSession();
}
export function createSession(): string {
  const token = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  getDb().prepare('INSERT INTO sessions VALUES (?,?,?)').run(sha(token), now(), exp);
  return token;
}
export function setCookie(req: Request, res: Response, token: string | null) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [`${COOKIE}=${token ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function readToken(req: Request): string | null {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}
export function isAuthed(req: Request): boolean {
  const t = readToken(req);
  if (!t) return false;
  const r = getDb().prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(sha(t)) as any;
  return !!r && r.expires_at > now();
}
export function logout(req: Request) {
  const t = readToken(req);
  if (t) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
}
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!isAuthed(req)) return next(new HttpError(401, 'Аввал тизимга киринг.', 'unauthenticated'));
  next();
}
/** CSRF: ўзгартирувчи сўровлар махсус сарлавҳа билан келиши шарт (браузер бошқа сайтдан қўя олмайди). */
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'jarvis')
    return next(new HttpError(403, 'Сўров рад этилди (CSRF ҳимояси).'));
  next();
}

// ---- API калитларини шифрлаш (AES-256-GCM) ----
function masterKey(): Buffer {
  if (process.env.JARVIS_SECRET) return crypto.createHash('sha256').update(process.env.JARVIS_SECRET).digest();
  const f = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex');
}
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decrypt(blob: string): string | null {
  try {
    const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return null; }
}
