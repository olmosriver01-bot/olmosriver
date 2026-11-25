import React, { useEffect, useState } from 'react';
import { get, post } from './api';
import { t, getScript, setScript } from './i18n';
import { Btn, Field, Input, Alert, useAction } from './ui';
import { Home } from './pages/Home';
import { Chat } from './pages/Chat';
import { Projects } from './pages/Projects';
import { Sources } from './pages/Sources';
import { Memory } from './pages/Memory';
import { Workflows } from './pages/Workflows';
import { Roles } from './pages/Roles';
import { Tasks } from './pages/Tasks';
import { FolderPage } from './pages/FolderPage';
import { Decisions } from './pages/Decisions';
import { Settings } from './pages/Settings';

export const NAV: [string, string, string][] = [
  ['home', '⌂', 'Бош саҳифа'], ['chat', '✦', 'JARVIS билан суҳбат'], ['projects', '◧', 'Лойиҳалар'], ['sources', '▤', 'Манбалар ва ҳужжатлар'],
  ['memory', '◍', 'Хотира ва билимлар'], ['workflows', '✎', 'Контент ва маркетинг'], ['roles', '◎', 'AI роллар'], ['tasks', '☑', 'Вазифалар ва автоматлаштириш'],
  ['prompts', '❝', 'Промптлар'], ['sop', '☰', 'SOP — иш йўриқномалари'], ['decisions', '◆', 'Қарорлар'], ['settings', '⚙', 'Созламалар'],
];

export function go(path: string) { window.location.hash = '#/' + path; }
function useRoute() {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('/');
  const [r, setR] = useState(parse());
  useEffect(() => { const h = () => setR(parse()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return r;
}

function Login({ setup, onDone }: { setup: boolean; onDone: () => void }) {
  const [p, setP] = useState(''); const [p2, setP2] = useState('');
  const { busy, run } = useAction();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setup && p !== p2) return alert(t('Пароллар мос эмас.'));
    const r = await run(() => post(setup ? '/auth/setup' : '/auth/login', { password: p }));
    if (r !== undefined) onDone();
  };
  return <div className="login"><form className="card hl stack" onSubmit={submit}>
    <div className="brand" style={{ padding: 0 }}><div className="logo">J</div><span className="g">JARVIS</span></div>
    <p className="muted" style={{ margin: 0 }}>{t(setup ? 'Биринчи ишга тушириш: дастурга кириш паролини ўрнатинг (камида 8 белги).' : 'Шахсий AI операцион тизимингизга киринг.')}</p>
    <Field label="Парол"><Input type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={p} onChange={(e) => setP(e.target.value)} autoFocus /></Field>
    {setup && <Field label="Паролни такрорланг"><Input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></Field>}
    <Btn kind="primary" disabled={busy || p.length < (setup ? 8 : 1)} onClick={submit as any}>{setup ? 'Паролни сақлаш ва кириш' : 'Кириш'}</Btn>
    {setup && <Alert kind="info">Паролни унутсангиз, серверда JARVIS_PASSWORD муҳит ўзгарувчиси орқали тиклаш мумкин (README).</Alert>}
  </form></div>;
}

export function App() {
  const [auth, setAuth] = useState<{ setup: boolean; authed: boolean } | null>(null);
  const [menu, setMenu] = useState(false);
  const [, force] = useState(0);
  const route = useRoute();
  const check = () => get('/auth/status').then(setAuth).catch(() => setAuth({ setup: true, authed: false }));
  useEffect(() => { check(); const h = () => setAuth((a) => a && { ...a, authed: false }); window.addEventListener('jarvis:logout', h); return () => window.removeEventListener('jarvis:logout', h); }, []);
  useEffect(() => setMenu(false), [route.join('/')]);
  if (!auth) return null;
  if (!auth.authed) return <Login setup={!auth.setup} onDone={check} />;
  const page = route[0] || 'home';
  const arg = route[1];
  const P: Record<string, React.ReactNode> = {
    home: <Home />, chat: <Chat id={arg ? Number(arg) : undefined} />, projects: <Projects id={arg ? Number(arg) : undefined} />, sources: <Sources />,
    memory: <Memory tab={arg} />, workflows: <Workflows id={arg ? Number(arg) : undefined} />, roles: <Roles />, tasks: <Tasks />,
    prompts: <FolderPage folder="07_PROMPTS" title="Промптлар" desc="Тайёр промптлар (07_PROMPTS). Нусха олинг ёки суҳбатда ишлатинг." />,
    sop: <FolderPage folder="08_SOP" title="SOP — иш йўриқномалари" desc="Такрорий жараёнлар учун йўриқномалар (08_SOP)." />,
    decisions: <Decisions />, settings: <Settings onScript={() => force((x) => x + 1)} onLogout={check} />,
  };
  const label = NAV.find((n) => n[0] === page)?.[2] ?? '';
  return <div className="layout">
    <div className="topbar"><Btn kind="ghost" sm onClick={() => setMenu(true)} aria-label="Меню">☰</Btn><div className="title">{t(label)}</div><Btn kind="ghost" sm onClick={() => go('chat')}>✦</Btn></div>
    <nav className={`sidebar ${menu ? 'open' : ''}`}>
      <div className="brand"><div className="logo">J</div><span className="g">JARVIS</span></div>
      {NAV.map(([k, ic, l]) => <button key={k} className={`nav ${page === k ? 'active' : ''}`} onClick={() => go(k)}><span className="ic">{ic}</span>{t(l)}</button>)}
      <div className="spacer" />
      <div className="row" style={{ padding: '8px 10px' }}>
        <Btn sm kind={getScript() === 'cyr' ? 'primary' : undefined} onClick={() => { setScript('cyr'); force((x) => x + 1); }}><>Кирилл</></Btn>
        <Btn sm kind={getScript() === 'lat' ? 'primary' : undefined} onClick={() => { setScript('lat'); force((x) => x + 1); }}><>Lotin</></Btn>
      </div>
    </nav>
    {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 39, background: 'rgba(0,0,0,.4)' }} />}
    <main className="main" key={page}>{P[page] ?? <Home />}</main>
  </div>;
}
