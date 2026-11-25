import { toLatin } from '../../shared/translit';
// Интерфейс матнлари кириллда ёзилган; «Лотин» режимида автоматик ўгирилади. Фойдаланувчи маълумотлари ўзгармайди.
let script: 'cyr' | 'lat' = (() => { try { return (localStorage.getItem('jarvis.script') as any) || 'cyr'; } catch { return 'cyr'; } })();
export const getScript = () => script;
export function setScript(s: 'cyr' | 'lat') { script = s; try { localStorage.setItem('jarvis.script', s); } catch {} }
export const t = (s: string) => (script === 'lat' ? toLatin(s) : s);
