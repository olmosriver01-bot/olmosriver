import React, { useState } from 'react';
import { get, post } from '../api';
import { go } from '../App';
import { t } from '../i18n';
import { useLoad, useAction, Btn, Markdown, Empty, KindBadge, fmtDate, useToast } from '../ui';
import { NoteEditor } from './Memory';

export function FolderPage({ folder, title, desc }: { folder: string; title: string; desc: string }) {
  const { data, reload } = useLoad(() => get(`/notes?folder=${folder}&status=active`), [folder]);
  const [open, setOpen] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const { run } = useAction();
  const toast = useToast();
  return <div className="page">
    <div className="head"><div><h1>{t(title)}</h1><p>{t(desc)}</p></div><Btn kind="primary" onClick={() => setNewOpen(true)}>+ Янги</Btn></div>
    <div className="grid g2">{(data ?? []).map((n: any) => <div key={n.id} className="card stack">
      <div className="row between"><h2 style={{ margin: 0 }}>{n.title}</h2><KindBadge kind={n.kind} /></div>
      <div className="xs dim">{n.source || '—'} · {fmtDate(n.updated_at)}{n.project_name ? ` · ${n.project_name}` : ''}</div>
      <div style={{ maxHeight: 220, overflow: 'auto' }}>{folder === '07_PROMPTS' ? <pre className="small">{n.body}</pre> : <Markdown text={n.body} />}</div>
      <div className="row">
        <Btn sm onClick={() => setOpen(n.id)}>Очиш / таҳрирлаш</Btn>
        <Btn sm onClick={() => { navigator.clipboard?.writeText(n.body).then(() => toast(t('Нусха олинди'))).catch(() => toast(t('Нусха олиб бўлмади'), 'err')); }}>⧉ {t('Нусха')}</Btn>
        {folder === '07_PROMPTS' && <Btn sm onClick={async () => { const c = await run(() => post('/conversations', { title: n.title })); if (c) { sessionStorage.setItem('jarvis.draft', n.body); go(`chat/${c.id}`); } }}>✦ {t('Суҳбатда ишлатиш')}</Btn>}
      </div></div>)}</div>
    {data && !data.length && <Empty>Ҳали йўқ</Empty>}
    {open && <NoteEditor id={open} onClose={() => setOpen(null)} onChange={reload} />}
    {newOpen && <NoteEditor id="new" defaults={{ folder }} onClose={() => setNewOpen(false)} onChange={reload} />}
  </div>;
}
