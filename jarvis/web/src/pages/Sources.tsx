import React, { useState } from 'react';
import { get, post, put, del } from '../api';
import { t } from '../i18n';
import { useLoad, useAction, Btn, Input, Select, Empty, Alert, Drop, Modal, fmtDate, useToast } from '../ui';

export function UploadBox({ projectId, onDone }: { projectId: number | null; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const { busy, run } = useAction();
  const toast = useToast();
  const upload = async (files: File[]) => {
    if (!files.length) return;
    const fd = new FormData();
    if (projectId) fd.append('project_id', String(projectId));
    files.forEach((f) => fd.append('files', f, f.name));
    const r = await run(() => post('/documents/upload', fd));
    if (r) {
      for (const d of r) toast(`${d.name}: ${d.status === 'ready' ? `${t('ўқилди')} (${d.pages || 1} ${t('бет')}, ${d.chars} ${t('белги')})` : d.error}`, d.status === 'ready' ? 'ok' : 'err');
      onDone();
    }
  };
  return <div className="stack">
    <Drop label="PDF, TXT ёки Markdown файлни шу ерга ташланг ёки босинг" accept=".pdf,.txt,.md,.markdown" onFiles={upload} />
    <div className="row" style={{ flexWrap: 'nowrap' }}><Input placeholder="https://… (веб-манба)" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Btn disabled={busy || !url.trim()} onClick={async () => { const d = await run(() => post('/documents/url', { url, project_id: projectId })); if (d) { toast(d.status === 'ready' ? `${d.name}: ${t('қўшилди')}` : d.error, d.status === 'ready' ? 'ok' : 'err'); setUrl(''); onDone(); } }}>{busy ? '…' : 'Қўшиш'}</Btn></div>
    {busy && <div className="xs muted">{t('Ўқилмоқда ва индексланмоқда…')}</div>}
  </div>;
}

export function DocRow({ d, onChange, projects }: { d: any; onChange: () => void; projects?: any[] }) {
  const [open, setOpen] = useState<any>(null);
  const { run } = useAction();
  const st = d.status === 'ready' ? <span className="badge b-ok">{t('ўқилди')}</span> : d.status === 'unreadable' ? <span className="badge b-err">{t('ўқилмади')}</span> : <span className="badge b-err">{t('хато')}</span>;
  return <div className="item" style={{ cursor: 'default' }}>
    <div className="row between"><span className="t ell" style={{ maxWidth: '60%' }}>{d.type === 'url' ? '🔗' : '📄'} {d.name}</span>
      <span className="row">{st}<Btn sm kind="ghost" onClick={async () => setOpen(await get(`/documents/${d.id}`))}>{t('Кўриш')}</Btn>
        <Btn sm kind="ghost" onClick={async () => { if (confirm(t('Ҳужжат саватга ўтказилсинми?'))) { await run(() => del(`/documents/${d.id}`), 'Саватга ўтказилди'); onChange(); } }}>🗑</Btn></span></div>
    <div className="xs dim">{d.type.toUpperCase()}{d.pages ? ` · ${d.pages} ${t('бет')}` : ''} · {d.chars} {t('белги')} · {fmtDate(d.created_at)}{d.project_name !== undefined ? ` · ${d.project_name ?? t('Умумий')}` : ''}</div>
    {d.error && <div className="xs" style={{ color: 'var(--red)' }}>{d.error}</div>}
    {projects && <div className="row xs" style={{ marginTop: 4 }}>{t('Лойиҳа')}: <Select value={d.project_id ?? ''} style={{ width: 'auto', minHeight: 30, padding: '2px 8px' }} onChange={async (e) => { await run(() => put(`/documents/${d.id}`, { project_id: e.target.value || null }), 'Кўчирилди'); onChange(); }} options={[['', 'Умумий'], ...projects.map((p: any) => [p.id, p.name] as [number, string])]} /></div>}
    {open && <Modal title={open.name} onClose={() => setOpen(null)} wide>
      <div className="row small" style={{ marginBottom: 8 }}>{open.url && <a href={open.url} target="_blank" rel="noopener noreferrer">{open.url}</a>}{open.file && <a href={`/api/documents/${open.id}/file`} target="_blank" rel="noopener noreferrer">{t('Асл файлни очиш')}</a>}<span className="dim">{open.chunks.length} {t('парча индексланган')}</span></div>
      {open.error && <Alert kind="err">{open.error}</Alert>}
      <div className="stack">{open.chunks.map((c: any) => <div key={c.id} className="card small"><div className="xs dim">#{c.idx + 1}{c.page ? ` · ${c.page}-${t('бет')}` : ''}</div><pre>{c.text}</pre></div>)}</div>
    </Modal>}
  </div>;
}

export function Sources() {
  const projects = useLoad(() => get('/projects?all=1'));
  const [pid, setPid] = useState<string>('');
  const docs = useLoad(() => get(`/documents${pid ? `?project=${pid}` : ''}`), [pid]);
  const [q, setQ] = useState(''); const [hits, setHits] = useState<any[] | null>(null);
  const { run } = useAction();
  const scope = pid && pid !== 'none' ? Number(pid) : null;
  return <div className="page">
    <div className="head"><div><h1>{t('Манбалар ва ҳужжатлар')}</h1><p>{t('PDF, TXT, Markdown ва веб-саҳифалар матнга ажратилади, индексланади ва жавобларда бет рақами билан кўрсатилади. Ҳар бир лойиҳанинг манбалари алоҳида.')}</p></div></div>
    <div className="split">
      <div className="stack">
        <div className="card stack"><h2>{t('Манба қўшиш')}</h2>
          <Select value={pid === '' ? 'none' : pid} onChange={(e) => setPid(e.target.value)} options={[['none', 'Умумий (лойиҳасиз)'], ...(projects.data ?? []).map((p: any) => [String(p.id), p.name] as [string, string])]} />
          <UploadBox projectId={scope} onDone={docs.reload} />
          <Alert kind="info">Скан қилинган PDF (расм) ўқилмайди — бу ҳолда «ўқилмади» деб белгиланади. Ҳужжат ичидаги буйруқлар JARVIS учун кўрсатма ҳисобланмайди.</Alert>
        </div>
        <div className="card stack"><h2>{t('Манбалардан қидириш')}</h2>
          <div className="row" style={{ flexWrap: 'nowrap' }}><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Калит сўзлар (кирилл ёки лотин)')} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.nextSibling as any)?.click()} />
            <Btn onClick={async () => setHits((await run(() => get(`/search?q=${encodeURIComponent(q)}&project=${scope ?? 'none'}`))) ?? [])}>{t('Излаш')}</Btn></div>
          {hits && (hits.length ? hits.map((h) => <div key={h.chunkId} className="card small"><div className="xs dim">{h.docName}{h.page ? ` · ${h.page}-${t('бет')}` : ''}</div><div>{h.text.slice(0, 300)}…</div></div>) : <div className="small muted">{t('Манбаларда топилмади.')}</div>)}
        </div>
      </div>
      <div className="card"><div className="row between"><h2>{t('Ҳужжатлар')}</h2><Select value={pid} style={{ width: 'auto' }} onChange={(e) => setPid(e.target.value)} options={[['', 'Барчаси'], ['none', 'Умумий'], ...(projects.data ?? []).map((p: any) => [String(p.id), p.name] as [string, string])]} /></div>
        <div className="stack">{(docs.data ?? []).map((d: any) => <DocRow key={d.id} d={d} onChange={docs.reload} projects={projects.data ?? []} />)}</div>
        {docs.data && !docs.data.length && <Empty>Ҳужжат йўқ</Empty>}
      </div>
    </div>
  </div>;
}
