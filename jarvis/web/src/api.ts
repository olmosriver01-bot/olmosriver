export class ApiError extends Error { constructor(public status: number, message: string, public code = 'error') { super(message); } }

export async function api<T = any>(method: string, url: string, body?: any): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch('/api' + url, {
    method, credentials: 'same-origin',
    headers: { 'x-requested-with': 'jarvis', ...(isForm || body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && data?.code === 'unauthenticated') window.dispatchEvent(new Event('jarvis:logout'));
    throw new ApiError(res.status, data?.error || `Хато ${res.status}`, data?.code);
  }
  return data as T;
}
export const get = <T = any>(u: string) => api<T>('GET', u);
export const post = <T = any>(u: string, b?: any) => api<T>('POST', u, b ?? {});
export const put = <T = any>(u: string, b?: any) => api<T>('PUT', u, b);
export const del = <T = any>(u: string, b?: any) => api<T>('DELETE', u, b);

export function download(url: string) { const a = document.createElement('a'); a.href = '/api' + url; a.click(); }

/** SSE сўрови (POST). onEvent(event, data) ҳар бир ҳодиса учун чақирилади. */
export async function stream(url: string, body: any, onEvent: (event: string, data: any) => void) {
  const res = await fetch('/api' + url, { method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': 'jarvis', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) window.dispatchEvent(new Event('jarvis:logout'));
    throw new ApiError(res.status, data?.error || `Хато ${res.status}`, data?.code);
  }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      let ev = 'message'; const data: string[] = [];
      for (const l of block.split('\n')) { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) data.push(l.slice(5).trimStart()); }
      if (data.length) onEvent(ev, JSON.parse(data.join('\n')));
    }
  }
}
