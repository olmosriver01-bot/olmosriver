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
