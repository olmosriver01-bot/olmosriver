import Anthropic from '@anthropic-ai/sdk';
import { getDb, getSetting, setSetting, now, HttpError } from './db.ts';
import { encrypt, decrypt } from './auth.ts';

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'mock';
export type ChatMsg = { role: 'user' | 'assistant'; content: string };
export type AiRequest = { system: string; messages: ChatMsg[]; model?: string; maxTokens?: number; kind?: string };
export type AiResult = { text: string; provider: ProviderId; model: string; inputTokens: number; outputTokens: number; costUsd: number | null; mock: boolean; note?: string };

export const PROVIDERS: Record<Exclude<ProviderId, 'mock'>, { name: string; defaultModel: string; envKey: string; docs: string; keyHint: string }> = {
  anthropic: { name: 'Anthropic (Claude)', defaultModel: 'claude-opus-5-5', envKey: 'ANTHROPIC_API_KEY', docs: 'https://platform.claude.com/docs', keyHint: 'sk-ant-…' },
  openai: { name: 'OpenAI (GPT)', defaultModel: 'gpt-6.2-astra', envKey: 'OPENAI_API_KEY', docs: 'https://developers.openai.com/api/docs/models', keyHint: 'sk-…' },
  google: { name: 'Google (Gemini)', defaultModel: 'gemini-3.5-flash', envKey: 'GEMINI_API_KEY', docs: 'https://ai.google.dev/gemini-api/docs', keyHint: 'AIza…' },
};

/** Маълум нархлар (USD / 1M токен). Фақат Anthropic расмий жадвалидан; бошқалари учун созламаларда киритилади. */
const KNOWN_PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5], 'claude-fable-5-2': [8, 40],
};

export type AiSettings = {
  defaultProvider: ProviderId | null;
  models: Partial<Record<ProviderId, string>>;
  prices: Record<string, [number, number]>;   // model -> [in, out]
  monthlyBudgetUsd: number;                    // 0 = cheksiz
  dailyRequestLimit: number;
  perMinuteLimit: number;
  maxOutputTokens: number;
  timeoutMs: number;
  sendProfile: boolean;
  sendProject: boolean;
};
export const DEFAULT_AI: AiSettings = {
  defaultProvider: null, models: {}, prices: {}, monthlyBudgetUsd: 10, dailyRequestLimit: 200, perMinuteLimit: 10,
  maxOutputTokens: 8000, timeoutMs: 120000, sendProfile: true, sendProject: true,
};
export const aiSettings = (): AiSettings => ({ ...DEFAULT_AI, ...getSetting<Partial<AiSettings>>('ai', {}) });
export function saveAiSettings(patch: Partial<AiSettings>) {
  const cur = aiSettings();
  const n = (v: any, d: number, min = 0, max = 1e9) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : d);
  const next: AiSettings = {
    ...cur,
    defaultProvider: patch.defaultProvider !== undefined ? (patch.defaultProvider as any) : cur.defaultProvider,
    models: { ...cur.models, ...(patch.models ?? {}) },
    prices: { ...cur.prices, ...(patch.prices ?? {}) },
    monthlyBudgetUsd: n(patch.monthlyBudgetUsd ?? cur.monthlyBudgetUsd, cur.monthlyBudgetUsd),
    dailyRequestLimit: n(patch.dailyRequestLimit ?? cur.dailyRequestLimit, cur.dailyRequestLimit, 1),
    perMinuteLimit: n(patch.perMinuteLimit ?? cur.perMinuteLimit, cur.perMinuteLimit, 1),
    maxOutputTokens: n(patch.maxOutputTokens ?? cur.maxOutputTokens, cur.maxOutputTokens, 256, 64000),
    timeoutMs: n(patch.timeoutMs ?? cur.timeoutMs, cur.timeoutMs, 5000, 600000),
    sendProfile: patch.sendProfile ?? cur.sendProfile,
    sendProject: patch.sendProject ?? cur.sendProject,
  };
  setSetting('ai', next);
  return next;
}

// ---- калитлар: фақат серверда, шифрланган ----
export function getKey(p: ProviderId): string | null {
  if (p === 'mock') return null;
  const blob = getSetting<string | null>(`key.${p}`, null);
  if (blob) return decrypt(blob);
  return process.env[PROVIDERS[p].envKey] || null;
}
export function setKey(p: ProviderId, key: string | null) {
  if (p === 'mock' || !(p in PROVIDERS)) throw new HttpError(400, 'Номаълум провайдер.');
  if (key) setSetting(`key.${p}`, encrypt(key.trim())); else getDb().prepare('DELETE FROM settings WHERE key = ?').run(`key.${p}`);
}
const mockEnabled = () => process.env.JARVIS_ENABLE_MOCK === '1';

export function providerStatus() {
  const s = aiSettings();
  const list = (Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map((id) => {
    const stored = !!getSetting<string | null>(`key.${id}`, null);
    const env = !!process.env[PROVIDERS[id].envKey];
    const key = getKey(id);
    return {
      id, name: PROVIDERS[id].name, docs: PROVIDERS[id].docs, keyHint: PROVIDERS[id].keyHint,
      connected: !!key, keySource: stored ? 'settings' : env ? 'env' : null,
      keyPreview: key ? `…${key.slice(-4)}` : null,
      model: s.models[id] || PROVIDERS[id].defaultModel,
      lastCheck: getSetting<any>(`check.${id}`, null),
    };
  });
  return { providers: list, mock: mockEnabled(), defaultProvider: resolveProvider(null, true) };
}
export function resolveProvider(p: ProviderId | null | undefined, soft = false): ProviderId | null {
  const s = aiSettings();
  const order = [p, s.defaultProvider, 'anthropic', 'openai', 'google'].filter(Boolean) as ProviderId[];
  for (const c of order) {
    if (c === 'mock') { if (mockEnabled()) return 'mock'; continue; }
    if (getKey(c)) return c;
  }
  if (mockEnabled()) return 'mock';
  if (soft) return null;
  throw new HttpError(409, 'AI провайдер уланмаган. Созламалар → AI провайдерлар бўлимида API калитини киритинг.', 'no_provider');
}

// ---- лимитлар ва харажат ----
export function priceFor(model: string): [number, number] | null {
  return aiSettings().prices[model] ?? KNOWN_PRICES[model] ?? null;
}
export function usageSummary() {
  const db = getDb();
  const month = new Date().toISOString().slice(0, 7);
  const day = new Date().toISOString().slice(0, 10);
  const m = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(cost_usd),0) cost, SUM(CASE WHEN cost_usd IS NULL AND ok=1 THEN 1 ELSE 0 END) unpriced,
    COALESCE(SUM(input_tokens),0) inTok, COALESCE(SUM(output_tokens),0) outTok FROM usage WHERE created_at LIKE ?`).get(month + '%') as any;
  const d = db.prepare('SELECT COUNT(*) n FROM usage WHERE created_at LIKE ?').get(day + '%') as any;
  return { month, monthRequests: m.n, monthCostUsd: Math.round(m.cost * 10000) / 10000, unpricedRequests: m.unpriced, inputTokens: m.inTok, outputTokens: m.outTok, todayRequests: d.n };
}
function checkLimits(provider: ProviderId) {
  if (provider === 'mock') return;
  const s = aiSettings(); const u = usageSummary();
  if (u.todayRequests >= s.dailyRequestLimit) throw new HttpError(429, `Кунлик сўров лимити (${s.dailyRequestLimit}) тугади. Созламаларда оширишингиз мумкин.`, 'limit');
  if (s.monthlyBudgetUsd > 0 && u.monthCostUsd >= s.monthlyBudgetUsd) throw new HttpError(429, `Ойлик бюджет ($${s.monthlyBudgetUsd}) тугади.`, 'budget');
  const since = new Date(Date.now() - 60000).toISOString();
  const r = getDb().prepare('SELECT COUNT(*) n FROM usage WHERE created_at > ?').get(since) as any;
  if (r.n >= s.perMinuteLimit) throw new HttpError(429, `Дақиқасига ${s.perMinuteLimit} та сўров лимити. Бироз кутинг.`, 'rate');
}
function record(r: Partial<AiResult> & { provider: string; model: string; kind: string; ok: boolean; error?: string }) {
  getDb().prepare('INSERT INTO usage(provider, model, kind, input_tokens, output_tokens, cost_usd, ok, error, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(r.provider, r.model, r.kind, r.inputTokens ?? 0, r.outputTokens ?? 0, r.costUsd ?? null, r.ok ? 1 : 0, r.error ?? null, now());
}

class ProviderError extends HttpError {}
// Прокси ёки тест учун: OPENAI_BASE_URL, GEMINI_BASE_URL, ANTHROPIC_BASE_URL (SDK ўзи ўқийди)
const openaiBase = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const geminiBase = () => (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
function friendly(provider: string, status: number | undefined, msg: string): ProviderError {
  const n = PROVIDERS[provider as keyof typeof PROVIDERS]?.name ?? provider;
  if (status === 401 || status === 403) return new ProviderError(502, `${n}: API калити нотўғри ёки рухсат йўқ (${status}).`, 'provider_auth');
  if (status === 429) return new ProviderError(429, `${n}: провайдер лимити ёки квотаси тугади (429). Кейинроқ уриниб кўринг ёки ҳисобингиздаги лимитни текширинг.`, 'provider_rate');
  if (status === 404) return new ProviderError(502, `${n}: модел топилмади (404). Созламаларда модел номини текширинг.`, 'provider_model');
  if (status === 400) return new ProviderError(502, `${n}: сўров рад этилди (400): ${msg.slice(0, 200)}`, 'provider_bad_request');
  if (status && status >= 500) return new ProviderError(502, `${n}: провайдер серверида хато (${status}). Кейинроқ уриниб кўринг.`, 'provider_down');
  if (/timeout|timed out|abort/i.test(msg)) return new ProviderError(504, `${n}: жавоб вақти тугади. Сўровни қисқартиринг ёки кейинроқ уриниб кўринг.`, 'provider_timeout');
  return new ProviderError(502, `${n}: уланиб бўлмади — ${msg.slice(0, 200)}`, 'provider_network');
}

async function callAnthropic(key: string, model: string, req: AiRequest, s: AiSettings) {
  const client = new Anthropic({ apiKey: key, timeout: s.timeoutMs, maxRetries: 1 });
  const params: any = {
    model, max_tokens: req.maxTokens ?? s.maxOutputTokens, system: req.system,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  const usesFallback = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
  try {
    const r: any = usesFallback
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
    const text = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    let note: string | undefined;
    if (r.stop_reason === 'refusal') note = 'Модел бу сўровни хавфсизлик сабабли рад этди.';
    else if (r.stop_reason === 'max_tokens') note = 'Жавоб токен лимитига етиб кесилди.';
    return { text, inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0, model: r.model ?? model, note };
  } catch (e: any) {
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw friendly('anthropic', undefined, 'timeout');
    if (e instanceof Anthropic.APIError) throw friendly('anthropic', e.status, e.message);
    throw friendly('anthropic', undefined, String(e?.message || e));
  }
}

async function httpJson(provider: string, url: string, init: RequestInit, timeoutMs: number) {
  let res: Response;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (e: any) { throw friendly(provider, undefined, e?.name === 'TimeoutError' ? 'timeout' : String(e?.message || e)); }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw friendly(provider, res.status, body?.error?.message || JSON.stringify(body).slice(0, 300));
  return body;
}

async function callOpenAI(key: string, model: string, req: AiRequest, s: AiSettings) {
  // Responses API: POST /v1/responses
  const body = await httpJson('openai', `${openaiBase()}/responses`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, instructions: req.system, input: req.messages.map((m) => ({ role: m.role, content: m.content })), max_output_tokens: req.maxTokens ?? s.maxOutputTokens, store: false }),
  }, s.timeoutMs);
  const text = (body.output ?? []).filter((o: any) => o.type === 'message')
    .flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
  const note = body.status === 'incomplete' ? `Жавоб тўлиқ эмас: ${body.incomplete_details?.reason ?? ''}` : undefined;
  return { text, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0, model: body.model ?? model, note };
}

async function callGemini(key: string, model: string, req: AiRequest, s: AiSettings) {
  const body = await httpJson('google', `${geminiBase()}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: req.maxTokens ?? s.maxOutputTokens },
    }),
  }, s.timeoutMs);
  const cand = body.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('');
  let note: string | undefined;
  if (!cand) note = `Gemini жавоб бермади: ${body.promptFeedback?.blockReason ?? 'номаълум сабаб'}`;
  else if (cand.finishReason && cand.finishReason !== 'STOP') note = `Тугаш сабаби: ${cand.finishReason}`;
  return { text, inputTokens: body.usageMetadata?.promptTokenCount ?? 0, outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0, model, note };
}

function callMock(req: AiRequest) {
  const last = req.messages[req.messages.length - 1]?.content ?? '';
  const cites = [...new Set(req.system.match(/\[S\d+\]/g) ?? [])].slice(0, 2).join(' ');
  return { text: `⚠️ MOCK ЖАВОБ (тест режими, ҳақиқий AI эмас).\nСаволингиз: «${last.slice(0, 200)}»${cites ? `\nМанба белгилари: ${cites}` : ''}`, inputTokens: 0, outputTokens: 0, model: 'mock', note: 'Тест учун сохта провайдер' };
}

export async function complete(req: AiRequest, providerPref?: ProviderId | null): Promise<AiResult> {
  const provider = resolveProvider(providerPref ?? null)!;
  const s = aiSettings();
  checkLimits(provider);
  const model = provider === 'mock' ? 'mock' : req.model || s.models[provider] || PROVIDERS[provider].defaultModel;
  const kind = req.kind ?? 'chat';
  try {
    const key = provider === 'mock' ? '' : getKey(provider)!;
    const r = provider === 'anthropic' ? await callAnthropic(key, model, req, s)
      : provider === 'openai' ? await callOpenAI(key, model, req, s)
      : provider === 'google' ? await callGemini(key, model, req, s)
      : callMock(req);
    const price = priceFor(r.model) ?? priceFor(model);
    const costUsd = price ? (r.inputTokens * price[0] + r.outputTokens * price[1]) / 1e6 : null;
    const out: AiResult = { ...r, provider, costUsd, mock: provider === 'mock' };
    record({ ...out, kind, ok: true });
    if (!r.text && !r.note) throw new HttpError(502, 'Провайдер бўш жавоб қайтарди.', 'empty');
    return out;
  } catch (e: any) {
    if (e instanceof ProviderError || !(e instanceof HttpError)) record({ provider, model, kind, ok: false, error: e.message });
    throw e instanceof HttpError ? e : friendly(provider, undefined, String(e?.message || e));
  }
}

/** Калит ва моделни ҳақиқий API орқали текшириш (моделлар рўйхатини олиш). */
export async function checkProvider(p: ProviderId) {
  const key = getKey(p);
  if (!key || p === 'mock') throw new HttpError(400, 'Калит киритилмаган.');
  let models: string[] = [];
  try {
    if (p === 'anthropic') {
      const c = new Anthropic({ apiKey: key, timeout: 20000, maxRetries: 0 });
      for await (const m of c.models.list({ limit: 100 })) models.push(m.id);
    } else if (p === 'openai') {
      const b = await httpJson('openai', `${openaiBase()}/models`, { headers: { authorization: `Bearer ${key}` } }, 20000);
      models = (b.data ?? []).map((m: any) => m.id).sort();
    } else {
      const b = await httpJson('google', `${geminiBase()}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }, 20000);
      models = (b.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m: any) => String(m.name).replace(/^models\//, ''));
    }
  } catch (e: any) {
    const err = e instanceof HttpError ? e : e instanceof Anthropic.APIError ? friendly(p, e.status, e.message) : friendly(p, undefined, String(e?.message || e));
    setSetting(`check.${p}`, { ok: false, at: now(), error: err.message });
    throw err;
  }
  const model = aiSettings().models[p] || PROVIDERS[p as keyof typeof PROVIDERS].defaultModel;
  const res = { ok: true, at: now(), modelCount: models.length, modelAvailable: models.includes(model), model };
  setSetting(`check.${p}`, res);
  return { ...res, models: models.slice(0, 200) };
}
