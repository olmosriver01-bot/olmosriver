import React, { useState } from 'react';
import { get, post } from '../api';
import { t } from '../i18n';
import { useLoad, useAction, Btn, Markdown, Empty, KindBadge, fmtDate, Alert } from '../ui';
import { NoteEditor } from './Memory';

export function Decisions() {
  const { data, reload } = useLoad(() => get('/notes?kind=decision&status='));
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const { run } = useAction();
  const groups: [string, string][] = [['draft', 'Тасдиқ кутаётган қарор лойиҳалари'], ['accepted', 'Қабул қилинган қарорлар'], ['rejected', 'Рад этилганлар']];
  return <div className="page">
    <div className="head"><div><h1>{t('Қарорлар')}</h1><p>{t('AI таклифлари ва қарор лойиҳалари фақат сиз тасдиқлагандан кейин «қабул қилинган» бўлади ва 09_DECISIONS’га ўтади.')}</p></div><Btn kind="primary" onClick={() => setOpen('new')}>+ Қарор ёзиш</Btn></div>
    <Alert kind="info">Decision формати (PDF, 5-бет): контекст, вариантлар, танланган вариант ва нега, кейинги қадам. Қабул қилинган қарорлар JARVIS’нинг кейинги жавобларида ҳисобга олинади.</Alert>
    {groups.map(([st, label]) => {
      const items = (data ?? []).filter((n: any) => n.decision_status === st);
      return <div key={st} style={{ marginTop: 18 }}><h2>{t(label)} ({items.length})</h2>
        <div className="grid g2">{items.map((n: any) => <div key={n.id} className="card stack">
          <div className="row between"><b>{n.title}</b><KindBadge kind="decision" decision={n.decision_status} /></div>
          <div className="xs dim">{n.project_name ?? t('Умумий')} · {n.source || '—'} · {fmtDate(n.updated_at)}</div>
          <div style={{ maxHeight: 160, overflow: 'auto' }}><Markdown text={n.body} /></div>
          <div className="row">
            {st !== 'accepted' && <Btn sm kind="primary" onClick={async () => { await run(() => post(`/notes/${n.id}/decision`, { status: 'accepted' }), 'Қарор қабул қилинди'); reload(); }}>✓ {t('Қабул қилиш')}</Btn>}
            {st !== 'rejected' && <Btn sm onClick={async () => { await run(() => post(`/notes/${n.id}/decision`, { status: 'rejected' }), 'Рад этилди'); reload(); }}>✕ {t('Рад этиш')}</Btn>}
            {st !== 'draft' && <Btn sm kind="ghost" onClick={async () => { await run(() => post(`/notes/${n.id}/decision`, { status: 'draft' }), 'Лойиҳага қайтарилди'); reload(); }}>↺</Btn>}
            <Btn sm kind="ghost" onClick={() => setOpen(n.id)}>✎</Btn></div>
        </div>)}</div>
        {!items.length && <Empty>Йўқ</Empty>}</div>;
    })}
    {open && <NoteEditor id={open} defaults={{ folder: '09_DECISIONS', kind: 'decision', body: '## Контекст\n\n## Вариантлар\n\n## Танланган вариант ва нега\n\n## Кейинги қадам\n' }} onClose={() => setOpen(null)} onChange={reload} />}
  </div>;
}
