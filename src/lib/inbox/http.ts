/** Tashqi API chaqiruvlari shu yerdan o'tadi — testlarda almashtirish va taymaut uchun. */
export type HttpFn = (url: string, init?: RequestInit) => Promise<Response>;

const realHttp: HttpFn = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
let impl: HttpFn = realHttp;

export function setHttpForTests(fn: HttpFn | null) {
  impl = fn ?? realHttp;
}

export function http(url: string, init?: RequestInit): Promise<Response> {
  return impl(url, init);
}

export function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
}

/**
 * Yuborish natijasi: `definite=false` — so'rov platformaga yetib borgani
 * noma'lum (tarmoq uzilishi, taymaut, 5xx). Bunday holatda avtomatik qayta
 * yuborilmaydi, aks holda mijoz bir xabarni ikki marta olishi mumkin.
 */
export type SendResult =
  | { ok: true; externalId: string; sentAt: Date }
  | { ok: false; definite: boolean; error: string };
