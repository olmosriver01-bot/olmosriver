import React, { useEffect, useState } from 'react';
import { get, post, put, download } from '../api';
import { t, getScript, setScript } from '../i18n';
import { useLoad, useAction, Btn, Field, Input, Select, Alert, Confirm, fmtDate, Drop, Empty } from '../ui';

export function Settings({ onScript, onLogout }: { onScript: () => void; onLogout: () => void }) {
  const [tab, setTab] = useState('ai');
  const tabs: [string, string][] = [['ai', 'AI провайдерлар'], ['limits', 'Харажат ва маълумот'], ['integrations', 'Ташқи воситалар'], ['backup', 'Backup ва тиклаш'], ['trash', 'Сават'], ['log', 'Амаллар журнали'], ['security', 'Хавфсизлик']];
  return <div className="page">
    <div className="head"><div><h1>{t('Созламалар')}</h1></div>
      <div className="row"><Btn sm kind={getScript() === 'cyr' ? 'primary' : undefined} onClick={() => { setScript('cyr'); onScript(); }}><>Кирилл</></Btn><Btn sm kind={getScript() === 'lat' ? 'primary' : undefined} onClick={() => { setScript('lat'); onScript(); }}><>Lotin</></Btn>
        <Btn sm onClick={async () => { await post('/auth/logout'); onLogout(); }}>{t('Чиқиш')}</Btn></div></div>
    <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
    {tab === 'ai' && <Providers />}{tab === 'limits' && <Limits />}{tab === 'integrations' && <Integrations />}{tab === 'backup' && <Backups />}
    {tab === 'trash' && <Trash />}{tab === 'log' && <Log />}{tab === 'security' && <Security onLogout={onLogout} />}
  </div>;
}

function Providers() {
  const { data, reload } = useLoad(() => get('/settings/ai'));
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<Record<string, any>>({});
  const { busy, run } = useAction();
  useEffect(() => { if (data) setModels(Object.fromEntries(data.providers.map((p: any) => [p.id, p.model]))); }, [data]);
  if (!data) return null;
  return <div className="stack">
    <Alert kind="info">API калитлари фақат серверда, шифрланган (AES-256-GCM) ҳолда сақланади; браузерга фақат охирги 4 белгиси қайтади. Оддий ChatGPT Plus, Claude Pro ёки Gemini Advanced обунаси API ҳуқуқини бермайди — API калити ва тўлов алоҳида (провайдернинг developer платформасида) олинади.</Alert>
    <Field label="Асосий провайдер"><Select value={data.settings.defaultProvider ?? ''} onChange={async (e) => { await run(() => put('/settings/ai', { defaultProvider: e.target.value || null }), 'Сақланди'); reload(); }}
      options={[['', 'Автоматик (биринчи уланган)'], ...data.providers.map((p: any) => [p.id, p.name] as [string, string]), ...(data.mock ? [['mock', 'MOCK (тест)'] as [string, string]] : [])]} /></Field>
    {data.providers.map((p: any) => <div key={p.id} className="card stack">
      <div className="row between"><h2 style={{ margin: 0 }}><span className={`dot ${p.connected ? 'on' : 'off'}`} /> {p.name}</h2>
        <span className="small">{p.connected ? <>{t('Уланган')} ({p.keySource === 'env' ? '.env' : t('созламалар')}) · <span className="mono">{p.keyPreview}</span></> : <span className="muted">{t('Провайдер уланмаган')}</span>}</span></div>
      <div className="grid g2">
        <Field label="API калити"><div className="row" style={{ flexWrap: 'nowrap' }}><Input type="password" autoComplete="off" placeholder={p.keyHint} value={keys[p.id] ?? ''} onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })} />
          <Btn disabled={busy || !keys[p.id]} onClick={async () => { await run(() => post('/settings/ai/key', { provider: p.id, key: keys[p.id] }), 'Калит сақланди'); setKeys({ ...keys, [p.id]: '' }); reload(); }}>Сақлаш</Btn>
          {p.keySource === 'settings' && <Btn kind="ghost" onClick={async () => { if (confirm(t('Калит ўчирилсинми?'))) { await run(() => post('/settings/ai/key', { provider: p.id, key: null }), 'Ўчирилди'); reload(); } }}>🗑</Btn>}</div></Field>
        <Field label="Модел ID" hint="Провайдер ҳужжатидаги аниқ модел номи. «Текшириш» мавжуд моделлар рўйхатини API’дан олади."><div className="row" style={{ flexWrap: 'nowrap' }}>
          <Input className="mono" value={models[p.id] ?? ''} onChange={(e) => setModels({ ...models, [p.id]: e.target.value })} list={`m-${p.id}`} />
          <datalist id={`m-${p.id}`}>{(check[p.id]?.models ?? []).map((m: string) => <option key={m} value={m} />)}</datalist>
          <Btn disabled={busy || models[p.id] === p.model} onClick={async () => { await run(() => put('/settings/ai', { models: { [p.id]: models[p.id] } }), 'Сақланди'); reload(); }}>Сақлаш</Btn></div></Field>
      </div>
      <div className="row"><Btn disabled={busy || !p.connected} onClick={async () => { const r = await run(() => post('/settings/ai/check', { provider: p.id })); if (r) setCheck({ ...check, [p.id]: r }); reload(); }}>{t('Калитни ҳақиқий API орқали текшириш')}</Btn>
        <a className="small" href={p.docs} target="_blank" rel="noopener noreferrer">{t('Расмий ҳужжат')} ↗</a>
        {p.lastCheck && <span className={`badge ${p.lastCheck.ok ? 'b-ok' : 'b-err'}`}>{p.lastCheck.ok ? `${t('Ишлайди')} · ${p.lastCheck.modelCount} ${t('модел')}${p.lastCheck.modelAvailable ? '' : ` · ⚠️ ${p.lastCheck.model} ${t('рўйхатда йўқ')}`}` : p.lastCheck.error} · {fmtDate(p.lastCheck.at)}</span>}</div>
    </div>)}
    {data.mock && <Alert kind="warn">MOCK провайдер ёқилган (JARVIS_ENABLE_MOCK=1). Унинг жавоблари ҳақиқий AI эмас ва ҳар доим «MOCK» деб белгиланади.</Alert>}
  </div>;
}

function Limits() {
  const { data, reload } = useLoad(() => get('/settings/ai'));
  const usage = useLoad(() => get('/usage'));
  const [s, setS] = useState<any>(null);
  const [price, setPrice] = useState({ model: '', inp: '', out: '' });
  const { busy, run } = useAction();
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  if (!data || !s) return null;
  const u = data.usage;
  return <div className="grid g2">
    <div className="card stack"><h2>{t('Харажат назорати ва лимитлар')}</h2>
      <div className="small">{t('Бу ой')}: <b>{u.monthRequests}</b> {t('сўров')} · <b>${u.monthCostUsd.toFixed(4)}</b> · {u.inputTokens}/{u.outputTokens} {t('токен')}{u.unpricedRequests ? <span className="badge b-warn">{u.unpricedRequests} {t('та сўров нархи номаълум')}</span> : null}</div>
      <Field label="Ойлик бюджет (USD, 0 = чекланмаган)"><Input type="number" step="0.5" min={0} value={s.monthlyBudgetUsd} onChange={(e) => setS({ ...s, monthlyBudgetUsd: e.target.value })} /></Field>
      <Field label="Кунлик сўров лимити"><Input type="number" min={1} value={s.dailyRequestLimit} onChange={(e) => setS({ ...s, dailyRequestLimit: e.target.value })} /></Field>
      <Field label="Дақиқасига сўровлар"><Input type="number" min={1} value={s.perMinuteLimit} onChange={(e) => setS({ ...s, perMinuteLimit: e.target.value })} /></Field>
      <Field label="Жавоб учун максимал токен"><Input type="number" min={256} value={s.maxOutputTokens} onChange={(e) => setS({ ...s, maxOutputTokens: e.target.value })} /></Field>
      <Field label="Кутиш вақти (сония)"><Input type="number" min={5} value={Math.round(s.timeoutMs / 1000)} onChange={(e) => setS({ ...s, timeoutMs: Number(e.target.value) * 1000 })} /></Field>
      <h3>{t('Ташқи AI’га нима юборилади')}</h3>
      <label className="check"><input type="checkbox" checked={s.sendProfile} onChange={(e) => setS({ ...s, sendProfile: e.target.checked })} />{t('Иш профилим, operating manual ва тасдиқланган фактлар')}</label>
      <label className="check"><input type="checkbox" checked={s.sendProject} onChange={(e) => setS({ ...s, sendProject: e.target.checked })} />{t('Танланган лойиҳа картаси')}</label>
      <div className="xs dim">{t('Манба парчалари фақат суҳбатда манба режими ёқилганда юборилади. Ҳар бир суҳбатда «Нима юборилади?» тугмаси билан аниқ матнни кўриш мумкин.')}</div>
      <Btn kind="primary" disabled={busy} onClick={async () => { await run(() => put('/settings/ai', s), 'Сақланди'); reload(); }}>Сақлаш</Btn>
    </div>
    <div className="card stack"><h2>{t('Модел нархлари (USD / 1M токен)')}</h2>
      <div className="xs dim">{t('Anthropic моделлари нархи олдиндан киритилган. OpenAI ва Gemini нархларини провайдер сайтидан олиб киритинг — акс ҳолда харажат «номаълум» деб ҳисобланади.')}</div>
      {Object.entries(s.prices).map(([m, [a, b]]: any) => <div key={m} className="row small mono">{m}: ${a} / ${b}</div>)}
      <div className="row" style={{ flexWrap: 'nowrap' }}><Input placeholder="model-id" value={price.model} onChange={(e) => setPrice({ ...price, model: e.target.value })} /><Input placeholder={t('кириш')} value={price.inp} onChange={(e) => setPrice({ ...price, inp: e.target.value })} /><Input placeholder={t('чиқиш')} value={price.out} onChange={(e) => setPrice({ ...price, out: e.target.value })} />
        <Btn disabled={!price.model || !price.inp || !price.out} onClick={async () => { await run(() => put('/settings/ai', { prices: { [price.model]: [Number(price.inp), Number(price.out)] } }), 'Сақланди'); setPrice({ model: '', inp: '', out: '' }); reload(); }}>+</Btn></div>
      <h3>{t('Охирги сўровлар')}</h3>
      <div className="scroll-x"><table className="tbl"><thead><tr><th>{t('Вақт')}</th><th>{t('Провайдер')}</th><th>{t('Тури')}</th><th>{t('Токен')}</th><th>$</th><th></th></tr></thead><tbody>
        {(usage.data ?? []).slice(0, 30).map((x: any) => <tr key={x.id}><td className="xs">{fmtDate(x.created_at)}</td><td className="xs">{x.provider}/{x.model}</td><td className="xs">{x.kind}</td><td className="xs">{x.input_tokens}/{x.output_tokens}</td><td className="xs">{x.cost_usd != null ? x.cost_usd.toFixed(4) : '?'}</td><td className="xs">{x.ok ? '✓' : <span title={x.error} style={{ color: 'var(--red)' }}>✕ {x.error?.slice(0, 40)}</span>}</td></tr>)}
      </tbody></table></div>
    </div>
  </div>;
}

function Integrations() {
  const rows: [string, string, string][] = [
    ['ChatGPT Project', 'Оддий ChatGPT ичидаги Project’ни ташқи дастурдан бошқариш учун очиқ API йўқ.', 'JARVIS ичида: «Стратег» роли + профил + лойиҳа карталари. Қўлда улаш: «Промптлар»дан «Project instructions»ни нусха олиб ChatGPT Project’га қўйинг; Markdown экспортни Project файлларига юкланг.'],
    ['Gemini Gems', 'Gems’ни API орқали яратиш/бошқариш имконияти йўқ.', 'JARVIS ичида: Content Editor, Ad Creative, Researcher, Script Doctor роллари (Gemini API калити билан ҳам ишлайди). Қўлда: рол кўрсатмасини Gem’га нусха қилинг.'],
    ['NotebookLM', 'Шахсий NotebookLM учун умумий API йўқ.', 'JARVIS ичида: «Манбалар ва ҳужжатлар» — PDF/TXT/MD/URL, бет рақами билан иқтибос, «Фақат манбалар» режими. Қўлда: ўша файлларни NotebookLM’га ҳам юклашингиз мумкин.'],
    ['Claude Code', 'Claude Code — алоҳида терминал/десктоп восита; JARVIS уни масофадан бошқармайди.', 'JARVIS ичида: «Техник ижрочи» роли режа ва код беради (бажармайди). Лойиҳада AGENTS.md/CLAUDE.md қоидалари бор; Claude Code’ни ўзингиз шу папкада ишга туширасиз.'],
    ['Obsidian', 'Obsidian’нинг ўзига хос API’си шарт эмас — vault оддий Markdown папка.', 'Markdown экспорт/импорт ёки «Хотира → Markdown / Obsidian»да vault папкасини улаб синхронлаш.'],
  ];
  return <div className="stack">
    <Alert kind="info">PDF’даги маҳсулотлар (ChatGPT, Gemini, NotebookLM, Claude Code, Obsidian) — бу API интеграциялари эмас. JARVIS уларнинг вазифасини ўз ичида бажаради; AI учун фақат расмий API (OpenAI, Anthropic, Google Gemini) калитлари ишлатилади.</Alert>
    <div className="scroll-x"><table className="tbl"><thead><tr><th>{t('Восита')}</th><th>{t('Ҳақиқий чеклов')}</th><th>{t('JARVIS’даги ечим / қўлда улаш')}</th></tr></thead>
      <tbody>{rows.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td className="small muted">{t(b)}</td><td className="small">{t(c)}</td></tr>)}</tbody></table></div>
  </div>;
}

function Backups() {
  const { data, reload } = useLoad(() => get('/backups'));
  const [restore, setRestore] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const { busy, run } = useAction();
  return <div className="stack">
    <Alert kind="info">Ҳар куни автоматик backup олинади (охирги 14 таси сақланади). Тиклашдан ва Markdown импортдан олдин жорий ҳолат алоҳида backup қилинади. Backup’да API калитлари шифрланган; уларни очиш калити (data/secret.key ёки JARVIS_SECRET) архивга киритилмайди — уни алоҳида сақланг.</Alert>
    <div className="row"><Btn kind="primary" disabled={busy} onClick={async () => { await run(() => post('/backups'), 'Backup яратилди'); reload(); }}>{t('Ҳозир backup олиш')}</Btn></div>
    <div className="card"><h2>{t('Backup’лар')}</h2>
      {(data ?? []).map((b: any) => <div key={b.name} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span className="mono xs ell">{b.name}</span>
        <span className="row"><span className="xs dim">{(b.size / 1024).toFixed(0)} KB</span><Btn sm onClick={() => download(`/backups/${encodeURIComponent(b.name)}`)}>⬇</Btn><Btn sm kind="danger" onClick={() => setRestore(b.name)}>{t('Тиклаш')}</Btn></span></div>)}
      {data && !data.length && <Empty>Ҳали backup йўқ</Empty>}</div>
    <div className="card stack"><h2>{t('Файлдан тиклаш')}</h2><Drop label="jarvis-*.zip backup файлини танланг" accept=".zip" multiple={false} onFiles={(f) => setFile(f[0] ?? null)} />{file && <div className="row small">{file.name}<Btn sm kind="danger" onClick={() => setRestore('__file')}>{t('Тиклаш')}</Btn></div>}</div>
    {restore && <Confirm title="Backup’дан тиклаш" text="Жорий барча маълумотлар backup’даги ҳолат билан алмаштирилади. Олдинги ҳолат автоматик «pre-restore» backup сифатида сақланади." word="ТИКЛАШ" onClose={() => setRestore(null)}
      onYes={async (w) => {
        const r = await run(async () => { if (restore === '__file') { const fd = new FormData(); fd.append('confirm', w!); fd.append('file', file!); return post('/backups-upload/restore', fd); } return post(`/backups/${encodeURIComponent(restore)}/restore`, { confirm: w }); }, 'Тикланди');
        if (r) { reload(); setTimeout(() => window.location.reload(), 800); }
      }} />}
  </div>;
}

function Trash() {
  const { data, reload } = useLoad(() => get('/trash'));
  const { run } = useAction();
  if (!data) return null;
  const sec = (title: string, items: any[], url: (id: number) => string, label: (x: any) => string) => <div className="card"><h2>{t(title)} ({items.length})</h2>
    {items.map((x) => <div key={x.id} className="row between small" style={{ padding: '4px 0' }}><span className="ell">{label(x)}</span><span className="row"><span className="xs dim">{fmtDate(x.deleted_at)}</span><Btn sm onClick={async () => { await run(() => post(url(x.id)), 'Тикланди'); reload(); }}>↺ {t('Тиклаш')}</Btn></span></div>)}
    {!items.length && <div className="small muted">{t('Бўш')}</div>}</div>;
  return <div className="grid g2">
    {sec('Ёзувлар', data.notes, (id) => `/notes/${id}/restore`, (x) => `${x.folder} / ${x.title}`)}
    {sec('Лойиҳалар', data.projects, (id) => `/projects/${id}/restore`, (x) => x.name)}
    {sec('Ҳужжатлар', data.documents, (id) => `/documents/${id}/restore`, (x) => x.name)}
    {sec('Вазифалар', data.tasks, (id) => `/tasks/${id}/restore`, (x) => x.title)}
    <div className="xs dim">{t('Ёзувни бутунлай ўчириш: Хотира → Сават → ёзувни очиб «Бутунлай ўчириш».')}</div>
  </div>;
}

function Log() {
  const { data } = useLoad(() => get('/log'));
  return <div className="card scroll-x"><table className="tbl"><thead><tr><th>{t('Вақт')}</th><th>{t('Амал')}</th><th>{t('Объект')}</th><th>{t('Тафсилот')}</th></tr></thead>
    <tbody>{(data ?? []).map((x: any) => <tr key={x.id}><td className="xs">{fmtDate(x.created_at)}</td><td className="xs mono">{x.action}</td><td className="xs">{x.entity} {x.entity_id}</td><td className="xs muted">{x.detail}</td></tr>)}</tbody></table></div>;
}

function Security({ onLogout }: { onLogout: () => void }) {
  const [f, setF] = useState({ current: '', password: '', p2: '' });
  const { busy, run } = useAction();
  return <div className="grid g2">
    <div className="card stack"><h2>{t('Паролни ўзгартириш')}</h2>
      <Field label="Жорий парол"><Input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
      <Field label="Янги парол (камида 8 белги)"><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Field label="Янги паролни такрорланг"><Input type="password" value={f.p2} onChange={(e) => setF({ ...f, p2: e.target.value })} /></Field>
      <Btn kind="primary" disabled={busy || f.password.length < 8 || f.password !== f.p2} onClick={async () => { const r = await run(() => post('/auth/password', f), 'Парол ўзгарди. Қайта киринг.'); if (r) onLogout(); }}>Ўзгартириш</Btn></div>
    <div className="card stack"><h2>{t('Хавфсизлик қоидалари')}</h2>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {['Кириш пароли scrypt билан хэшланган; сессия cookie HttpOnly, SameSite=Strict.', 'API калитлари серверда шифрланган; браузер, лог ва репозиторийга тушмайди.', 'Ўчириш — аввал саватга; бутунлай ўчириш ва backup тиклаш сўз билан тасдиқланади.', 'Ёзувни таҳрирлашдан олдин эски версия сақланади; vault файлининг устидан ёзишдан олдин нусха олинади.', 'Техник ижрочи буйруқ бажармайди; JARVIS ташқи хабар юбормайди, нашр қилмайди.', 'AI харажатли жараёнлардан олдин тасдиқ сўралади; бюджет ва лимитлар бор.', 'Ҳужжат ичидаги кўрсатмалар тизим буйруғи сифатида бажарилмайди.', 'Ички тармоқ URL’ларига (localhost, 192.168.*) рухсат йўқ.'].map((x) => <li key={x}>{t(x)}</li>)}
      </ul></div>
  </div>;
}
