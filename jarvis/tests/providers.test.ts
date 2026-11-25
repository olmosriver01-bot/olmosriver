// AI провайдер қатлами: калитсиз ҳолат, калит хавфсизлиги, хатолар, лимитлар.
// ДИҚҚАТ: бу тестлар маҳаллий сохта HTTP сервер билан ишлайди — ҳақиқий OpenAI/Anthropic/Google API текширилмайди.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { startApp } from './helpers.ts';

let mode = 'ok';
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const send = (code: number, obj: any) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (mode === 'timeout') return; // жавоб бермайди
    if (mode === '401') return send(401, { error: { message: 'Invalid API key' } });
    if (mode === '429') return send(429, { error: { message: 'Rate limit' } });
    if (mode === '404') return send(404, { error: { message: 'model not found' } });
    if (req.url?.startsWith('/v1/messages')) {
      const b = JSON.parse(body);
      assert.equal(b.model, 'claude-opus-5-5'); assert.equal(b.fallbacks, 'default');
      return send(200, { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Claude жавоби' }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 } });
    }
    if (req.url?.startsWith('/v1/models')) return send(200, { data: [{ id: 'gpt-test' }] });
    if (req.url?.includes(':generateContent')) {
      const b = JSON.parse(body);
      assert.ok(b.systemInstruction.parts[0].text.includes('JARVIS'));
      return send(200, { candidates: [{ content: { parts: [{ text: 'Gemini жавоби [S1]' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } });
    }
    return send(200, { model: 'gpt-test', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'OpenAI жавоби' }] }], usage: { input_tokens: 1000, output_tokens: 500 } });
  });
});
await new Promise<void>((r) => fake.listen(0, '127.0.0.1', () => r()));
const fport = (fake.address() as AddressInfo).port;
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${fport}/v1`;
process.env.GEMINI_BASE_URL = `http://127.0.0.1:${fport}/v1beta`;
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fport}`;

const app = await startApp({ mock: false });
test.after(async () => { await app.close(); fake.close(); });
const { call } = app;
await app.login();

test('калит йўқ: «Провайдер уланмаган», лекин лойиҳа/хотира/вазифалар ишлайди', async () => {
  const st = (await call('GET', '/settings/ai')).data;
  assert.equal(st.defaultProvider, null);
  assert.ok(st.providers.every((p: any) => !p.connected));
  const c = (await call('POST', '/conversations', {})).data;
  const r = await call('POST', `/conversations/${c.id}/messages`, { text: 'Салом' });
  assert.equal(r.status, 409); assert.equal(r.data.code, 'no_provider'); assert.match(r.data.error, /уланмаган/);
  // сохта жавоб сақланмаган — фақат хато хабари
  const conv = (await call('GET', `/conversations/${c.id}`)).data;
  assert.equal(conv.messages.at(-1).meta.error, true);
  assert.equal((await call('POST', '/projects', { name: 'Калитсиз лойиҳа' })).status, 200);
  assert.equal((await call('POST', '/notes', { folder: '00_INBOX', title: 'ғоя' })).status, 200);
  assert.equal((await call('POST', '/tasks', { title: 'вазифа' })).status, 200);
  const w = (await call('POST', '/workflows', { type: 'content', input: 'ғоя' })).data;
  const run = (await call('POST', `/workflows/${w.id}/run`)).data;
  assert.equal(run.status, 'error'); assert.match(run.steps[0].error, /уланмаган/);
});

test('калит фақат серверда, шифрланган; браузерга фақат охирги 4 белги', async () => {
  const key = 'sk-test-SECRETVALUE-1234';
  await call('POST', '/settings/ai/key', { provider: 'openai', key });
  await call('PUT', '/settings/ai', { defaultProvider: 'openai', models: { openai: 'gpt-test' }, prices: { 'gpt-test': [2, 8] } });
  const st = await call('GET', '/settings/ai');
  assert.ok(!JSON.stringify(st.data).includes('SECRETVALUE'));
  assert.equal(st.data.providers.find((p: any) => p.id === 'openai').keyPreview, '…1234');
  const raw = fs.readFileSync(path.join(app.dir, 'jarvis.db'));
  assert.ok(!raw.includes(Buffer.from('SECRETVALUE')), 'калит базада очиқ сақланмаслиги керак');
  const dash = await call('GET', '/dashboard');
  assert.ok(!JSON.stringify(dash.data).includes('SECRETVALUE'));
});

test('OpenAI Responses формати ўқилади, харажат ҳисобланади; моделлар рўйхати текширилади', async () => {
  mode = 'ok';
  const c = (await call('POST', '/conversations', { source_mode: 'off' })).data;
  const r = await call('POST', `/conversations/${c.id}/messages`, { text: 'Салом' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const m = r.data.conversation.messages.at(-1);
  assert.equal(m.content, 'OpenAI жавоби'); assert.equal(m.meta.provider, 'openai'); assert.equal(m.meta.mock, false);
  assert.equal(m.meta.costUsd, (1000 * 2 + 500 * 8) / 1e6);
  const chk = (await call('POST', '/settings/ai/check', { provider: 'openai' })).data;
  assert.equal(chk.modelAvailable, true);
});

test('Gemini формати ўқилади', async () => {
  await call('POST', '/settings/ai/key', { provider: 'google', key: 'AIza-test' });
  const c = (await call('POST', '/conversations', { source_mode: 'off', provider: 'google' })).data;
  const r = await call('POST', `/conversations/${c.id}/messages`, { text: 'Салом' });
  assert.equal(r.data.conversation.messages.at(-1).content, 'Gemini жавоби [S1]');
});

test('Anthropic SDK орқали сўров (fallbacks: default), нарх жадвалдан', async () => {
  await call('POST', '/settings/ai/key', { provider: 'anthropic', key: 'sk-ant-test' });
  const c = (await call('POST', '/conversations', { source_mode: 'off', provider: 'anthropic' })).data;
  const r = await call('POST', `/conversations/${c.id}/messages`, { text: 'Салом' });
  const m = r.data.conversation.messages.at(-1);
  assert.equal(m.content, 'Claude жавоби', JSON.stringify(r.data));
  assert.equal(m.meta.costUsd, (1000 * 4 + 100 * 20) / 1e6);
});

test('провайдер хатолари тушунарли кўрсатилади (401, 429, 404, вақт тугаши)', async () => {
  const c = (await call('POST', '/conversations', { source_mode: 'off', provider: 'openai' })).data;
  const cases: [string, RegExp][] = [['401', /калити нотўғри/], ['429', /лимит/], ['404', /модел топилмади/]];
  for (const [m, re] of cases) {
    mode = m;
    const r = await call('POST', `/conversations/${c.id}/messages`, { text: 'x' });
    assert.match(r.data.error, re, m);
  }
  mode = 'timeout';
  await call('PUT', '/settings/ai', { timeoutMs: 5000 });
  const r = await call('POST', `/conversations/${c.id}/messages`, { text: 'x' });
  assert.equal(r.status, 504); assert.match(r.data.error, /вақти тугади/);
  mode = 'ok';
  const usage = (await call('GET', '/usage')).data;
  assert.ok(usage.some((u: any) => u.ok === 0));
});

test('сўров лимитлари ва бюджет ишлайди', async () => {
  await call('PUT', '/settings/ai', { dailyRequestLimit: 1, perMinuteLimit: 100 });
  const c = (await call('POST', '/conversations', { source_mode: 'off', provider: 'openai' })).data;
  const r = await call('POST', `/conversations/${c.id}/messages`, { text: 'x' });
  assert.equal(r.status, 429); assert.match(r.data.error, /Кунлик сўров лимити/);
  await call('PUT', '/settings/ai', { dailyRequestLimit: 1000, monthlyBudgetUsd: 0.000001 });
  const r2 = await call('POST', `/conversations/${c.id}/messages`, { text: 'x' });
  assert.equal(r2.status, 429); assert.match(r2.data.error, /бюджет/);
});
