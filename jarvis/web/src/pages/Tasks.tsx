import React, { useState } from 'react';
import { get, post, put, del } from '../api';
import { go } from '../App';
import { t } from '../i18n';
import { useLoad, useAction, Btn, Field, Input, Area, Select, Modal, Empty, Alert, fmtDate, fmtDay, PRIORITY, STATUS } from '../ui';

const WD = ['Якшанба', 'Душанба', 'Сешанба', 'Чоршанба', 'Пайшанба', 'Жума', 'Шанба'];
const RUN_ST: Record<string, [string, string]> = { done: ['бажарилди', 'b-ok'], late: ['кечикиб бажарилди', 'b-warn'], missed: ['ўтказиб юборилди', 'b-err'], error: ['хато', 'b-err'], running: ['бажарилмоқда', 'b-info'] };

export function Tasks() {
  const [tab, setTab] = useState<'tasks' | 'auto'>('tasks');
  return <div className="page">
    <div className="head"><div><h1>{t('Вазифалар ва автоматлаштириш')}</h1><p>{t('Вазифа → қадамлар → SOP → кейин қайта ишлатиш. Вақт минтақаси: Asia/Tashkent.')}</p></div></div>
    <div className="tabs"><button className={`tab ${tab === 'tasks' ? 'on' : ''}`} onClick={() => setTab('tasks')}>{t('Вазифалар')}</button><button className={`tab ${tab === 'auto' ? 'on' : ''}`} onClick={() => setTab('auto')}>{t('Такрорий ва ҳафталик аудит')}</button></div>
    {tab === 'tasks' ? <TaskList /> : <Automation />}
  </div>;
}

function TaskList() {
  const projects = useLoad(() => get('/projects'));
  const [pf, setPf] = useState(''); const [sf, setSf] = useState('');
  const { data, reload } = useLoad(() => get(`/tasks?${new URLSearchParams({ ...(pf && { project: pf }), ...(sf && { status: sf }) })}`), [pf, sf]);
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  const save = async () => {
    const body = { ...edit, project_id: edit.project_id || null, due_date: edit.due_date || null };
    const r = await run(() => (edit.id ? put(`/tasks/${edit.id}`, body) : post('/tasks', body)), 'Сақланди');
    if (r) { setEdit(null); reload(); }
  };
  return <>
    <div className="row" style={{ marginBottom: 12 }}>
      <Btn kind="primary" onClick={() => setEdit({ title: '', description: '', project_id: pf, due_date: '', priority: 'medium', status: 'todo' })}>+ Янги вазифа</Btn>
      <Select style={{ width: 'auto' }} value={pf} onChange={(e) => setPf(e.target.value)} options={[['', 'Барча лойиҳалар'], ...(projects.data ?? []).map((p: any) => [String(p.id), p.name] as [string, string])]} />
      <Select style={{ width: 'auto' }} value={sf} onChange={(e) => setSf(e.target.value)} options={[['', 'Барча ҳолатлар'], ...Object.entries(STATUS)]} />
    </div>
    <div className="stack">{(data ?? []).map((x: any) => <div key={x.id} className="item" style={{ cursor: 'default' }}>
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <label className="check" style={{ minWidth: 0 }}><input type="checkbox" checked={x.status === 'done'} onChange={async (e) => { await run(() => put(`/tasks/${x.id}`, { status: e.target.checked ? 'done' : 'todo' })); reload(); }} />
          <span className="t ell" style={{ textDecoration: x.status === 'done' ? 'line-through' : '', opacity: x.status === 'done' ? .6 : 1 }}>{x.title}</span></label>
        <span className="row" style={{ flexWrap: 'nowrap' }}><span className={`badge ${x.priority === 'high' ? 'b-err' : x.priority === 'medium' ? 'b-warn' : ''}`}>{t(PRIORITY[x.priority])}</span>
          <Btn sm kind="ghost" onClick={() => setEdit({ ...x, project_id: x.project_id ?? '', due_date: x.due_date ?? '' })}>✎</Btn></span></div>
      <div className="xs dim">{t(STATUS[x.status])}{x.due_date ? ` · ${t('Муддат')}: ${fmtDay(x.due_date)}` : ''}{x.due_date && x.due_date < today && x.status !== 'done' ? ` ⚠️ ${t('муддати ўтган')}` : ''}{x.project_name ? ` · ${x.project_name}` : ''}{x.recurring_id ? ` · ${t('такрорий')}` : ''}
        {x.sop_note_id ? <> · <a href={`#/memory/note-${x.sop_note_id}`}>SOP</a></> : ''}</div>
    </div>)}</div>
    {data && !data.length && <Empty>Вазифа йўқ</Empty>}
    {edit && <Modal title={edit.id ? 'Вазифа' : 'Янги вазифа'} onClose={() => setEdit(null)}><div className="stack">
      <Field label="Номи"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} autoFocus /></Field>
      <Field label="Тавсиф ва қадамлар" hint="Ҳар қатор — битта қадам (SOP яратишда ишлатилади)"><Area rows={5} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
      <div className="grid g2">
        <Field label="Лойиҳа"><Select value={edit.project_id} onChange={(e) => setEdit({ ...edit, project_id: e.target.value })} options={[['', 'Лойиҳасиз'], ...(projects.data ?? []).map((p: any) => [String(p.id), p.name] as [string, string])]} /></Field>
        <Field label="Муддат"><Input type="date" value={edit.due_date} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} /></Field>
        <Field label="Устуворлик"><Select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} options={Object.entries(PRIORITY)} /></Field>
        <Field label="Ҳолат"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} options={Object.entries(STATUS)} /></Field>
      </div>
      <div className="row between">
        <div className="row">{edit.id && <>
          <Btn sm onClick={async () => { const n = await run(() => post(`/tasks/${edit.id}/sop`, { ai: false }), 'SOP шаблони яратилди'); if (n) go(`memory/note-${n.id}`); }}>→ SOP ({t('шаблон')})</Btn>
          <Btn sm onClick={async () => { if (!confirm(t('AI сўрови юборилади (харажат). Давом этилсинми?'))) return; const n = await run(() => post(`/tasks/${edit.id}/sop`, { ai: true }), 'SOP яратилди'); if (n) go(`memory/note-${n.id}`); }}>→ SOP (AI)</Btn>
          <Btn sm kind="danger" onClick={async () => { await run(() => del(`/tasks/${edit.id}`), 'Саватга ўтказилди'); setEdit(null); reload(); }}>🗑</Btn></>}</div>
        <Btn kind="primary" disabled={busy || !edit.title.trim()} onClick={save}>Сақлаш</Btn></div>
    </div></Modal>}
  </>;
}

function Automation() {
  const { data, reload } = useLoad(() => get('/recurring'));
  const projects = useLoad(() => get('/projects'));
  const sops = useLoad(() => get('/notes?folder=08_SOP'));
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  const save = async () => {
    const body = { ...edit, project_id: edit.project_id || null, sop_note_id: edit.sop_note_id || null };
    const r = await run(() => (edit.id ? put(`/recurring/${edit.id}`, body) : post('/recurring', body)), 'Сақланди');
    if (r !== undefined) { setEdit(null); reload(); }
  };
  if (!data) return null;
  const when = (r: any) => `${t(r.freq === 'daily' ? 'Ҳар куни' : r.freq === 'weekly' ? `Ҳар ${WD[r.weekday]}` : `Ҳар ойнинг ${r.monthday}-куни`)} ${r.time}`;
  return <>
    <Alert kind="info"><b>{t('Қачон ва қаерда ишлайди')}:</b> {t(data.scheduler.where)} {t('Охирги текширув')}: {fmtDate(data.scheduler.lastTick)}. {t('Ҳар бир вақт оралиғи фақат бир марта бажарилади (қайта ишга тушганда такрорланмайди).')}</Alert>
    <div className="row" style={{ margin: '12px 0' }}>
      <Btn kind="primary" onClick={() => setEdit({ kind: 'task', title: '', description: '', freq: 'weekly', weekday: 1, monthday: 1, time: '09:00', priority: 'medium', project_id: '', sop_note_id: '', enabled: true })}>+ Такрорий вазифа</Btn>
      <Btn onClick={async () => { const n = await run(() => post('/audit/run'), 'Аудит ҳисоботи 06_KNOWLEDGE’га сақланди'); if (n) go(`memory/note-${n.id}`); }}>{t('Ҳафталик аудитни ҳозир ишга тушириш')}</Btn>
    </div>
    <div className="stack">{data.items.map((r: any) => <div key={r.id} className="card">
      <div className="row between"><div><b>{r.kind === 'audit' ? '📊 ' : '🔁 '}{r.title}</b><div className="xs dim">{when(r)} (Asia/Tashkent){r.project_name ? ` · ${r.project_name}` : ''} · {t('Кейинги')}: {r.nextRun ? r.nextRun.replace('T', ' ') : '—'}</div></div>
        <div className="row"><label className="check"><input type="checkbox" checked={!!r.enabled} onChange={async (e) => { await run(() => put(`/recurring/${r.id}`, { enabled: e.target.checked })); reload(); }} />{t('Ёқилган')}</label>
          <Btn sm kind="ghost" onClick={() => setEdit({ ...r, enabled: !!r.enabled, project_id: r.project_id ?? '', sop_note_id: r.sop_note_id ?? '' })}>✎</Btn>
          <Btn sm kind="ghost" onClick={async () => { if (confirm(t('Ўчирилсинми?'))) { await run(() => del(`/recurring/${r.id}`)); reload(); } }}>🗑</Btn></div></div>
      {r.lastRuns.length > 0 && <div className="row xs" style={{ marginTop: 6 }}>{r.lastRuns.map((j: any) => <span key={j.slot} className={`badge ${RUN_ST[j.status]?.[1]}`} title={j.detail}>{j.slot.replace('T', ' ')} · {t(RUN_ST[j.status]?.[0] ?? j.status)}</span>)}</div>}
    </div>)}</div>
    {edit && <Modal title={edit.id ? 'Такрорий иш' : 'Янги такрорий вазифа'} onClose={() => setEdit(null)}><div className="stack">
      <Field label="Тури"><Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} options={[['task', 'Вазифа яратиш'], ['audit', 'Ҳафталик аудит ҳисоботи']]} /></Field>
      <Field label="Номи"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
      {edit.kind === 'task' && <Field label="Тавсиф"><Area rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>}
      <div className="grid g2">
        <Field label="Даврийлик"><Select value={edit.freq} onChange={(e) => setEdit({ ...edit, freq: e.target.value })} options={[['daily', 'Ҳар куни'], ['weekly', 'Ҳар ҳафта'], ['monthly', 'Ҳар ой']]} /></Field>
        <Field label="Вақт (Тошкент)"><Input type="time" value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} /></Field>
        {edit.freq === 'weekly' && <Field label="Ҳафта куни"><Select value={edit.weekday} onChange={(e) => setEdit({ ...edit, weekday: Number(e.target.value) })} options={WD.map((w, i) => [i, w])} /></Field>}
        {edit.freq === 'monthly' && <Field label="Ой куни"><Input type="number" min={1} max={31} value={edit.monthday} onChange={(e) => setEdit({ ...edit, monthday: Number(e.target.value) })} /></Field>}
        {edit.kind === 'task' && <><Field label="Лойиҳа"><Select value={edit.project_id} onChange={(e) => setEdit({ ...edit, project_id: e.target.value })} options={[['', 'Лойиҳасиз'], ...(projects.data ?? []).map((p: any) => [String(p.id), p.name] as [string, string])]} /></Field>
          <Field label="Устуворлик"><Select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} options={Object.entries(PRIORITY)} /></Field>
          <Field label="SOP (ихтиёрий)"><Select value={edit.sop_note_id} onChange={(e) => setEdit({ ...edit, sop_note_id: e.target.value })} options={[['', '—'], ...(sops.data ?? []).map((n: any) => [String(n.id), n.title] as [string, string])]} /></Field></>}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="primary" disabled={busy || !edit.title.trim()} onClick={save}>Сақлаш</Btn></div>
    </div></Modal>}
  </>;
}
