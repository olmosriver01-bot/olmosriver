import React, { useState } from 'react';
import { get, post, put, del } from '../api';
import { go } from '../App';
import { t } from '../i18n';
import { useLoad, useAction, Btn, Field, Input, Area, Modal, Alert } from '../ui';

export function Roles() {
  const { data, reload } = useLoad(() => get('/roles'));
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  const save = async () => {
    const r = await run(() => (edit.id ? put(`/roles/${edit.id}`, edit) : post('/roles', edit)), 'Сақланди');
    if (r) { setEdit(null); reload(); }
  };
  return <div className="page">
    <div className="head"><div><h1>{t('AI роллар')}</h1><p>{t('PDF’даги маҳсулот роллари (ChatGPT — стратег, NotebookLM — манба, Gems — креатив роллар, Claude Code — ижрочи) JARVIS ичида роль сифатида ишлайди. Бу API интеграцияси эмас — ҳар бир рол уланган AI провайдер орқали бажарилади.')}</p></div>
      <Btn kind="primary" onClick={() => setEdit({ name: '', purpose: '', system_prompt: '', output_format: '' })}>+ Янги рол</Btn></div>
    <div className="grid g2">{(data ?? []).map((r: any) => <div key={r.id} className="card stack">
      <div className="row between"><h2 style={{ margin: 0 }}>{r.name}</h2>{r.builtin ? <span className="badge b-info">PDF</span> : <span className="badge">{t('ўзим')}</span>}</div>
      <div className="small muted">{r.purpose}</div>
      <details><summary className="xs muted" style={{ cursor: 'pointer' }}>{t('Системали кўрсатма ва натижа формати')}</summary><pre className="card small" style={{ marginTop: 6 }}>{r.system_prompt}</pre>{r.output_format && <pre className="card small" style={{ marginTop: 6 }}>{r.output_format}</pre>}</details>
      <div className="row"><Btn sm onClick={() => setEdit(r)}>Таҳрирлаш</Btn>
        <Btn sm onClick={async () => { const c = await run(() => post('/conversations', { role_id: r.id })); if (c) go(`chat/${c.id}`); }}>✦ {t('Шу рол билан суҳбат')}</Btn>
        {r.builtin ? <Btn sm kind="ghost" onClick={async () => { if (confirm(t('Бошланғич ҳолатга қайтарилсинми?'))) { await run(() => post(`/roles/${r.id}/reset`), 'Қайтарилди'); reload(); } }}>↺</Btn>
          : <Btn sm kind="ghost" onClick={async () => { if (confirm(t('Рол ўчирилсинми?'))) { await run(() => del(`/roles/${r.id}`)); reload(); } }}>🗑</Btn>}</div>
    </div>)}</div>
    {edit && <Modal title={edit.id ? 'Ролни таҳрирлаш' : 'Янги рол'} onClose={() => setEdit(null)} wide><div className="stack">
      <Field label="Номи"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
      <Field label="Вазифаси"><Input value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value })} /></Field>
      <Field label="Системали кўрсатма"><Area rows={10} value={edit.system_prompt} onChange={(e) => setEdit({ ...edit, system_prompt: e.target.value })} /></Field>
      <Field label="Натижа формати"><Area rows={4} value={edit.output_format} onChange={(e) => setEdit({ ...edit, output_format: e.target.value })} /></Field>
      {edit.key === 'tech_executor' && <Alert kind="info">Техник ижрочи буйруқ ёки shell командасини бажармайди — фақат режа ва код матнини беради.</Alert>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="primary" disabled={busy || !edit.name?.trim()} onClick={save}>Сақлаш</Btn></div></div></Modal>}
  </div>;
}
