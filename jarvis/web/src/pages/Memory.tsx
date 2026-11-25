import React, { useEffect, useState } from 'react';
import { get, post, put, del, download } from '../api';
import { go } from '../App';
import { t } from '../i18n';
import { useLoad, useAction, Btn, Field, Input, Area, Select, Empty, Alert, Markdown, Modal, KindBadge, KIND_LABEL, FOLDER_LABEL, fmtDate, Drop, Confirm } from '../ui';

const FOLDERS = Object.keys(FOLDER_LABEL);

export function NoteEditor({ id, onClose, onChange, defaults }: { id: number | 'new'; onClose: () => void; onChange: () => void; defaults?: any }) {
  const projects = useLoad(() => get('/projects?all=1'));
  const [n, setN] = useState<any>(null);
  const [edit, setEdit] = useState(id === 'new');
  const [form, setForm] = useState<any>({ folder: '00_INBOX', title: '', body: '', kind: 'note', project_id: '', source: '', source_ref: '', ...defaults });
  const [confirm, setConfirm] = useState<string | null>(null);
  const { busy, run } = useAction();
  const load = async () => { if (id === 'new') return; const x = await get(`/notes/${id}`); setN(x); setForm({ folder: x.folder, title: x.title, body: x.body, kind: x.kind, project_id: x.project_id ?? '', source: x.source, source_ref: x.source_ref }); };
  useEffect(() => { load().catch(() => onClose()); }, [id]);
  const save = async () => {
    const body = { ...form, project_id: form.project_id || null };
    const r = await run(() => (id === 'new' ? post('/notes', body) : put(`/notes/${id}`, body)), 'Сақланди');
    if (r) { onChange(); if (id === 'new') onClose(); else { setEdit(false); load(); } }
  };
  const act = async (fn: () => Promise<any>, msg: string) => { const r = await run(fn, msg); if (r !== undefined) { onChange(); load(); } };
  return <Modal title={id === 'new' ? 'Янги ёзув' : n?.title ?? '…'} onClose={onClose} wide>
    {n && !edit && <div className="stack">
      <div className="row"><KindBadge kind={n.kind} decision={n.decision_status} /><span className="badge">{n.folder}</span>{n.status === 'archived' && <span className="badge">{t('архив')}</span>}{n.deleted_at && <span className="badge b-err">{t('саватда')}</span>}</div>
      <div className="xs dim">{t('Манба')}: {n.source || '—'}{n.source_ref ? ` · ${n.source_ref}` : ''} · {t('Яратилган')}: {fmtDate(n.created_at)} · {t('Янгиланган')}: {fmtDate(n.updated_at)}</div>
      <div className="card"><Markdown text={n.body} /></div>
      <div className="row">
        {!n.deleted_at && <Btn kind="primary" onClick={() => setEdit(true)}>Таҳрирлаш</Btn>}
        {n.kind === 'decision' && n.decision_status !== 'accepted' && !n.deleted_at && <Btn onClick={() => act(() => post(`/notes/${n.id}/decision`, { status: 'accepted' }), 'Қарор қабул қилинди')}>✓ {t('Қарорни қабул қилиш')}</Btn>}
        {n.kind === 'decision' && n.decision_status !== 'rejected' && !n.deleted_at && <Btn onClick={() => act(() => post(`/notes/${n.id}/decision`, { status: 'rejected' }), 'Рад этилди')}>✕ {t('Рад этиш')}</Btn>}
        {n.kind === 'assumption' && !n.deleted_at && <Btn onClick={() => act(() => put(`/notes/${n.id}`, { kind: 'fact' }), 'Тасдиқланган факт сифатида белгиланди')}>✓ {t('Факт деб тасдиқлаш')}</Btn>}
        {!n.deleted_at && <Btn onClick={() => act(() => put(`/notes/${n.id}`, { status: n.status === 'archived' ? 'active' : 'archived' }), n.status === 'archived' ? 'Архивдан чиқарилди' : 'Архивланди')}>{n.status === 'archived' ? 'Архивдан чиқариш' : 'Архивлаш'}</Btn>}
        <Btn onClick={() => download(`/notes/${n.id}/markdown`)}>⬇ .md</Btn>
        {!n.deleted_at ? <Btn kind="danger" onClick={() => act(() => del(`/notes/${n.id}`), 'Саватга ўтказилди')}>🗑 {t('Саватга')}</Btn>
          : <><Btn onClick={() => act(() => post(`/notes/${n.id}/restore`), 'Тикланди')}>↺ {t('Тиклаш')}</Btn><Btn kind="danger" onClick={() => setConfirm('purge')}>{t('Бутунлай ўчириш')}</Btn></>}
      </div>
      {n.versions?.length > 0 && <details><summary className="small muted" style={{ cursor: 'pointer' }}>{t('Олдинги версиялар')} ({n.versions.length})</summary>
        <div className="stack" style={{ marginTop: 8 }}>{n.versions.map((v: any) => <div key={v.id} className="card small"><div className="row between"><span className="xs dim">{fmtDate(v.saved_at)} · {v.reason}</span>
          <Btn sm onClick={() => act(() => post(`/notes/${n.id}/versions/${v.id}/restore`), 'Версия тикланди')}>↺ {t('Шу версияни тиклаш')}</Btn></div><pre style={{ maxHeight: 160, overflow: 'auto' }}>{v.body}</pre></div>)}</div></details>}
    </div>}
    {edit && <div className="stack">
      <div className="grid g3">
        <Field label="Папка"><Select value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} options={FOLDERS.map((f) => [f, `${f} — ${FOLDER_LABEL[f]}`])} /></Field>
        <Field label="Тури" hint="AI таклифи қарор сифатида автоматик қабул қилинмайди"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={Object.entries(KIND_LABEL)} /></Field>
        <Field label="Лойиҳа"><Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} options={[['', 'Лойиҳасиз'], ...(projects.data ?? []).map((p: any) => [p.id, p.name])]} /></Field>
      </div>
      <Field label="Сарлавҳа"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></Field>
      <Field label="Матн (Markdown)"><Area rows={14} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
      <div className="grid g2"><Field label="Манба"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder={t('Масалан: ўзим, мижоз суҳбати, ҳисобот')} /></Field>
        <Field label="Манба ҳаволаси"><Input value={form.source_ref} onChange={(e) => setForm({ ...form, source_ref: e.target.value })} /></Field></div>
      {form.kind === 'decision' && <Alert kind="info">Қарор «лойиҳа» ҳолатида сақланади; кейин «Қарорни қабул қилиш» тугмаси билан тасдиқлайсиз.</Alert>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>{id !== 'new' && <Btn onClick={() => setEdit(false)}>Бекор қилиш</Btn>}<Btn kind="primary" disabled={busy || !form.title.trim()} onClick={save}>Сақлаш</Btn></div>
    </div>}
    {confirm === 'purge' && <Confirm title="Бутунлай ўчириш" text="Ёзув ва унинг барча версиялари қайтариб бўлмайдиган тарзда ўчирилади (backup’дан тиклаш мумкин)." word="ЎЧИРИШ" onClose={() => setConfirm(null)}
      onYes={async (w) => { const r = await run(() => del(`/notes/${id}/purge`, { confirm: w }), 'Ўчирилди'); if (r !== undefined) { onChange(); onClose(); } }} />}
  </Modal>;
}

export function NotesList({ query, onOpen }: { query: string; onOpen: (id: number) => void }) {
  const { data } = useLoad(() => get(`/notes?${query}`), [query]);
  if (!data) return <div className="muted small">{t('Юкланмоқда…')}</div>;
  if (!data.length) return <Empty>Ёзув йўқ</Empty>;
  return <div className="stack">{data.map((n: any) => <div key={n.id} className="item" onClick={() => onOpen(n.id)}>
    <div className="row between"><span className="t ell" style={{ maxWidth: '65%' }}>{n.title}</span><KindBadge kind={n.kind} decision={n.decision_status} /></div>
    <div className="xs dim ell">{n.folder}{n.project_name ? ` · ${n.project_name}` : ''} · {n.source || t('манбасиз')} · {fmtDate(n.updated_at)}{n.status === 'archived' ? ` · ${t('архив')}` : ''}</div>
  </div>)}</div>;
}

export function Memory({ tab }: { tab?: string }) {
  const noteId = tab?.startsWith('note-') ? Number(tab.slice(5)) : null;
  const view = tab === 'profile' ? 'profile' : tab === 'io' ? 'io' : 'notes';
  const [folder, setFolder] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | 'new' | null>(noteId);
  const [v, setV] = useState(0);
  useEffect(() => { if (noteId) setOpen(noteId); }, [noteId]);
  const query = new URLSearchParams({ ...(folder && { folder }), ...(kind && { kind }), ...(status && status !== 'trash' && { status }), ...(status === 'trash' && { trash: '1' }), ...(q && { q }), v: String(v) }).toString();
  return <div className="page">
    <div className="head"><div><h1>{t('Хотира ва билимлар')}</h1><p>{t('Obsidian тузилмасидаги хотира: тасдиқланган фактлар, AI тахминлари, таклифлар ва қарорлар алоҳида.')}</p></div>
      <div className="row"><Btn kind="primary" onClick={() => setOpen('new')}>+ Янги ёзув</Btn></div></div>
    <div className="tabs">
      <button className={`tab ${view === 'notes' ? 'on' : ''}`} onClick={() => go('memory')}>{t('Ёзувлар')}</button>
      <button className={`tab ${view === 'profile' ? 'on' : ''}`} onClick={() => go('memory/profile')}>{t('Менинг иш профилим')}</button>
      <button className={`tab ${view === 'io' ? 'on' : ''}`} onClick={() => go('memory/io')}>{t('Markdown / Obsidian')}</button>
    </div>
    {view === 'notes' && <div className="split">
      <div className="card stack">
        <Input placeholder={t('Қидириш…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} options={[['', 'Барча турлар'], ...Object.entries(KIND_LABEL)]} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[['active', 'Фаол'], ['archived', 'Архив'], ['', 'Фаол + архив'], ['trash', 'Сават']]} />
        <div className="stack" style={{ gap: 2 }}>
          <button className={`nav ${folder === '' ? 'active' : ''}`} onClick={() => setFolder('')}>{t('Барча папкалар')}</button>
          {FOLDERS.map((f) => <button key={f} className={`nav ${folder === f ? 'active' : ''}`} onClick={() => setFolder(f)}><span className="mono xs" style={{ color: 'var(--violet)' }}>{f.slice(0, 2)}</span> {f.slice(3)}<span className="xs dim" style={{ marginLeft: 'auto' }}>{t(FOLDER_LABEL[f])}</span></button>)}
        </div>
      </div>
      <div><NotesList query={query} onOpen={setOpen} /></div>
    </div>}
    {view === 'profile' && <Profile />}
    {view === 'io' && <ImportExport />}
    {open && <NoteEditor id={open} onClose={() => { setOpen(null); if (noteId) go('memory'); }} onChange={() => setV((x) => x + 1)} />}
  </div>;
}

function Profile() {
  const { data: st, setData, reload } = useLoad(() => get('/interview'));
  const notes = useLoad(() => get('/notes?folder=01_IDENTITY'));
  const [ans, setAns] = useState('');
  const [mode, setMode] = useState<'one' | 'all'>('one');
  const [all, setAll] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  const { busy, run } = useAction();
  useEffect(() => { if (st) setAll(st.answers); }, [st?.answered]);
  if (!st) return null;
  const answer = async (key: string, a: string | null) => { const r = await run(() => post('/interview/answer', { key, answer: a })); if (r) { setData(r); setAns(''); } };
  const build = async () => { const r = await run(() => post('/interview/build'), '«Менинг иш профилим» ва «Jarvis operating manual» сақланди'); if (r) notes.reload(); };
  const pct = Math.round((st.answered / st.total) * 100);
  return <div className="split">
    <div className="card stack">
      <h2>{t('Танишув интервьюси')}</h2>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <div className="xs dim">{st.answered} / {st.total} {t('савол')} · {t('истаган вақт тўхтатиб, кейин давом эттиришингиз мумкин')}</div>
      <div className="tabs"><button className={`tab ${mode === 'one' ? 'on' : ''}`} onClick={() => setMode('one')}>{t('Биттадан')}</button><button className={`tab ${mode === 'all' ? 'on' : ''}`} onClick={() => setMode('all')}>{t('Барча жавобларни таҳрирлаш')}</button></div>
      {mode === 'one' && (st.current ? <>
        <div className="xs" style={{ color: 'var(--cyan)' }}>{t(st.current.section)}</div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{t(st.current.q)}</div>
        <Area rows={5} value={ans} onChange={(e) => setAns(e.target.value)} autoFocus placeholder={t('Жавобингиз…')} />
        <div className="row"><Btn kind="primary" disabled={busy || !ans.trim()} onClick={() => answer(st.current.key, ans)}>Кейингиси →</Btn><Btn onClick={() => answer(st.current.key, null)}>Ўтказиб юбориш</Btn></div>
      </> : <Alert kind="ok">{st.skipped.length ? `${t('Барча саволлар кўрилди')} (${st.skipped.length} ${t('та ўтказиб юборилган')}).` : t('Барча саволларга жавоб берилди.')}</Alert>)}
      {mode === 'one' && st.skipped.length > 0 && !st.current && <Btn onClick={async () => setData(await post('/interview/reset-skipped'))}>Ўтказиб юборилганларга қайтиш</Btn>}
      {mode === 'all' && <div className="stack">{st.questions.map((q: any) => <Field key={q.key} label={q.q}><Area rows={2} value={all[q.key] ?? ''} onChange={(e) => setAll({ ...all, [q.key]: e.target.value })} /></Field>)}
        <Btn kind="primary" disabled={busy} onClick={async () => { for (const q of st.questions) if ((all[q.key] ?? '') !== (st.answers[q.key] ?? '')) await post('/interview/answer', { key: q.key, answer: all[q.key] || null }); reload(); }}>Жавобларни сақлаш</Btn></div>}
      <Btn kind="primary" disabled={busy || !st.answered} onClick={build}>Профил ва Operating manual яратиш / янгилаш</Btn>
      <div className="xs dim">{t('Профил жавобларингиздан сўзма-сўз тузилади (AI ишлатилмайди). Олдинги версия сақланиб қолади.')}</div>
    </div>
    <div className="stack">{(notes.data ?? []).map((n: any) => <div key={n.id} className="card"><div className="row between"><h2 style={{ margin: 0 }}>{n.title}</h2><Btn sm onClick={() => setOpen(n.id)}>Таҳрирлаш</Btn></div><div className="xs dim">{fmtDate(n.updated_at)}</div>
      <div style={{ maxHeight: 420, overflow: 'auto', marginTop: 8 }}><Markdown text={n.body} /></div></div>)}
      {notes.data && !notes.data.length && <Empty>Профил ҳали яратилмаган. Интервьюга жавоб беринг ва «яратиш» тугмасини босинг.</Empty>}</div>
    {open && <NoteEditor id={open} onClose={() => setOpen(null)} onChange={notes.reload} />}
  </div>;
}

function ImportExport() {
  const vault = useLoad(() => get('/vault'));
  const [path, setPath] = useState('');
  const [report, setReport] = useState<any>(null);
  const { busy, run } = useAction();
  useEffect(() => { if (vault.data?.path) setPath(vault.data.path); }, [vault.data?.path]);
  return <div className="grid g2">
    <div className="card stack"><h2>⬇ {t('Markdown экспорт')}</h2>
      <p className="small muted">{t('Барча ёзувлар ва лойиҳа карталари 00_INBOX … 10_ARCHIVE тузилмасида zip архив бўлади. Архивни очиб, Obsidian’да vault сифатида очишингиз мумкин.')}</p>
      <Btn kind="primary" onClick={() => download('/export/markdown')}>Vault’ни .zip қилиб юклаб олиш</Btn></div>
    <div className="card stack"><h2>⬆ {t('Markdown импорт')}</h2>
      <p className="small muted">{t('.md файллар ёки vault .zip. jarvis_id бўлган ёзувлар янгиланади (эски версия сақланади), қолганлари янги ёзув бўлади. Импортдан олдин автоматик backup олинади.')}</p>
      <Drop label=".md ёки .zip файлларни ташланг" accept=".md,.zip,.markdown" onFiles={async (files) => {
        const fd = new FormData(); files.forEach((f) => fd.append('files', f, f.name));
        const r = await run(() => post('/import/markdown', fd)); if (r) setReport(r);
      }} />
      {report && <Alert kind="ok">{t('Янги')}: {report.created} · {t('Янгиланди')}: {report.updated} · {t('Ўзгармаган')}: {report.unchanged} · {t('Лойиҳа')}: {report.projects}{report.skipped.length ? ` · ${t('Ўтказилди')}: ${report.skipped.join(', ')}` : ''}</Alert>}</div>
    <div className="card stack" style={{ gridColumn: '1 / -1' }}><h2>◍ {t('Obsidian vault билан тўғридан-тўғри синхронлаш (ихтиёрий)')}</h2>
      <Alert kind="info">JARVIS фақат сиз кўрсатган битта папкага киради. Папка JARVIS сервери ишлаётган компьютерда бўлиши керак. Ташқарида ўзгарган файлнинг устидан ёзилмайди — зиддият сифатида кўрсатилади; устидан ёзишдан олдин нусха data/backups/vault/ га сақланади.</Alert>
      <div className="row" style={{ flexWrap: 'nowrap' }}><Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/siz/Documents/Obsidian/JARVIS" />
        <Btn disabled={busy} onClick={async () => { await run(() => post('/vault/path', { path }), 'Vault уланди'); vault.reload(); }}>Улаш</Btn>
        {vault.data?.path && <Btn kind="ghost" onClick={async () => { await run(() => post('/vault/path', { path: null }), 'Узилди'); setPath(''); vault.reload(); }}>Узиш</Btn>}</div>
      {vault.data?.path && <div className="row"><Btn kind="primary" disabled={busy} onClick={async () => { const r = await run(() => post('/vault/sync')); if (r) { setReport(null); vault.reload(); alert(`${t('Ёзилди')}: ${r.written}\n${t('Vault’дан олинди')}: ${r.imported}\n${t('Vault’даги янги файллар')}: ${r.newFromVault}\n${t('Ўзгармаган')}: ${r.unchanged}\n${t('Зиддиятлар')}: ${r.conflicts}${r.errors.length ? '\n\n' + r.errors.join('\n') : ''}`); } }}>⟳ {t('Синхронлаш')}</Btn>
        <span className="xs dim">{t('Охирги синхронлаш')}: {fmtDate(vault.data.lastSync)}</span></div>}
      {vault.data?.conflicts?.map((c: any) => <div key={c.id} className="card stack"><div className="row between"><b>{c.title}</b><span className="badge b-err">{t('зиддият')}</span></div><div className="xs dim mono">{c.path}</div>
        <div className="grid g2"><div><div className="xs muted">JARVIS</div><pre className="card small" style={{ maxHeight: 200, overflow: 'auto' }}>{c.note_body}</pre></div><div><div className="xs muted">Vault {t('файли')}</div><pre className="card small" style={{ maxHeight: 200, overflow: 'auto' }}>{c.file_content}</pre></div></div>
        <div className="row">{[['keep_app', 'JARVIS версиясини қолдириш'], ['keep_file', 'Vault версиясини олиш'], ['keep_both', 'Иккаласини сақлаш']].map(([k, l]) => <Btn sm key={k} onClick={async () => { await run(() => post(`/vault/conflicts/${c.id}`, { resolution: k }), 'Ҳал қилинди'); vault.reload(); }}>{l}</Btn>)}</div></div>)}
    </div>
  </div>;
}
