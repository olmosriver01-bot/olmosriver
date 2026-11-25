import React, { useEffect, useState } from 'react';
import { get, post, del } from '../api';
import { go } from '../App';
import { t } from '../i18n';
import { useLoad, useAction, Btn, Field, Area, Select, Empty, Alert, Markdown, Modal, fmtDate, FOLDER_LABEL } from '../ui';

const DESC: Record<string, string> = {
  business: 'Манбалар → аудитория → муаммолар → эътирозлар → фарқланиш → маркетинг имкониятлари → сақланган ҳисобот (03_PROJECTS).',
  content: 'Хом ғоя → Hook → Асосий фикр → Мисол → Хулоса → CTA (04_CONTENT).',
  marketing: 'Идеал мижоз, харид сабаблари, хавотирлар, асосий таклиф, 10 offer, 10 hook, 5 angle, 5 lead magnet, 3 landing, 3 тест реклама (05_MARKETING).',
  brief: 'Мақсад, контекст, манбалар, чекловлар, натижа формати, муддат. Аввал маълумот етарлилиги текширилади.',
};

export function Workflows({ id }: { id?: number }) {
  const { data, reload } = useLoad(() => get('/workflows'));
  const projects = useLoad(() => get('/projects'));
  const ai = useLoad(() => get('/settings/ai'));
  const [type, setType] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ project_id: '', input: '', brief: {}, folder: '' });
  const [confirm, setConfirm] = useState<any>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    const pre = sessionStorage.getItem('jarvis.wf');
    if (pre) { sessionStorage.removeItem('jarvis.wf'); const p = JSON.parse(pre); setType(p.type); setForm((f: any) => ({ ...f, project_id: String(p.project_id ?? '') })); }
  }, []);
  if (id) return <RunView id={id} onChange={reload} />;
  if (!data) return <div className="page muted">{t('Юкланмоқда…')}</div>;
  const noAi = ai.data && !ai.data.defaultProvider;
  const start = async () => {
    const def = data.types[type!];
    const r = await run(() => post('/workflows', { type, project_id: form.project_id || null, input: form.input, brief: form.brief, folder: form.folder || undefined }));
    if (!r) return;
    setConfirm(null); setType(null); setForm({ project_id: '', input: '', brief: {}, folder: '' });
    go(`workflows/${r.id}`);
    void def;
  };
  return <div className="page">
    <div className="head"><div><h1>{t('Контент ва маркетинг')}</h1><p>{t('Тайёр иш жараёнлари. Ҳар бир қадам натижаси сақланади — хатодан кейин бошидан бошлаш шарт эмас.')}</p></div></div>
    {noAi && <div style={{ marginBottom: 14 }}><Alert kind="warn"><div className="row between"><span>{t('AI провайдер уланмаган — жараёнларни яратиш мумкин, лекин AI қадамлари «Провайдер уланмаган» хатоси билан тўхтайди.')}</span><Btn sm onClick={() => go('settings')}>Улаш</Btn></div></Alert></div>}
    <div className="grid g4" style={{ marginBottom: 18 }}>{Object.entries(data.types).map(([k, v]: any) => <div key={k} className={`card item ${type === k ? 'sel' : ''}`} onClick={() => setType(k)}>
      <h2 style={{ margin: 0 }}>{t(v.name)}</h2><div className="small muted" style={{ marginTop: 6 }}>{t(DESC[k])}</div>
      <div className="xs dim" style={{ marginTop: 6 }}>{v.steps.filter((s: any) => s.ai).length} {t('та AI сўрови')}</div></div>)}</div>
    {type && <div className="card stack" style={{ marginBottom: 18 }}>
      <h2>{t(data.types[type].name)}</h2>
      <Field label={data.types[type].needsProject ? 'Лойиҳа (мажбурий — манбалар шу лойиҳадан олинади)' : 'Лойиҳа (ихтиёрий)'}><Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} options={[['', '— танланг —'], ...(projects.data ?? []).map((p: any) => [String(p.id), p.name] as [string, string])]} /></Field>
      {type === 'brief' ? <div className="grid g2">{data.briefFields.map(([k, l]: any) => <Field key={k} label={l}><Area rows={k === 'context' ? 4 : 2} value={form.brief[k] ?? ''} onChange={(e) => setForm({ ...form, brief: { ...form.brief, [k]: e.target.value } })} /></Field>)}
        <Field label="Натижани сақлаш папкаси"><Select value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} options={[['', '06_KNOWLEDGE (стандарт)'], ...Object.keys(FOLDER_LABEL).map((f) => [f, `${f} — ${FOLDER_LABEL[f]}`] as [string, string])]} /></Field></div>
        : data.types[type].needsInput && <Field label="Хом ғоя ёки маълумот"><Area rows={6} value={form.input} onChange={(e) => setForm({ ...form, input: e.target.value })} /></Field>}
      {type === 'marketing' && <Field label="Қўшимча изоҳ (ихтиёрий)"><Area rows={3} value={form.input} onChange={(e) => setForm({ ...form, input: e.target.value })} /></Field>}
      <div className="row"><Btn kind="primary" disabled={busy} onClick={() => setConfirm(data.types[type])}>Бошлаш</Btn><Btn kind="ghost" onClick={() => setType(null)}>Бекор қилиш</Btn></div>
    </div>}
    <div className="card"><h2>{t('Жараёнлар тарихи')}</h2>
      <div className="stack">{data.runs.map((r: any) => <div key={r.id} className="item" onClick={() => go(`workflows/${r.id}`)}>
        <div className="row between"><span className="t ell" style={{ maxWidth: '70%' }}>{r.title}</span><StatusBadge s={r.status} /></div>
        <div className="xs dim">{r.project_name ?? t('Лойиҳасиз')} · {r.steps.filter((s: any) => s.status === 'done').length}/{r.steps.length} {t('қадам')} · {fmtDate(r.updated_at)}</div></div>)}</div>
      {!data.runs.length && <Empty>Ҳали жараён ишга туширилмаган</Empty>}</div>
    {confirm && <Modal title="Тасдиқлаш: AI харажати" onClose={() => setConfirm(null)}>
      <p>{t('Бу жараён')} <b>{confirm.steps.filter((s: any) => s.ai).length} {t('та AI сўрови')}</b> {t('юборади. Ташқи AI провайдерга профилингиз, лойиҳа картаси ва лойиҳа манбаларидан парчалар юборилади. Харажат ойлик бюджет ва лимитлар билан чекланган.')}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Btn onClick={() => setConfirm(null)}>Бекор қилиш</Btn><Btn kind="primary" disabled={busy} onClick={start}>Розиман, яратиш</Btn></div>
    </Modal>}
  </div>;
}

const StatusBadge = ({ s }: { s: string }) => <span className={`badge ${s === 'done' ? 'b-ok' : s === 'error' ? 'b-err' : s === 'running' ? 'b-info' : 'b-warn'}`}>{t({ done: 'тайёр', error: 'хато', running: 'бажарилмоқда', pending: 'кутмоқда', needs_input: 'савол бор' }[s] ?? s)}</span>;

function RunView({ id, onChange }: { id: number; onChange: () => void }) {
  const { data: r, setData, reload } = useLoad(() => get(`/workflows/${id}`), [id]);
  const [answers, setAnswers] = useState('');
  const [running, setRunning] = useState(false);
  const { run } = useAction();
  useEffect(() => { if (r?.status === 'running' && !running) { const tm = setInterval(reload, 2000); return () => clearInterval(tm); } }, [r?.status, running]);
  if (!r) return <div className="page muted">{t('Юкланмоқда…')}</div>;
  const exec = async (a?: string) => {
    setRunning(true);
    setData({ ...r, status: 'running' });
    const poll = setInterval(async () => { try { setData(await get(`/workflows/${id}`)); } catch {} }, 1500);
    const res = await run(() => post(`/workflows/${id}/run`, a ? { answers: a } : {}));
    clearInterval(poll); setRunning(false);
    if (res) { setData(res); setAnswers(''); onChange(); } else reload();
  };
  const done = r.steps.filter((s: any) => s.status === 'done').length;
  const canRun = ['pending', 'error'].includes(r.status) && !running;
  return <div className="page">
    <div className="head"><div><a className="small" href="#/workflows">← {t('Жараёнлар')}</a><h1>{r.title}</h1><p className="xs">{r.project_name ?? t('Лойиҳасиз')} · {fmtDate(r.created_at)}</p></div>
      <div className="row"><StatusBadge s={running ? 'running' : r.status} />
        {canRun && <Btn kind="primary" onClick={() => exec()}>{r.status === 'error' ? '↻ Хатодан давом эттириш' : '▶ Ишга тушириш'}</Btn>}
        {r.result_note_id && <Btn onClick={() => go(`memory/note-${r.result_note_id}`)}>{t('Сақланган натижа')} →</Btn>}
        <Btn kind="ghost" onClick={async () => { if (confirm(t('Жараён ўчирилсинми? Сақланган натижа хотирада қолади.'))) { await run(() => del(`/workflows/${id}`)); onChange(); go('workflows'); } }}>🗑</Btn></div></div>
    <div className="progress" style={{ marginBottom: 14 }}><div style={{ width: `${(done / r.steps.length) * 100}%` }} /></div>
    {r.type === 'brief' && <div className="card" style={{ marginBottom: 14 }}><h2>JARVIS BRIEF</h2><div className="grid g2 small">{Object.entries({ goal: 'Мақсад', context: 'Контекст', sources: 'Манбалар', constraints: 'Чекловлар', format: 'Натижа формати', deadline: 'Муддат / устуворлик' }).map(([k, l]) => <div key={k}><span className="muted">{t(l)}:</span> {r.brief[k] || '—'}</div>)}</div>
      {r.brief.answers && <div className="small" style={{ marginTop: 8 }}><span className="muted">{t('Қўшимча жавоблар')}:</span> {r.brief.answers}</div>}</div>}
    {r.input && <div className="card small" style={{ marginBottom: 14 }}><span className="muted">{t('Кирувчи маълумот')}:</span> {r.input}</div>}
    <div className="steps">{r.steps.map((s: any, i: number) => <div key={s.key} className={`step ${s.status}`}>
      <div className="row between"><b>{i + 1}. {t(s.name)}</b><span className="row">{s.meta?.mock && <span className="badge b-warn">MOCK</span>}{s.meta?.provider && !s.meta.mock && <span className="xs dim">{s.meta.provider}/{s.meta.model}</span>}<StatusBadge s={s.status} /></span></div>
      {s.error && <Alert kind="err">{s.error}</Alert>}
      {s.output && <details open={s.ai && i === r.steps.length - 2 || s.status === 'needs_input'} style={{ marginTop: 6 }}><summary className="xs muted" style={{ cursor: 'pointer' }}>{t('Натижа')}</summary><div style={{ marginTop: 6 }}><Markdown text={s.output} /></div>
        {s.meta?.citations?.length > 0 && <div className="row xs" style={{ marginTop: 6 }}>{s.meta.citations.map((c: any) => <span key={c.n} className="cite">S{c.n}: {c.docName}{c.page ? `, ${c.page}-${t('бет')}` : ''}</span>)}</div>}</details>}
      {s.status === 'needs_input' && <div className="stack" style={{ marginTop: 8 }}><Area rows={4} value={answers} onChange={(e) => setAnswers(e.target.value)} placeholder={t('Саволларга жавоб беринг…')} />
        <Btn kind="primary" disabled={!answers.trim() || running} onClick={() => exec(answers)}>Жавоб бериб давом эттириш</Btn></div>}
    </div>)}</div>
  </div>;
}
