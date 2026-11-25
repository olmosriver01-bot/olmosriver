import React, { useEffect, useState } from 'react';
import { get, post, put, del, download } from '../api';
import { go } from '../App';
import { t } from '../i18n';
import { useLoad, useAction, Btn, Field, Input, Area, Empty, Alert, KindBadge, fmtDate, fmtDay, STATUS, Confirm, Modal } from '../ui';
import { UploadBox, DocRow } from './Sources';

const FIELDS: [string, string, string][] = [
  ['goal', 'Мақсад', 'Бу лойиҳа нимага эришиши керак'], ['audience', 'Аудитория', 'Ким учун'], ['offer', 'Таклиф (offer)', 'Нима сотилади ёки таклиф қилинади'],
  ['kpi', 'KPI', 'Муваффақият қандай ўлчанади'], ['materials', 'Материаллар ва манбалар', 'Файл, линк, ҳисоботлар ҳақида изоҳ'], ['next_steps', 'Кейинги қадамлар', ''],
];

export function Projects({ id }: { id?: number }) {
  const [all, setAll] = useState(false);
  const list = useLoad(() => get(`/projects${all ? '?all=1' : ''}`), [all]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const { busy, run } = useAction();
  if (id) return <ProjectDetail id={id} onChange={list.reload} />;
  return <div className="page">
    <div className="head"><div><h1>{t('Лойиҳалар')}</h1><p>{t('Ҳар бир лойиҳа: мақсад, аудитория, таклиф, KPI, манбалар, қарорлар ва кейинги қадамлар.')}</p></div>
      <div className="row"><label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{t('Архивдагилар ҳам')}</label><Btn kind="primary" onClick={() => setCreating(true)}>+ Янги лойиҳа</Btn></div></div>
    <div className="grid g3">{(list.data ?? []).map((p: any) => <div key={p.id} className="card item" onClick={() => go(`projects/${p.id}`)}>
      <div className="row between"><h2 style={{ margin: 0 }}>{p.name}</h2>{p.status === 'archived' && <span className="badge">{t('архив')}</span>}</div>
      <div className="small muted" style={{ margin: '6px 0' }}>{p.goal || t('Мақсад киритилмаган')}</div>
      <div className="row xs dim"><span>▤ {p.docs} {t('манба')}</span><span>◍ {p.notes} {t('ёзув')}</span><span>☑ {p.open_tasks} {t('вазифа')}</span></div></div>)}</div>
    {list.data && !list.data.length && <Empty>Лойиҳа йўқ</Empty>}
    {creating && <Modal title="Янги лойиҳа" onClose={() => setCreating(false)}>
      <Field label="Лойиҳа номи"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <p className="xs dim">{t('Қолган маълумотларни (мақсад, аудитория, KPI…) лойиҳа саҳифасида ўзингиз киритасиз. JARVIS уларни ўйлаб топмайди.')}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="primary" disabled={busy || !name.trim()} onClick={async () => { const p = await run(() => post('/projects', { name }), 'Лойиҳа яратилди'); if (p) { setCreating(false); setName(''); go(`projects/${p.id}`); } }}>Яратиш</Btn></div>
    </Modal>}
  </div>;
}

function ProjectDetail({ id, onChange }: { id: number; onChange: () => void }) {
  const { data: p, reload, error } = useLoad(() => get(`/projects/${id}`), [id]);
  const [form, setForm] = useState<any>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const { busy, run } = useAction();
  useEffect(() => { if (p) setForm(Object.fromEntries(['name', ...FIELDS.map((f) => f[0])].map((k) => [k, p[k] ?? '']))); }, [p]);
  if (error) return <div className="page"><Alert kind="err">{error}</Alert></div>;
  if (!p || !form) return <div className="page muted">{t('Юкланмоқда…')}</div>;
  const dirty = Object.keys(form).some((k) => form[k] !== (p[k] ?? ''));
  const save = async () => { const r = await run(() => put(`/projects/${id}`, form), 'Сақланди'); if (r) { reload(); onChange(); } };
  const decisions = p.notes.filter((n: any) => n.kind === 'decision');
  return <div className="page">
    <div className="head"><div><a className="small" href="#/projects">← {t('Лойиҳалар')}</a><h1>{p.name}</h1><p className="xs">{t('Янгиланган')}: {fmtDate(p.updated_at)}</p></div>
      <div className="row">
        <Btn onClick={() => go(`chat`)} title="">✦ {t('Суҳбат')}</Btn>
        <Btn onClick={() => { sessionStorage.setItem('jarvis.wf', JSON.stringify({ type: 'business', project_id: id })); go('workflows'); }}>{t('Бизнес таҳлили')}</Btn>
        <Btn onClick={() => download(`/projects/${id}/markdown`)}>⬇ .md</Btn>
        <Btn onClick={() => download(`/export/markdown?project=${id}`)}>⬇ vault .zip</Btn>
        <Btn onClick={async () => { await run(() => put(`/projects/${id}`, { status: p.status === 'active' ? 'archived' : 'active' }), 'Ҳолат ўзгарди'); reload(); onChange(); }}>{p.status === 'active' ? 'Архивлаш' : 'Фаоллаштириш'}</Btn>
        <Btn kind="danger" onClick={() => setConfirmDel(true)}>🗑</Btn></div></div>
    <div className="split">
      <div className="card stack">
        <h2>{t('Лойиҳа картаси')}</h2>
        <Field label="Номи"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        {FIELDS.map(([k, l, h]) => <Field key={k} label={l} hint={h}><Area rows={k === 'next_steps' || k === 'materials' ? 4 : 3} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}
        <Btn kind="primary" disabled={!dirty || busy} onClick={save}>{dirty ? 'Сақлаш' : 'Сақланган'}</Btn>
      </div>
      <div className="stack">
        <div className="card"><h2>▤ {t('Манбалар')} ({p.documents.length})</h2>
          <UploadBox projectId={id} onDone={reload} />
          <div className="stack" style={{ marginTop: 10 }}>{p.documents.map((d: any) => <DocRow key={d.id} d={d} onChange={reload} />)}</div></div>
        <div className="card"><div className="row between"><h2>◆ {t('Қарорлар')}</h2><Btn sm onClick={() => go('decisions')}>{t('Барчаси')}</Btn></div>
          {decisions.length ? decisions.map((n: any) => <div key={n.id} className="row between small" style={{ padding: '4px 0' }}><a href={`#/memory/note-${n.id}`}>{n.title}</a><KindBadge kind="decision" decision={n.decision_status} /></div>) : <div className="small muted">{t('Ҳали қарор йўқ')}</div>}</div>
        <div className="card"><h2>◍ {t('Боғланган ёзувлар')}</h2>
          {p.notes.filter((n: any) => n.kind !== 'decision').map((n: any) => <div key={n.id} className="row between small" style={{ padding: '4px 0' }}><a className="ell" href={`#/memory/note-${n.id}`}>{n.title}</a><span className="row"><span className="xs dim">{n.folder}</span><KindBadge kind={n.kind} /></span></div>)}
          {!p.notes.length && <div className="small muted">{t('Ҳали ёзув йўқ')}</div>}</div>
        <div className="card"><div className="row between"><h2>☑ {t('Вазифалар')}</h2><Btn sm onClick={() => go('tasks')}>{t('Барчаси')}</Btn></div>
          {p.tasks.map((x: any) => <div key={x.id} className="row between small" style={{ padding: '4px 0' }}><span className="ell" style={{ textDecoration: x.status === 'done' ? 'line-through' : '' }}>{x.title}</span><span className="xs dim">{t(STATUS[x.status])}{x.due_date ? ` · ${fmtDay(x.due_date)}` : ''}</span></div>)}
          {!p.tasks.length && <div className="small muted">{t('Вазифа йўқ')}</div>}</div>
      </div>
    </div>
    {confirmDel && <Confirm title="Лойиҳани саватга ўтказиш" text="Лойиҳа саватга ўтказилади. Уни Созламалар → Сават бўлимидан тиклаш мумкин." onClose={() => setConfirmDel(false)}
      onYes={async () => { await run(() => del(`/projects/${id}`), 'Саватга ўтказилди'); onChange(); go('projects'); }} />}
  </div>;
}
