import { prisma } from "@/lib/prisma";
import { appBaseUrl, http, type SendResult } from "./http";
import { decryptSecret, encryptSecret, randomToken, redact, sha256 } from "./crypto";
import { ensureSettings, ingestEvent, setChannelStatus, type IncomingEvent } from "./core";

const API = "https://api.telegram.org";
export const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
];

type TgResult<T> = { ok: true; result: T } | { ok: false; definite: boolean; code: number; description: string };

export async function tgCall<T = unknown>(token: string, method: string, params: Record<string, unknown> = {}): Promise<TgResult<T>> {
  let res: Response;
  try {
    res = await http(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch (e) {
    return { ok: false, definite: false, code: 0, description: redact(`Тармоқ хатоси: ${e instanceof Error ? e.message : "номаълум"}`) };
  }
  let data: { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } } | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.ok && data?.ok) return { ok: true, result: data.result as T };
  const retry = data?.parameters?.retry_after;
  const description = redact(data?.description ?? `HTTP ${res.status}`) + (retry ? ` (${retry} сониядан сўнг қайта уриниб кўринг)` : "");
  return { ok: false, definite: res.status < 500 && data !== null, code: data?.error_code ?? res.status, description };
}

export async function getBotToken(companyId: string): Promise<string | null> {
  const s = await prisma.inboxSettings.findUnique({ where: { companyId }, select: { tgBotTokenEnc: true } });
  return s?.tgBotTokenEnc ? decryptSecret(s.tgBotTokenEnc) : null;
}

export function telegramWebhookUrl(companyId: string): string {
  return `${appBaseUrl()}/api/webhooks/telegram/${companyId}`;
}

type TgUser = { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string; can_connect_to_business?: boolean };

/** Bot tokenini tekshiradi, webhook o'rnatadi va tokenni shifrlab saqlaydi. */
export async function connectTelegramBot(companyId: string, token: string): Promise<{ username: string; businessMode: boolean }> {
  const trimmed = token.trim();
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(trimmed)) throw new Error("Бот токени формати нотўғри");
  const base = appBaseUrl();
  if (!base.startsWith("https://")) {
    throw new Error("Webhook учун дастур HTTPS манзилда ишлаши керак (APP_URL ёки NEXTAUTH_URL https:// билан бошлансин)");
  }
  const me = await tgCall<TgUser>(trimmed, "getMe");
  if (!me.ok) throw new Error(`Telegram токенни қабул қилмади: ${me.description}`);
  const secret = randomToken(32);
  const hook = await tgCall(trimmed, "setWebhook", {
    url: telegramWebhookUrl(companyId),
    secret_token: secret,
    allowed_updates: TELEGRAM_ALLOWED_UPDATES,
  });
  if (!hook.ok) throw new Error(`Webhook ўрнатилмади: ${hook.description}`);
  await ensureSettings(companyId);
  await prisma.inboxSettings.update({
    where: { companyId },
    data: {
      tgBotTokenEnc: encryptSecret(trimmed),
      tgWebhookSecretEnc: encryptSecret(secret),
      tgBotUsername: me.result.username ?? null,
      tgBotId: String(me.result.id),
      tgLastCheckAt: new Date(),
      tgLastOkAt: new Date(),
      tgLastError: null,
    },
  });
  return { username: me.result.username ?? "", businessMode: me.result.can_connect_to_business === true };
}

export async function disconnectTelegramBot(companyId: string) {
  const token = await getBotToken(companyId);
  if (token) await tgCall(token, "deleteWebhook", { drop_pending_updates: false });
  await prisma.inboxSettings.update({
    where: { companyId },
    data: { tgBotTokenEnc: null, tgWebhookSecretEnc: null, tgBotUsername: null, tgBotId: null, tgLastError: "Бот узилган" },
  });
  const channels = await prisma.inboxChannel.findMany({ where: { companyId, platform: "TELEGRAM" } });
  for (const c of channels) await setChannelStatus(c.id, "DISCONNECTED", "Бот админ томонидан узилган");
}

export async function verifyTelegramSecret(companyId: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const s = await prisma.inboxSettings.findUnique({ where: { companyId }, select: { tgWebhookSecretEnc: true } });
  if (!s?.tgWebhookSecretEnc) return false;
  const expected = decryptSecret(s.tgWebhookSecretEnc);
  return sha256(expected) === sha256(header);
}

type TgBusinessConnection = {
  id: string;
  user: TgUser;
  user_chat_id?: number;
  date?: number;
  is_enabled: boolean;
  can_reply?: boolean; // Bot API 9.0 gacha
  rights?: { can_reply?: boolean };
};

type TgMessage = {
  message_id: number;
  date: number;
  edit_date?: number;
  chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string };
  from?: TgUser;
  business_connection_id?: string;
  sender_business_bot?: TgUser;
  is_from_offline?: boolean;
  text?: string;
  caption?: string;
  [key: string]: unknown;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  business_connection?: TgBusinessConnection;
  business_message?: TgMessage;
  edited_business_message?: TgMessage;
  deleted_business_messages?: { business_connection_id: string; chat: { id: number }; message_ids: number[] };
};

const MEDIA_KINDS = ["photo", "voice", "video", "video_note", "audio", "document", "sticker", "animation", "location", "contact", "venue", "poll"];

function messageKind(m: TgMessage): string {
  if (m.text) return "TEXT";
  for (const k of MEDIA_KINDS) if (m[k] !== undefined) return k.toUpperCase();
  return "OTHER";
}

function fullName(u?: { first_name?: string; last_name?: string }): string | null {
  const n = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  return n || null;
}

async function upsertBusinessChannel(companyId: string, bc: TgBusinessConnection, now: Date) {
  const canReply = bc.rights?.can_reply ?? bc.can_reply ?? false;
  const externalId = String(bc.user.id);
  const channel = await prisma.inboxChannel.upsert({
    where: { companyId_platform_externalId: { companyId, platform: "TELEGRAM", externalId } },
    update: {
      businessConnectionId: bc.id,
      name: fullName(bc.user) ?? bc.user.username ?? externalId,
      username: bc.user.username ?? null,
      canReply,
    },
    create: {
      companyId,
      platform: "TELEGRAM",
      externalId,
      businessConnectionId: bc.id,
      name: fullName(bc.user) ?? bc.user.username ?? externalId,
      username: bc.user.username ?? null,
      canReply,
      status: "PENDING",
    },
  });
  if (bc.is_enabled) {
    await setChannelStatus(channel.id, "CONNECTED", canReply ? null : "Ботга жавоб ёзиш ҳуқуқи берилмаган — панелдан жавоб юбориб бўлмайди", now);
  } else {
    await setChannelStatus(channel.id, "DISCONNECTED", "Аккаунт эгаси Telegram Business созламаларида ботни узган", now);
  }
  return prisma.inboxChannel.findUniqueOrThrow({ where: { id: channel.id } });
}

async function findChannelByConnection(companyId: string, connectionId: string, now: Date) {
  const channel = await prisma.inboxChannel.findFirst({ where: { companyId, platform: "TELEGRAM", businessConnectionId: connectionId } });
  if (channel) return channel;
  // Ulanish voqeasi o'tkazib yuborilgan bo'lishi mumkin — Telegramdan so'rab olamiz.
  const token = await getBotToken(companyId);
  if (!token) return null;
  const res = await tgCall<TgBusinessConnection>(token, "getBusinessConnection", { business_connection_id: connectionId });
  if (!res.ok) return null;
  return upsertBusinessChannel(companyId, res.result, now);
}

/** Webhookdan kelgan bitta Telegram update'ini qayta ishlaydi. */
export async function handleTelegramUpdate(companyId: string, update: TgUpdate, now: Date = new Date()): Promise<string> {
  if (update.business_connection) {
    const before = await prisma.inboxChannel.findFirst({
      where: { companyId, platform: "TELEGRAM", externalId: String(update.business_connection.user.id) },
      select: { status: true },
    });
    const channel = await upsertBusinessChannel(companyId, update.business_connection, now);
    if (before?.status === "CONNECTED" && channel.status !== "CONNECTED") {
      const { alertChannelDown } = await import("./health");
      await alertChannelDown(channel.id, now);
    }
    return "business_connection";
  }

  const bm = update.business_message ?? update.edited_business_message;
  if (bm) {
    if (!bm.business_connection_id || bm.chat.type !== "private") return "ignored";
    const channel = await findChannelByConnection(companyId, bm.business_connection_id, now);
    if (!channel) return "unknown_connection";
    const chatId = String(bm.chat.id);
    const externalId = String(bm.message_id);
    const text = bm.text ?? bm.caption ?? "";
    let event: IncomingEvent;
    if (update.edited_business_message) {
      event = { type: "edit", channelId: channel.id, chatId, externalId, text, editedAt: new Date((bm.edit_date ?? bm.date) * 1000) };
    } else {
      const outgoing = bm.from ? String(bm.from.id) === channel.externalId : false;
      event = {
        type: "message",
        channelId: channel.id,
        chatId,
        externalId,
        direction: outgoing ? "OUT" : "IN",
        origin: !outgoing ? "CUSTOMER" : bm.sender_business_bot ? "PANEL_ECHO" : bm.is_from_offline ? "AUTO" : "EXTERNAL",
        kind: messageKind(bm),
        text,
        sentAt: new Date(bm.date * 1000),
        customerName: fullName(bm.chat),
        customerUsername: bm.chat.username ?? null,
      };
    }
    const r = await ingestEvent(companyId, event, now);
    return r.status;
  }

  if (update.deleted_business_messages) {
    const d = update.deleted_business_messages;
    const channel = await findChannelByConnection(companyId, d.business_connection_id, now);
    if (!channel) return "unknown_connection";
    const r = await ingestEvent(
      companyId,
      { type: "delete", channelId: channel.id, chatId: String(d.chat.id), externalIds: d.message_ids.map(String), deletedAt: now },
      now
    );
    return r.status;
  }

  if (update.message && update.message.chat.type === "private") {
    await handleBotPrivateMessage(companyId, update.message, now);
    return "private";
  }
  return "ignored";
}

/** Xodim botga `/start KOD` yuborib, o'z Telegram chatini CRM loginiga bog'laydi. */
async function handleBotPrivateMessage(companyId: string, m: TgMessage, now: Date) {
  const token = await getBotToken(companyId);
  if (!token) return;
  const chatId = String(m.chat.id);
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{6,64})\s*$/.exec(m.text ?? "");
  if (match) {
    const member = await prisma.inboxMember.findFirst({
      where: { companyId, linkCodeHash: sha256(match[1]), linkCodeExpiresAt: { gt: now } },
      include: { user: { select: { name: true } } },
    });
    if (member) {
      await prisma.inboxMember.update({
        where: { id: member.id },
        data: { telegramChatId: chatId, linkCodeHash: null, linkCodeExpiresAt: null },
      });
      await tgCall(token, "sendMessage", {
        chat_id: chatId,
        text: `✅ Боғланди: ${member.user.name}. Энди ёзишмалар бўйича эслатма ва ҳисоботлар шу чатга келади.`,
      });
      return;
    }
    await tgCall(token, "sendMessage", { chat_id: chatId, text: "Код нотўғри ёки муддати ўтган. CRMда янги код олинг." });
    return;
  }
  await tgCall(token, "sendMessage", {
    chat_id: chatId,
    text: "Бу бот Gulzor CRM «Ёзишмалар назорати» хабарномалари учун. Боғлаш учун CRMдаги «Telegram'га боғлаш» тугмасидан фойдаланинг.",
  });
}

export async function sendTelegramBusinessMessage(
  companyId: string,
  channel: { businessConnectionId: string | null },
  chatId: string,
  text: string
): Promise<SendResult> {
  const token = await getBotToken(companyId);
  if (!token) return { ok: false, definite: true, error: "Telegram бот уланмаган" };
  if (!channel.businessConnectionId) return { ok: false, definite: true, error: "Business уланиш топилмади" };
  const res = await tgCall<{ message_id: number; date: number }>(token, "sendMessage", {
    business_connection_id: channel.businessConnectionId,
    chat_id: Number.isNaN(Number(chatId)) ? chatId : Number(chatId),
    text,
  });
  if (res.ok) return { ok: true, externalId: String(res.result.message_id), sentAt: new Date(res.result.date * 1000) };
  return { ok: false, definite: res.definite, error: res.description };
}

export type TgButton = { text: string; url: string };

/** Rahbar/xodimning shaxsiy chatiga bot nomidan xabar (eslatma, hisobot). */
export async function sendBotMessage(companyId: string, chatId: string, text: string, buttons: TgButton[] = []): Promise<{ ok: boolean; error?: string }> {
  const token = await getBotToken(companyId);
  if (!token) return { ok: false, error: "Telegram бот уланмаган" };
  // Telegram inline tugmalari faqat ochiq http(s) manzilni qabul qiladi
  const valid = buttons.filter((b) => /^https?:\/\/(?!localhost|127\.)/.test(b.url));
  const res = await tgCall(token, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    link_preview_options: { is_disabled: true },
    ...(valid.length ? { reply_markup: { inline_keyboard: valid.map((b) => [{ text: b.text.slice(0, 60), url: b.url }]) } } : {}),
  });
  return res.ok ? { ok: true } : { ok: false, error: res.description };
}

type WebhookInfo = { url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string };

/** Bot, webhook va har bir Business ulanish holatini Telegramning o'zidan tekshiradi. */
export async function checkTelegramHealth(companyId: string, now: Date = new Date()): Promise<{ ok: boolean; changed: { channelId: string; up: boolean }[] }> {
  const changed: { channelId: string; up: boolean }[] = [];
  const token = await getBotToken(companyId);
  const channels = await prisma.inboxChannel.findMany({ where: { companyId, platform: "TELEGRAM" } });
  if (!token) return { ok: false, changed };

  let problem: string | null = null;
  let reachable = true;
  const info = await tgCall<WebhookInfo>(token, "getWebhookInfo");
  if (!info.ok) {
    reachable = info.definite; // 401 kabi aniq rad — token yaroqsiz
    problem = info.definite ? `Бот токени рад этилди: ${info.description}` : `Telegram API'га уланиб бўлмади: ${info.description}`;
  } else if (info.result.url !== telegramWebhookUrl(companyId)) {
    problem = "Webhook манзили бошқа — бот бошқа жойга уланган ёки webhook ўчирилган";
  } else if (info.result.last_error_date && now.getTime() / 1000 - info.result.last_error_date < 600) {
    problem = `Webhook хатоси: ${redact(info.result.last_error_message ?? "номаълум")}`;
  }

  const settings = await prisma.inboxSettings.findUnique({ where: { companyId } });
  await prisma.inboxSettings.update({
    where: { companyId },
    data: { tgLastCheckAt: now, tgLastError: problem, ...(problem ? {} : { tgLastOkAt: now }) },
  });

  // Tarmoq vaqtincha uzilgan bo'lsa darhol "uzildi" demaymiz, lekin 15 daqiqadan oshsa — xato.
  const transient = !reachable && settings?.tgLastOkAt && now.getTime() - settings.tgLastOkAt.getTime() < 15 * 60_000;

  for (const ch of channels) {
    if (problem) {
      if (transient) continue;
      const r = await setChannelStatus(ch.id, "ERROR", problem, now);
      if (r.changed) changed.push({ channelId: ch.id, up: false });
      continue;
    }
    if (!ch.businessConnectionId) continue;
    const bc = await tgCall<TgBusinessConnection>(token, "getBusinessConnection", { business_connection_id: ch.businessConnectionId });
    if (!bc.ok) {
      if (!bc.definite) continue;
      const r = await setChannelStatus(ch.id, "DISCONNECTED", `Business уланиш топилмади: ${bc.description}`, now);
      if (r.changed) changed.push({ channelId: ch.id, up: false });
      continue;
    }
    const canReply = bc.result.rights?.can_reply ?? bc.result.can_reply ?? false;
    await prisma.inboxChannel.update({ where: { id: ch.id }, data: { canReply } });
    const r = bc.result.is_enabled
      ? await setChannelStatus(ch.id, "CONNECTED", canReply ? null : "Ботга жавоб ёзиш ҳуқуқи берилмаган — панелдан жавоб юбориб бўлмайди", now)
      : await setChannelStatus(ch.id, "DISCONNECTED", "Аккаунт эгаси Telegram Business созламаларида ботни узган", now);
    if (r.changed) changed.push({ channelId: ch.id, up: bc.result.is_enabled });
  }
  return { ok: !problem, changed };
}
