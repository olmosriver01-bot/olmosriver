import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Bot tokeni, Instagram access token va app secret bazada faqat shifrlangan
 * holda saqlanadi (AES-256-GCM). Kalit INBOX_ENCRYPTION_KEY dan olinadi; u
 * sozlanmagan bo'lsa NEXTAUTH_SECRET dan hosil qilinadi.
 */
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.INBOX_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!raw) throw new Error("INBOX_ENCRYPTION_KEY ёки NEXTAUTH_SECRET созланмаган — махфий маълумотни сақлаб бўлмайди");
  cachedKey = scryptSync(raw, "gulzor-inbox-v1", 32);
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, enc] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Шифрланган қиймат формати нотўғри");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Imzolangan qisqa muddatli holat (OAuth `state`). */
export function signState(data: Record<string, string | number>): string {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

export function verifyState<T extends Record<string, string | number>>(state: string): T | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key()).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof data.exp === "number" && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/** Xato matnlaridan token ko'rinishidagi bo'laklarni olib tashlaydi (logga sir chiqmasligi uchun). */
export function redact(text: string): string {
  return text
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[bot-token]")
    .replace(/(access_token|client_secret|token)=([^&\s"]+)/gi, "$1=[яширилган]")
    .replace(/\b(IG|EAA)[A-Za-z0-9_-]{30,}\b/g, "[token]")
    .slice(0, 400);
}
