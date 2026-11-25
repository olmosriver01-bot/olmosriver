import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

export async function startApp(opts: { mock?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-test-'));
  process.env.JARVIS_DATA_DIR = dir;
  process.env.JARVIS_SECRET = 'test-secret';
  if (opts.mock) process.env.JARVIS_ENABLE_MOCK = '1'; else delete process.env.JARVIS_ENABLE_MOCK;
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) delete process.env[k];
  const { createApp } = await import('../server/app.ts');
  const app = createApp();
  const server = await new Promise<any>((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  let cookie = '';
  async function call(method: string, url: string, body?: any, raw = false): Promise<any> {
    const isForm = body instanceof FormData;
    const res = await fetch(base + url, {
      method, body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      headers: { ...(isForm ? {} : { 'content-type': 'application/json' }), 'x-requested-with': 'jarvis', cookie },
    });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    if (raw) return res;
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  }
  const login = async () => { const r = await call('POST', '/auth/setup', { password: 'parol12345' }); if (r.status !== 200) throw new Error(JSON.stringify(r)); };
  const close = () => new Promise((r) => server.close(r));
  return { call, login, close, dir, setCookie: (c: string) => (cookie = c), getCookie: () => cookie };
}

export function fileForm(fields: Record<string, string>, files: { name: string; content: Buffer | string; type?: string }[], field = 'files') {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append(field, new Blob([f.content as any], { type: f.type ?? 'application/octet-stream' }), f.name);
  return fd;
}
export const fixture = (n: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', n));
