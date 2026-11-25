import React, { useState } from 'react';
import { get, post } from '../api';
import { go } from '../App';
import { t } from '../i18n';
import { useAction, Area, useLoad, Btn, Alert, Empty, KindBadge, fmtDate, fmtDay, PRIORITY, FOLDER_LABEL } from '../ui';

function QuickInbox({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('');
  const { busy, run } = useAction();
  const save = async () => {
    const title = text.split('\n')[0].slice(0, 80);
    const r = await run(() => post('/notes', { folder: '00_INBOX', title, body: text, source: 'Тезкор ёзув' }), '00_INBOX’га сақланди');
    if (r) { setText(''); onSaved(); }
  };
  return <div className="card stack" style={{ marginBottom: 14 }}>
    <div className="row between"><h2 style={{ margin: 0 }}>{t('Тезкор ёзув (00_INBOX)')}</h2><span className="xs dim">{t('Ғоя, фикр ёки эслатма — кейин саралайсиз')}</span></div>
    <Area rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Ёзинг… (⌘/Ctrl+Enter — сақлаш)')} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) save(); }} />
    <div className="row"><Btn kind="primary" sm disabled={busy || !text.trim()} onClick={save}>Сақлаш</Btn></div>
  </div>;
}

export function Home() {
  const { data: d, error, reload } = useLoad(() => get('/dashboard'));
  if (error) return <div className="page"><Alert kind="err">{error}</Alert></div>;
  if (!d) return <div className="page muted">{t('Юкланмоқда…')}</div>;
  const ai = d.integrations.ai; const u = d.integrations.usage;
  const connected = ai.providers.filter((p: any) => p.connected);
  return <div className="page">
    <div className="head"><div><h1>{t('Салом! JARVIS тайёр.')}</h1><p>{t('Топшириқ → манбалар → таҳлил → натижа → хотира → амал → SOP')}</p></div>
      <div className="row"><Btn kind="primary" onClick={() => go('chat')}>✦ Суҳбат бошлаш</Btn><Btn onClick={() => go('workflows')}>JARVIS BRIEF</Btn></div></div>

    {!d.profileReady && <div style={{ marginBottom: 14 }}><Alert kind="info"><div className="row between"><span>{t('JARVIS сизни ҳали танимайди. Танишув интервьюсини ўтинг — кейин ҳар сафар ўзингизни тушунтирмайсиз.')}</span><Btn sm kind="primary" onClick={() => go('memory/profile')}>Танишувни бошлаш</Btn></div></Alert></div>}
    {!connected.length && !ai.mock && <div style={{ marginBottom: 14 }}><Alert kind="warn"><div className="row between"><span>{t('AI провайдер уланмаган. Лойиҳалар, ҳужжатлар, хотира ва вазифалар ишлайди; AI таҳлил учун API калити керак.')}</span><Btn sm onClick={() => go('settings')}>Улаш</Btn></div></Alert></div>}

    <div className="grid g4" style={{ marginBottom: 14 }}>
      <div className="card"><div className="muted small">{t('Фаол лойиҳалар')}</div><div className="stat">{d.projects.length}</div></div>
      <div className="card"><div className="muted small">{t('Очиқ вазифалар (7 кун)')}</div><div className="stat">{d.tasks.length}</div>{d.overdue > 0 && <span className="badge b-err">{d.overdue} {t('та муддати ўтган')}</span>}</div>
      <div className="card"><div className="muted small">{t('AI сўровлар (ой)')}</div><div className="stat">{u.monthRequests}</div><span className="xs dim">${u.monthCostUsd.toFixed(4)} / ${d.integrations.limits.monthlyBudgetUsd || '∞'}</span></div>
      <div className="card"><div className="muted small">{t('Охирги backup')}</div><div className="small" style={{ marginTop: 6 }}>{d.integrations.backups[0]?.name.slice(7, 26) ?? t('ҳали йўқ')}</div></div>
    </div>

    <QuickInbox onSaved={reload} />

    {(() => { const done = d.checklist.filter((c: any) => c.done).length; const pct = Math.round((done / d.checklist.length) * 100); return pct < 100 && <div className="card" style={{ marginBottom: 14 }}>
      <div className="row between"><h2 style={{ margin: 0 }}>{t('Тизим тайёрлиги (PDF checklist)')}</h2><b>{pct} / 100</b></div>
      <div className="progress" style={{ margin: '10px 0' }}><div style={{ width: `${pct}%` }} /></div>
      <div className="grid g3">{d.checklist.map((c: any) => <label key={c.label} className="check small" onClick={() => !c.done && go(c.link)} style={{ opacity: c.done ? .6 : 1 }}><input type="checkbox" checked={c.done} readOnly />{t(c.label)}</label>)}</div>
    </div>; })()}

    <div className="grid g2">
      <div className="card"><div className="row between"><h2>{t('Фаол лойиҳалар')}</h2><Btn sm onClick={() => go('projects')}>Барчаси</Btn></div>
        <div className="stack">{d.projects.map((p: any) => <div key={p.id} className="item" onClick={() => go(`projects/${p.id}`)}>
          <div className="row between"><span className="t">{p.name}</span><span className="xs dim">{p.docs} {t('манба')} · {p.notes} {t('ёзув')} · {p.open_tasks} {t('вазифа')}</span></div>
          <div className="small muted ell">{p.goal || t('Мақсад киритилмаган')}</div></div>)}
          {!d.projects.length && <Empty>Лойиҳа йўқ</Empty>}</div></div>

      <div className="card"><div className="row between"><h2>{t('Яқин вазифалар')}</h2><Btn sm onClick={() => go('tasks')}>Барчаси</Btn></div>
        <div className="stack">{d.tasks.map((x: any) => <div key={x.id} className="item" onClick={() => go('tasks')}>
          <div className="row between"><span className="t">{x.title}</span><span className={`badge ${x.priority === 'high' ? 'b-err' : x.priority === 'medium' ? 'b-warn' : ''}`}>{t(PRIORITY[x.priority])}</span></div>
          <div className="xs dim">{x.due_date ? `${t('Муддат')}: ${fmtDay(x.due_date)}` : t('Муддатсиз')}{x.project_name ? ` · ${x.project_name}` : ''}</div></div>)}
          {!d.tasks.length && <Empty>Яқин вазифа йўқ</Empty>}</div></div>

      <div className="card"><div className="row between"><h2>{t('Охирги натижалар')}</h2><Btn sm onClick={() => go('memory')}>Хотира</Btn></div>
        <div className="stack">{d.results.map((n: any) => <div key={n.id} className="item" onClick={() => go(`memory/note-${n.id}`)}>
          <div className="row between"><span className="t ell">{n.title}</span><KindBadge kind={n.kind} /></div>
          <div className="xs dim">{n.folder} · {t(FOLDER_LABEL[n.folder] ?? '')} · {fmtDate(n.updated_at)}</div></div>)}
          {!d.results.length && <Empty>Ҳали натижа йўқ</Empty>}</div>
        {d.runs.length > 0 && <><h3 style={{ marginTop: 14 }}>{t('Иш жараёнлари')}</h3>{d.runs.map((r: any) => <div key={r.id} className="row between small" style={{ padding: '4px 0', cursor: 'pointer' }} onClick={() => go(`workflows/${r.id}`)}>
          <span className="ell">{r.title}</span><span className={`badge ${r.status === 'done' ? 'b-ok' : r.status === 'error' ? 'b-err' : 'b-warn'}`}>{r.status}</span></div>)}</>}
      </div>

      <div className="card"><h2>{t('Интеграциялар ҳолати')}</h2>
        <table className="tbl"><tbody>
          {ai.providers.map((p: any) => <tr key={p.id}><td><span className={`dot ${p.connected ? 'on' : 'off'}`} /> {p.name}</td>
            <td className="small">{p.connected ? <>{t('Уланган')} · <span className="mono">{p.model}</span>{p.lastCheck ? (p.lastCheck.ok ? <span className="badge b-ok">{t('текширилган')}</span> : <span className="badge b-err">{t('хато')}</span>) : <span className="badge b-warn">{t('текширилмаган')}</span>}</> : <span className="badge b-warn">{t('Уланиш кутилмоқда — API калити йўқ')}</span>}</td></tr>)}
          {ai.mock && <tr><td>Mock</td><td className="small"><span className="badge b-warn">{t('ТЕСТ режими — сохта жавоблар')}</span></td></tr>}
          <tr><td><span className={`dot ${d.integrations.vault.path ? 'on' : ''}`} /> Obsidian vault</td><td className="small">{d.integrations.vault.path ? <><span className="mono">{d.integrations.vault.path}</span>{d.integrations.vault.conflicts > 0 && <span className="badge b-err">{d.integrations.vault.conflicts} {t('зиддият')}</span>}</> : <span className="muted">{t('Уланмаган (Markdown экспорт/импорт ишлайди)')}</span>}</td></tr>
          <tr><td><span className="dot on" /> {t('Режалаштирувчи')}</td><td className="small">Asia/Tashkent · {t('охирги текширув')}: {fmtDate(d.integrations.scheduler.lastTick)}</td></tr>
          <tr><td>ChatGPT Project · Gemini Gems · NotebookLM</td><td className="small muted">{t('Автоматик API уланиш йўқ — вазифалари JARVIS ичида бажарилади (роллар, манбалар, Markdown экспорт).')}</td></tr>
        </tbody></table>
      </div>
    </div>
  </div>;
}
