import React, { useEffect, useRef, useState } from 'react';
import { get, post, put, del } from '../api';
import { go } from '../App';
import { t } from '../i18n';
import { useLoad, useAction, Btn, Select, Area, Markdown, Modal, Alert, Empty, fmtDate, Input, Field } from '../ui';

const SAVE_AS: [string, string][] = [['knowledge', 'Билим (06_KNOWLEDGE)'], ['prompt', 'Промпт (07_PROMPTS)'], ['content', 'Контент (04_CONTENT)'], ['decision', 'Қарор лойиҳаси (09_DECISIONS)'], ['sop', 'SOP (08_SOP)'], ['task', 'Вазифа']];

export function Chat({ id }: { id?: number }) {
  const list = useLoad(() => get('/conversations'));
  const meta = useLoad(() => Promise.all([get('/projects'), get('/roles'), get('/settings/ai')]));
  const [conv, setConv] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [saveMsg, setSaveMsg] = useState<any>(null);
  const [cite, setCite] = useState<any>(null);
  const { run } = useAction();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) get(`/conversations/${id}`).then(setConv).catch(() => go('chat'));
    else setConv(null);
  }, [id]);
  useEffect(() => { const d = sessionStorage.getItem('jarvis.draft'); if (d) { sessionStorage.removeItem('jarvis.draft'); setText(d); } }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [conv?.messages?.length, sending]);
  useEffect(() => {
    if (!conv) return;
    get(`/documents?project=${conv.project_id ?? 'none'}`).then(setDocs).catch(() => setDocs([]));
  }, [conv?.project_id, conv?.id]);

  const [projects, roles, ai] = meta.data ?? [[], [], null];
  const providers: [string, string][] = [['', t('Асосий провайдер')], ...((ai?.providers ?? []).filter((p: any) => p.connected).map((p: any) => [p.id, p.name]) as [string, string][]), ...(ai?.mock ? [['mock', 'MOCK (тест)'] as [string, string]] : [])];
  const noProvider = ai && !ai.defaultProvider;

  const newConv = async (extra: any = {}) => {
    const c = await run(() => post('/conversations', { project_id: conv?.project_id ?? null, role_id: conv?.role_id ?? null, source_mode: conv?.source_mode ?? 'assist', ...extra }));
    if (c) { list.reload(); go(`chat/${c.id}`); }
  };
  const update = async (patch: any) => {
    if (!conv) return;
    const c = await run(() => put(`/conversations/${conv.id}`, patch));
    if (c) { setConv(c); list.reload(); }
  };
  const send = async () => {
    if (!text.trim() || sending) return;
    let c = conv;
    if (!c) { c = await run(() => post('/conversations', {})); if (!c) return; }
    const msg = text; setText(''); setSending(true);
    setConv({ ...c, messages: [...(c.messages ?? []), { id: -1, role: 'user', content: msg, citations: [], meta: {} }] });
    try {
      const r = await post(`/conversations/${c.id}/messages`, { text: msg });
      setConv(r.conversation);
    } catch (e: any) {
      const fresh = await get(`/conversations/${c.id}`).catch(() => null);
      if (fresh) setConv(fresh);
    } finally {
      setSending(false); list.reload();
      if (!id || id !== c.id) window.history.replaceState(null, '', `#/chat/${c.id}`);
    }
  };
  const doPreview = async () => { if (!conv) return; const r = await run(() => post(`/conversations/${conv.id}/preview`, { text: text || '(савол)' })); if (r) setPreview(r); };

  return <div className="chat">
    <aside className={`chat-list ${showList ? 'show' : ''}`}>
      <Btn kind="primary" className="" onClick={() => { setShowList(false); newConv(); }} style={{ width: '100%', marginBottom: 10 }}>+ Янги суҳбат</Btn>
      <div className="stack">{(list.data ?? []).map((c: any) => <div key={c.id} className={`item ${conv?.id === c.id ? 'sel' : ''}`} onClick={() => { setShowList(false); go(`chat/${c.id}`); }}>
        <div className="t ell small">{c.title}</div><div className="xs dim ell">{c.project_name ?? t('Умумий')} · {c.role_name ?? t('Ролсиз')} · {fmtDate(c.updated_at)}</div></div>)}
        {!list.data?.length && <div className="xs dim">{t('Суҳбатлар бу ерда сақланади.')}</div>}</div>
    </aside>
    <section className="chat-main">
      <div className="chat-cfg">
        <Btn sm className="hide-desk" onClick={() => setShowList((s) => !s)}>☰ {t('Суҳбатлар')}</Btn>
        {conv ? <>
          <Select value={conv.project_id ?? ''} onChange={(e) => update({ project_id: e.target.value || null })} options={[['', 'Лойиҳасиз (умумий)'], ...projects.map((p: any) => [p.id, p.name] as [number, string])]} title={t('Лойиҳа')} />
          <Select value={conv.role_id ?? ''} onChange={(e) => update({ role_id: e.target.value || null })} options={[['', 'Ролсиз (JARVIS)'], ...roles.map((r: any) => [r.id, r.name] as [number, string])]} title={t('AI рол')} />
          <Select value={conv.source_mode} onChange={(e) => update({ source_mode: e.target.value })} options={[['assist', 'Манбалар + билим'], ['strict', 'Фақат манбалар'], ['off', 'Манбасиз']]} title={t('Манба режими')} />
          <Select value={conv.provider ?? ''} onChange={(e) => update({ provider: e.target.value || null })} options={providers} title={t('Провайдер')} />
          {conv.source_mode !== 'off' && docs.length > 0 && <details className="small"><summary className="muted" style={{ cursor: 'pointer' }}>{t('Манбалар')}: {conv.document_ids.length ? conv.document_ids.length : t('барчаси')}</summary>
            <div className="card stack" style={{ position: 'absolute', zIndex: 20, maxWidth: 360, marginTop: 6 }}>
              <div className="xs dim">{t('Белгиланмаса — лойиҳанинг барча манбалари.')}</div>
              {docs.map((d) => <label key={d.id} className="check"><input type="checkbox" checked={conv.document_ids.includes(d.id)} disabled={d.status !== 'ready' && d.status !== 'processing'}
                onChange={(e) => update({ document_ids: e.target.checked ? [...conv.document_ids, d.id] : conv.document_ids.filter((x: number) => x !== d.id) })} />
                <span className="ell">{d.name}{d.status !== 'ready' ? ` (${t('ўқилмаган')})` : ''}</span></label>)}</div></details>}
          <Btn sm kind="ghost" onClick={doPreview} title={t('Ташқи AI’га нима юборилади?')}>👁 {t('Нима юборилади?')}</Btn>
          <Btn sm kind="ghost" onClick={async () => { if (confirm(t('Суҳбат саватга ўтказилсинми?'))) { await run(() => del(`/conversations/${conv.id}`)); list.reload(); go('chat'); } }}>🗑</Btn>
        </> : <span className="muted small">{t('Лойиҳа, рол ва манбаларни суҳбат очилгач танлайсиз.')}</span>}
      </div>
      <div className="msgs">
        {noProvider && <Alert kind="warn"><div className="row between"><span>{t('Провайдер уланмаган: JARVIS AI жавобини бера олмайди. Сохта жавоб кўрсатилмайди.')}</span><Btn sm onClick={() => go('settings')}>API калитини киритиш</Btn></div></Alert>}
        {!conv?.messages?.length && <Empty><div className="stack" style={{ alignItems: 'center' }}>
          <div style={{ fontSize: 28 }}>✦</div><div>{t('JARVIS’га топшириқ беринг. Сақланган профилингиз ва танланган лойиҳа маълумотлари автоматик ҳисобга олинади.')}</div>
          <div className="xs dim">{t('Масалан: «Шу лойиҳа манбаларидан мижозлар эътирозларини топ» ёки «Бу ғояни Instagram пост қил».')}</div></div></Empty>}
        {conv?.messages?.map((m: any) => <div key={m.id} className={`msg ${m.role} ${m.meta?.error ? 'err' : ''}`}>
          <div className="bubble">{m.role === 'user' ? m.content : <Markdown text={m.content} onCite={(n) => setCite(m.citations.find((c: any) => c.n === n))} />}</div>
          {m.role === 'assistant' && <div className="row xs dim" style={{ marginTop: 4 }}>
            {m.meta?.mock && <span className="badge b-warn">MOCK — {t('ҳақиқий AI эмас')}</span>}
            {m.meta?.provider && !m.meta.mock && <span>{m.meta.provider} · {m.meta.model}{m.meta.costUsd != null ? ` · $${m.meta.costUsd.toFixed(4)}` : ''}</span>}
            {m.meta?.local && <span className="badge">{t('AI чақирилмади')}</span>}
            {m.citations?.filter((c: any) => c.cited).map((c: any) => <span key={c.n} className="cite" onClick={() => setCite(c)}>S{c.n}: {c.docName}{c.page ? `, ${c.page}-${t('бет')}` : ''}{c.ocr ? ' (OCR)' : ''}</span>)}
            {m.citations?.length > 0 && !m.citations.some((c: any) => c.cited) && <span className="badge">{t('Манба белгиланмаган')}</span>}
            {!m.meta?.error && <Btn sm kind="ghost" onClick={() => setSaveMsg(m)}>💾 {t('Сақлаш')}</Btn>}
            {!m.meta?.error && <Btn sm kind="ghost" onClick={() => navigator.clipboard?.writeText(m.content)}>⧉</Btn>}
          </div>}
        </div>)}
        {sending && <div className="msg"><div className="bubble muted">{t('JARVIS ўйламоқда…')}</div></div>}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <Area value={text} placeholder={t('Топшириқ ёки савол… (Enter — юбориш, Shift+Enter — янги қатор)')} rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); send(); } }} onChange={(e) => setText(e.target.value)} />
        <Btn kind="primary" onClick={send} disabled={sending || !text.trim()}>➤</Btn>
      </div>
    </section>

    {preview && <Modal title="Ташқи AI’га юбориладиган маълумот" onClose={() => setPreview(null)} wide>
      <div className="grid g2" style={{ marginBottom: 10 }}>
        <div className="small">{t('Провайдер')}: <b>{preview.summary.provider ?? t('уланмаган')}</b></div>
        <div className="small">{t('Рол')}: <b>{preview.summary.roleName ?? '—'}</b></div>
        <div className="small">{t('Профил ва фактлар')}: <b>{preview.summary.includesProfile ? t('ҳа') : t('йўқ')}</b></div>
        <div className="small">{t('Лойиҳа картаси')}: <b>{preview.summary.includesProject ? t('ҳа') : t('йўқ')}</b></div>
        <div className="small">{t('Манба парчалари')}: <b>{preview.summary.sourceChunks}</b> {preview.summary.sourceDocs.join(', ')}</div>
        <div className="small">{t('Олдинги хабарлар')}: <b>{preview.summary.historyMessages}</b> · {preview.summary.totalChars} {t('белги')}</div>
      </div>
      <Alert kind="info">Профил ва лойиҳа картасини юборишни Созламалар → AI провайдерлар бўлимида ўчириш мумкин. API калитлари ҳеч қачон юборилмайди ва браузерга чиқмайди.</Alert>
      <pre className="card" style={{ marginTop: 10, maxHeight: 380, overflow: 'auto' }}>{preview.system}</pre>
    </Modal>}
    {cite && <Modal title={`S${cite.n}: ${cite.docName}`} onClose={() => setCite(null)}>
      <div className="row small muted" style={{ marginBottom: 8 }}>{cite.page && <span className="badge b-info">{cite.page}-{t('бет')}</span>}{cite.ocr && <span className="badge b-warn">OCR — {t('хато бўлиши мумкин')}</span>}{cite.url && <a href={cite.url} target="_blank" rel="noopener noreferrer">{cite.url}</a>}
        {cite.docType !== 'url' && <a href={`/api/documents/${cite.documentId}/file`} target="_blank" rel="noopener noreferrer">{t('Файлни очиш')}</a>}</div>
      <pre className="card">{cite.snippet}</pre>
    </Modal>}
    {saveMsg && <SaveModal msg={saveMsg} projects={projects} defaultProject={conv?.project_id} onClose={() => setSaveMsg(null)} />}
  </div>;
}

function SaveModal({ msg, projects, defaultProject, onClose }: any) {
  const [as, setAs] = useState('knowledge');
  const [title, setTitle] = useState(msg.content.split('\n').find((l: string) => l.trim())?.replace(/^[#*\s]+/, '').slice(0, 80) ?? '');
  const [pid, setPid] = useState(defaultProject ?? '');
  const { busy, run } = useAction();
  return <Modal title="Натижани сақлаш" onClose={onClose}>
    <div className="stack">
      <Field label="Қаерга"><Select value={as} onChange={(e) => setAs(e.target.value)} options={SAVE_AS} /></Field>
      <Field label="Сарлавҳа"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Лойиҳа"><Select value={pid} onChange={(e) => setPid(e.target.value)} options={[['', 'Лойиҳасиз'], ...projects.map((p: any) => [p.id, p.name])]} /></Field>
      {as === 'decision' && <Alert kind="warn">Қарор «лойиҳа — тасдиқланмаган» ҳолатида сақланади. Уни «Қарорлар» бўлимида фақат сиз қабул қиласиз.</Alert>}
      {as === 'knowledge' && msg.role === 'assistant' && <Alert kind="info">AI натижаси «AI тахмини» сифатида сақланади. Текширгандан кейин «Тасдиқланган факт»га ўзгартиришингиз мумкин.</Alert>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><Btn onClick={onClose}>Бекор қилиш</Btn>
        <Btn kind="primary" disabled={busy} onClick={async () => { const r = await run(() => post(`/messages/${msg.id}/save`, { as, title, project_id: pid || null }), 'Сақланди'); if (r) onClose(); }}>Сақлаш</Btn></div>
    </div>
  </Modal>;
}
