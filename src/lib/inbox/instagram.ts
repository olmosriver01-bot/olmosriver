import { prisma } from "@/lib/prisma";
import { appBaseUrl, http, type SendResult } from "./http";
import { decryptSecret, encryptSecret, hmacSha256Hex, redact, safeEqual, sha256 } from "./crypto";
import { ingestEvent, setChannelStatus, type IncomingEvent } from "./core";

/**
 * Instagram API with Instagram Login (Business Login). Parol/cookie emas —
 * faqat akkaunt egasi Instagram oynasida bergan rasmiy ruxsat (OAuth token).
 */
const GRAPH = "https://graph.instagram.com";
const VERSION = process.env.IG_GRAPH_VERSION || "v24.0";
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];
export const IG_WEBHOOK_FIELDS = ["messages", "messaging_postbacks", "messaging_seen", "message_reactions", "message_edit"];

export function instagramWebhookUrl(companyId: string): string {
  return `${appBaseUrl()}/api/webhooks/instagram/${companyId}`;
}

export function instagramRedirectUri(): string {
  return `${appBaseUrl()}/api/inbox/instagram/callback`;
}

export function instagramAuthorizeUrl(appId: string, state: string): string {
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: instagramRedirectUri(),
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${q.toString()}`;
}

type GraphError = { message?: string; code?: number; type?: string; error_subcode?: number };

async function graph<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; definite: boolean; code: number; message: string }> {
  let res: Response;
  try {
    res = await http(url, init);
  } catch (e) {
    return { ok: false, definite: false, code: 0, message: redact(`Тармоқ хатоси: ${e instanceof Error ? e.message : "номаълум"}`) };
  }
  let body: (T & { error?: GraphError; error_message?: string; error_type?: string }) | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok && body && !body.error) return { ok: true, data: body };
  const err = body?.error;
  return {
    ok: false,
    definite: res.status < 500 && body !== null,
    code: err?.code ?? res.status,
    message: redact(err?.message ?? body?.error_message ?? `HTTP ${res.status}`),
  };
}

function bearer(token: string): RequestInit["headers"] {
  return { authorization: `Bearer ${token}` };
}

/** OAuth `code` ni uzoq muddatli tokenga almashtiradi, webhookka obuna qiladi va profilni saqlaydi. */
export async function completeInstagramConnect(companyId: string, code: string, now: Date = new Date()) {
  const settings = await prisma.inboxSettings.findUnique({ where: { companyId } });
  if (!settings?.igAppId || !settings.igAppSecretEnc) throw new Error("Instagram илова ID ва махфий калити созланмаган");
  const appSecret = decryptSecret(settings.igAppSecretEnc);

  const form = new URLSearchParams({
    client_id: settings.igAppId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: instagramRedirectUri(),
    code,
  });
  const short = await graph<{ access_token?: string; user_id?: string | number; data?: { access_token: string; user_id: string | number }[] }>(
    "https://api.instagram.com/oauth/access_token",
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() }
  );
  if (!short.ok) throw new Error(`Instagram рухсат кодини қабул қилмади: ${short.message}`);
  const shortToken = short.data.access_token ?? short.data.data?.[0]?.access_token;
  if (!shortToken) throw new Error("Instagram токен қайтармади");

  const long = await graph<{ access_token: string; expires_in: number }>(
    `${GRAPH}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret, access_token: shortToken })}`
  );
  if (!long.ok) throw new Error(`Узоқ муддатли токен олинмади: ${long.message}`);
  const token = long.data.access_token;

  const me = await graph<{ id: string; user_id?: string; username?: string; name?: string; account_type?: string }>(
    `${GRAPH}/${VERSION}/me?fields=user_id,username,name,account_type`,
    { headers: bearer(token) }
  );
  if (!me.ok) throw new Error(`Профил маълумоти олинмади: ${me.message}`);

  const sub = await graph<{ success?: boolean }>(
    `${GRAPH}/${VERSION}/me/subscribed_apps?${new URLSearchParams({ subscribed_fields: IG_WEBHOOK_FIELDS.join(",") })}`,
    { method: "POST", headers: bearer(token) }
  );

  const externalId = String(me.data.user_id ?? me.data.id);
  const data = {
    name: me.data.name || me.data.username || externalId,
    username: me.data.username ?? null,
    altExternalId: String(me.data.id),
    tokenEnc: encryptSecret(token),
    tokenExpiresAt: new Date(now.getTime() + long.data.expires_in * 1000),
    tokenRefreshedAt: now,
    canReply: true,
  };
  const channel = await prisma.inboxChannel.upsert({
    where: { companyId_platform_externalId: { companyId, platform: "INSTAGRAM", externalId } },
    update: data,
    create: { companyId, platform: "INSTAGRAM", externalId, status: "PENDING", ...data },
  });
  if (sub.ok) await setChannelStatus(channel.id, "CONNECTED", null, now);
  else await setChannelStatus(channel.id, "ERROR", `Webhook обунаси ўрнатилмади: ${sub.message}`, now);
  return channel.id;
}

export async function verifyInstagramSignature(companyId: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const s = await prisma.inboxSettings.findUnique({ where: { companyId }, select: { igAppSecretEnc: true } });
  if (!s?.igAppSecretEnc) return false;
  const expected = hmacSha256Hex(decryptSecret(s.igAppSecretEnc), rawBody);
  return safeEqual(expected, header.slice("sha256=".length));
}

type IgMessaging = {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    attachments?: { type: string }[];
  };
  message_edit?: { mid: string; text?: string; num_edit?: number };
  reaction?: { mid: string; action: "react" | "unreact"; reaction?: string; emoji?: string };
};

export type IgWebhookBody = { object?: string; entry?: { id: string; time?: number; messaging?: IgMessaging[] }[] };

export type IgWorkItem = { dedupeKey: string; accountId: string; item: IgMessaging };

export function splitInstagramPayload(companyId: string, body: IgWebhookBody): IgWorkItem[] {
  if (body.object !== "instagram") return [];
  const out: IgWorkItem[] = [];
  for (const entry of body.entry ?? []) {
    for (const item of entry.messaging ?? []) {
      out.push({ dedupeKey: `ig:${companyId}:${sha256(JSON.stringify(item))}`, accountId: String(entry.id), item });
    }
  }
  return out;
}

async function fetchIgProfile(token: string, igsid: string): Promise<{ name: string | null; username: string | null }> {
  const r = await graph<{ name?: string; username?: string }>(`${GRAPH}/${VERSION}/${igsid}?fields=name,username`, { headers: bearer(token) });
  return r.ok ? { name: r.data.name ?? null, username: r.data.username ?? null } : { name: null, username: null };
}

export async function handleInstagramItem(companyId: string, work: IgWorkItem, now: Date = new Date()): Promise<string> {
  const channel = await prisma.inboxChannel.findFirst({
    where: { companyId, platform: "INSTAGRAM", OR: [{ externalId: work.accountId }, { altExternalId: work.accountId }] },
  });
  if (!channel) return "unknown_account";
  const { item } = work;
  const ts = new Date(item.timestamp ?? now.getTime());
  const accountIds = [channel.externalId, channel.altExternalId];

  if (item.message_edit) {
    const chatId = item.sender?.id && !accountIds.includes(item.sender.id) ? item.sender.id : item.recipient?.id;
    if (!chatId) return "ignored";
    const r = await ingestEvent(
      companyId,
      { type: "edit", channelId: channel.id, chatId, externalId: item.message_edit.mid, text: item.message_edit.text ?? "", editedAt: ts },
      now
    );
    return r.status;
  }

  if (item.reaction) {
    if (item.reaction.action !== "react" || !item.sender?.id) return "ignored";
    const fromAccount = accountIds.includes(item.sender.id);
    const chatId = fromAccount ? item.recipient?.id : item.sender.id;
    if (!chatId) return "ignored";
    const r = await ingestEvent(
      companyId,
      {
        type: "message",
        channelId: channel.id,
        chatId,
        externalId: `reaction:${item.reaction.mid}:${item.sender.id}`,
        direction: fromAccount ? "OUT" : "IN",
        origin: fromAccount ? "EXTERNAL" : "CUSTOMER",
        kind: "REACTION",
        text: item.reaction.emoji ?? item.reaction.reaction ?? "❤",
        sentAt: ts,
      },
      now
    );
    return r.status;
  }

  const m = item.message;
  if (!m || !item.sender?.id || !item.recipient?.id) return "ignored";
  const echo = m.is_echo === true || accountIds.includes(item.sender.id);
  const chatId = echo ? item.recipient.id : item.sender.id;

  if (m.is_deleted) {
    const r = await ingestEvent(companyId, { type: "delete", channelId: channel.id, chatId, externalIds: [m.mid], deletedAt: ts }, now);
    return r.status;
  }

  let customer: { name: string | null; username: string | null } | undefined;
  if (!echo) {
    const known = await prisma.inboxConversation.findUnique({
      where: { channelId_externalChatId: { channelId: channel.id, externalChatId: chatId } },
      select: { customerName: true, customerUsername: true },
    });
    if (!known?.customerName && !known?.customerUsername && channel.tokenEnc) {
      customer = await fetchIgProfile(decryptSecret(channel.tokenEnc), chatId);
    }
  }

  const event: IncomingEvent = {
    type: "message",
    channelId: channel.id,
    chatId,
    externalId: m.mid,
    direction: echo ? "OUT" : "IN",
    // Echo'da qaysi xodim yozgani API orqali berilmaydi; panel yuborgan bo'lsa mid/matn bo'yicha topiladi.
    origin: echo ? "PANEL_ECHO" : "CUSTOMER",
    kind: m.text ? "TEXT" : (m.attachments?.[0]?.type?.toUpperCase() ?? (m.is_unsupported ? "UNSUPPORTED" : "OTHER")),
    text: m.text ?? "",
    sentAt: ts,
    customerName: customer?.name,
    customerUsername: customer?.username,
  };
  const r = await ingestEvent(companyId, event, now);
  return r.status;
}

export async function sendInstagramMessage(channel: { tokenEnc: string | null }, recipientId: string, text: string): Promise<SendResult> {
  if (!channel.tokenEnc) return { ok: false, definite: true, error: "Instagram токени йўқ — профилни қайта уланг" };
  const r = await graph<{ recipient_id?: string; message_id?: string }>(`${GRAPH}/${VERSION}/me/messages`, {
    method: "POST",
    headers: { ...bearer(decryptSecret(channel.tokenEnc)), "content-type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  if (r.ok && r.data.message_id) return { ok: true, externalId: r.data.message_id, sentAt: new Date() };
  if (r.ok) return { ok: false, definite: false, error: "Instagram хабар ID қайтармади" };
  return { ok: false, definite: r.definite, error: r.message };
}

/** Token yaroqliligini tekshiradi; muddati yaqinlashsa yangilaydi. */
export async function checkInstagramHealth(companyId: string, now: Date = new Date()): Promise<{ channelId: string; up: boolean }[]> {
  const changed: { channelId: string; up: boolean }[] = [];
  const channels = await prisma.inboxChannel.findMany({ where: { companyId, platform: "INSTAGRAM" } });
  for (const ch of channels) {
    if (!ch.tokenEnc) {
      const r = await setChannelStatus(ch.id, "DISCONNECTED", "Токен йўқ — профилни қайта уланг", now);
      if (r.changed) changed.push({ channelId: ch.id, up: false });
      continue;
    }
    let token = decryptSecret(ch.tokenEnc);
    if (ch.tokenExpiresAt && ch.tokenExpiresAt.getTime() <= now.getTime()) {
      const r = await setChannelStatus(ch.id, "DISCONNECTED", "Токен муддати тугаган — профилни қайта уланг", now);
      if (r.changed) changed.push({ channelId: ch.id, up: false });
      continue;
    }
    const refreshDue =
      ch.tokenExpiresAt &&
      ch.tokenExpiresAt.getTime() - now.getTime() < 15 * 86400_000 &&
      (!ch.tokenRefreshedAt || now.getTime() - ch.tokenRefreshedAt.getTime() > 86400_000);
    if (refreshDue) {
      const ref = await graph<{ access_token: string; expires_in: number }>(
        `${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`
      );
      if (ref.ok) {
        token = ref.data.access_token;
        await prisma.inboxChannel.update({
          where: { id: ch.id },
          data: { tokenEnc: encryptSecret(token), tokenExpiresAt: new Date(now.getTime() + ref.data.expires_in * 1000), tokenRefreshedAt: now },
        });
      }
    }
    const me = await graph<{ id: string }>(`${GRAPH}/${VERSION}/me?fields=user_id`, { headers: bearer(token) });
    if (me.ok) {
      const r = await setChannelStatus(ch.id, "CONNECTED", null, now);
      if (r.changed) changed.push({ channelId: ch.id, up: true });
    } else if (me.definite) {
      const r = await setChannelStatus(ch.id, "DISCONNECTED", `Instagram токенни рад этди: ${me.message}`, now);
      if (r.changed) changed.push({ channelId: ch.id, up: false });
    } else if (!ch.lastSyncOkAt || now.getTime() - ch.lastSyncOkAt.getTime() > 15 * 60_000) {
      const r = await setChannelStatus(ch.id, "ERROR", `Instagram API'га уланиб бўлмади: ${me.message}`, now);
      if (r.changed) changed.push({ channelId: ch.id, up: false });
    }
  }
  return changed;
}
