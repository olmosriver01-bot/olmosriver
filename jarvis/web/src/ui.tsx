import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { t } from './i18n';

// ---------- toast ----------
type Toast = { id: number; text: string; kind: 'ok' | 'err' | 'info' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Math.random();
    setList((l) => [...l, { id, text, kind }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), kind === 'err' ? 7000 : 3500);
  }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts">{list.map((x) => <div key={x.id} className={`toast ${x.kind}`}>{x.text}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

/** Асинхрон амал: хатони toast қилиб кўрсатади, юкланиш ҳолатини беради. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(t(ok), 'ok'); return r; }
    catch (e: any) { toast(e.message || String(e), 'err'); return undefined; }
    finally { setBusy(false); }
  }, [toast]);
  return { busy, run };
}

export function useLoad<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await fn()); setError(null); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

// ---------- primitives ----------
export const T = ({ children }: { children: string }) => <>{t(children)}</>;
export function Btn({ children, kind, sm, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'danger' | 'ghost'; sm?: boolean }) {
  return <button type="button" {...p} className={`btn ${kind ?? ''} ${sm ? 'sm' : ''} ${p.className ?? ''}`}>{typeof children === 'string' ? t(children) : children}</button>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{t(label)}</span>{children}{hint && <span className="xs dim">{t(hint)}</span>}</label>;
}
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={`input ${p.className ?? ''}`} />; }
export function Area(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={`input ${p.className ?? ''}`} />; }
export function Select({ options, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: [string | number, string][] }) {
  return <select {...p} className={`input ${p.className ?? ''}`}>{options.map(([v, l]) => <option key={String(v)} value={v}>{t(l)}</option>)}</select>;
}
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
      <div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{t(title)}</h2><Btn kind="ghost" sm onClick={onClose} aria-label="Ёпиш">✕</Btn></div>
      {children}
    </div>
  </div>;
}
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{typeof children === 'string' ? t(children) : children}</div>;
export const Alert = ({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'err' | 'ok'; children: ReactNode }) => <div className={`alert ${kind}`}>{typeof children === 'string' ? t(children) : children}</div>;

export const KIND_LABEL: Record<string, string> = { fact: 'Тасдиқланган факт', assumption: 'AI тахмини', suggestion: 'Таклиф', decision: 'Қарор', note: 'Ёзув' };
export const DECISION_LABEL: Record<string, string> = { draft: 'Лойиҳа — тасдиқланмаган', accepted: 'Қабул қилинган', rejected: 'Рад этилган' };
export const FOLDER_LABEL: Record<string, string> = {
  '00_INBOX': 'Тезкор ёзувлар', '01_IDENTITY': 'Сиз, бренд, услуб', '02_BUSINESS': 'Бизнес маълумотлари', '03_PROJECTS': 'Лойиҳалар',
  '04_CONTENT': 'Сценарийлар', '05_MARKETING': 'Реклама, таклифлар', '06_KNOWLEDGE': 'Ўрганилган нарсалар', '07_PROMPTS': 'Тайёр промптлар',
  '08_SOP': 'Йўриқномалар', '09_DECISIONS': 'Муҳим қарорлар', '10_ARCHIVE': 'Эски материаллар',
};
export function KindBadge({ kind, decision }: { kind: string; decision?: string | null }) {
  return <span className={`badge b-${kind}`}>{t(kind === 'decision' && decision ? `${KIND_LABEL.decision}: ${DECISION_LABEL[decision]}` : KIND_LABEL[kind] ?? kind)}</span>;
}
export const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtDay = (s?: string | null) => s ? s.split('-').reverse().join('.') : '—';
export const PRIORITY: Record<string, string> = { high: 'Юқори', medium: 'Ўрта', low: 'Паст' };
export const STATUS: Record<string, string> = { todo: 'Қилиниши керак', doing: 'Жараёнда', done: 'Бажарилди' };

// ---------- markdown (хавфсиз: аввал HTML escape) ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="badge">$1</span>')
    .replace(/\[S(\d+)\]/g, '<span class="cite" data-cite="$1">S$1</span>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
}
export function mdToHtml(src: string) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let html = ''; let list: 'ul' | 'ol' | null = null; let inCode = false; let code = ''; let table: string[][] | null = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const closeTable = () => { if (table) { html += '<table>' + table.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`)).join('')}</tr>`).join('') + '</table>'; table = null; } };
  for (const l of lines) {
    if (l.trim().startsWith('```')) { if (inCode) { html += `<pre>${esc(code)}</pre>`; code = ''; inCode = false; } else { closeList(); closeTable(); inCode = true; } continue; }
    if (inCode) { code += l + '\n'; continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) { closeList(); if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue; (table ??= []).push(l.trim().slice(1, -1).split('|').map((c) => c.trim())); continue; }
    closeTable();
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { closeList(); const n = Math.min(4, m[1].length + 1); html += `<h${n}>${inline(m[2])}</h${n}>`; }
    else if ((m = l.match(/^\s*[-*•]\s+(?:\[( |x)\]\s+)?(.*)/))) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${m[1] ? (m[1] === 'x' ? '☑ ' : '☐ ') : ''}${inline(m[2])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^>\s?(.*)/))) { closeList(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
    else if (!l.trim()) { closeList(); }
    else { closeList(); html += `<p>${inline(l)}</p>`; }
  }
  if (inCode) html += `<pre>${esc(code)}</pre>`;
  closeList(); closeTable();
  return html;
}
export function Markdown({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(text || '') }}
    onClick={(e) => { const el = (e.target as HTMLElement).closest('[data-cite]'); if (el && onCite) onCite(Number(el.getAttribute('data-cite'))); }} />;
}

export function Drop({ onFiles, accept, multiple = true, label }: { onFiles: (f: File[]) => void; accept?: string; multiple?: boolean; label: string }) {
  const [on, setOn] = useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  return <div className={`drop ${on ? 'on' : ''}`} onClick={() => ref.current?.click()}
    onDragOver={(e) => { e.preventDefault(); setOn(true); }} onDragLeave={() => setOn(false)}
    onDrop={(e) => { e.preventDefault(); setOn(false); onFiles([...e.dataTransfer.files]); }}>
    {t(label)}
    <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
  </div>;
}

export function Confirm({ title, text, word, onYes, onClose }: { title: string; text: string; word?: string; onYes: (typed?: string) => void; onClose: () => void }) {
  const [v, setV] = useState('');
  return <Modal title={title} onClose={onClose}>
    <p>{t(text)}</p>
    {word && <Field label={`Тасдиқлаш учун «${word}» деб ёзинг`}><Input value={v} onChange={(e) => setV(e.target.value)} autoFocus /></Field>}
    <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
      <Btn onClick={onClose}>Бекор қилиш</Btn>
      <Btn kind="danger" disabled={!!word && v !== word} onClick={() => { onYes(word ? v : undefined); onClose(); }}>Тасдиқлайман</Btn>
    </div>
  </Modal>;
}

/** Рўйхатда «processing» ҳужжат бўлса, 3 сонияда бир янгилайди. */
export function usePollProcessing(list: any[] | null | undefined, reload: () => void) {
  const busy = !!list?.some((d) => d?.status === 'processing');
  useEffect(() => { if (!busy) return; const tm = setInterval(reload, 3000); return () => clearInterval(tm); }, [busy, reload]);
}
