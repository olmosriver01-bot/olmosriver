"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanAccessCompany, type SessionUser } from "@/lib/access";
import { assignConversation, closeConversation, ensureSettings, linkOrder, reopenConversation, setSpam } from "@/lib/inbox/core";
import { ensureMember, getConversationForUser, isManager, listStaff } from "@/lib/inbox/members";
import { sendStaffMessage } from "@/lib/inbox/send";
import { connectTelegramBot, disconnectTelegramBot } from "@/lib/inbox/telegram";
import { instagramAuthorizeUrl } from "@/lib/inbox/instagram";
import { encryptSecret, randomToken, sha256, signState } from "@/lib/inbox/crypto";
import { isValidTimeZone, parseHHMM } from "@/lib/inbox/time";
import { AI_MODELS, analyzeConversation, isAiConfigured } from "@/lib/inbox/ai";
import { deliverReport, reportPeriod } from "@/lib/inbox/report";
import { appBaseUrl } from "@/lib/inbox/http";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function ctx(companyId: string): Promise<SessionUser> {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  return user;
}
async function managerCtx(companyId: string) {
  const user = await ctx(companyId);
  if (!isManager(user.role)) throw new Error("Бу амал фақат админ ва менежер учун");
  return user;
}
async function adminCtx(companyId: string) {
  const user = await ctx(companyId);
  if (user.role !== "ADMIN") throw new Error("Бу амал фақат админ учун");
  return user;
}
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Номаълум хато" };
}
function refresh(companyId: string) {
  revalidatePath(`/c/${companyId}/inbox`, "layout");
}

// ───────────── Суҳбатлар ─────────────

export async function sendReply(companyId: string, conversationId: string, text: string, clientToken: string): Promise<Result<{ status: string; error?: string | null }>> {
  try {
    const user = await ctx(companyId);
    const conv = await getConversationForUser(companyId, conversationId, user);
    if (!conv) throw new Error("Суҳбат топилмади ёки рухсат йўқ");
    if (conv.assigneeId && conv.assigneeId !== user.id && !isManager(user.role)) throw new Error("Бу суҳбат бошқа сотувчига бириктирилган");
    const r = await sendStaffMessage({ companyId, conversationId, userId: user.id, text, clientToken });
    refresh(companyId);
    return { ok: true, status: r.status, error: r.error };
  } catch (e) {
    return fail(e);
  }
}

export async function assignTo(companyId: string, conversationId: string, toUserId: string | null): Promise<Result> {
  try {
    const user = await ctx(companyId);
    const conv = await getConversationForUser(companyId, conversationId, user);
    if (!conv) throw new Error("Суҳбат топилмади ёки рухсат йўқ");
    if (!isManager(user.role)) {
      const own = conv.assigneeId === user.id;
      const claim = conv.assigneeId === null && toUserId === user.id;
      if (!own && !claim) throw new Error("Сиз фақат масъулсиз суҳбатни ўзингизга олишингиз ёки ўз суҳбатингизни ўтказишингиз мумкин");
      if (own && toUserId === null) throw new Error("Суҳбатни масъулсиз қолдириш фақат менежер учун");
    }
    if (toUserId) {
      const staff = await listStaff(companyId);
      if (!staff.some((s) => s.id === toUserId)) throw new Error("Ходим бу дўконга тегишли эмас");
    }
    await assignConversation({ companyId, conversationId, toUserId, byUserId: user.id });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setConversationState(
  companyId: string,
  conversationId: string,
  action: "close" | "reopen" | "spam" | "unspam"
): Promise<Result> {
  try {
    const user = await ctx(companyId);
    const conv = await getConversationForUser(companyId, conversationId, user);
    if (!conv) throw new Error("Суҳбат топилмади ёки рухсат йўқ");
    if (action === "close") await closeConversation(companyId, conversationId, user.id);
    else if (action === "reopen") await reopenConversation(companyId, conversationId, user.id);
    else await setSpam(companyId, conversationId, action === "spam", user.id);
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setOrderRef(companyId: string, conversationId: string, orderRef: string): Promise<Result> {
  try {
    const user = await ctx(companyId);
    const conv = await getConversationForUser(companyId, conversationId, user);
    if (!conv) throw new Error("Суҳбат топилмади ёки рухсат йўқ");
    if (orderRef.length > 60) throw new Error("Буюртма рақами жуда узун");
    await linkOrder(companyId, conversationId, orderRef, user.id);
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteConversation(companyId: string, conversationId: string): Promise<Result> {
  try {
    await adminCtx(companyId);
    await prisma.inboxConversation.deleteMany({ where: { id: conversationId, companyId } });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function ackMonitoring(companyId: string): Promise<Result> {
  try {
    const user = await ctx(companyId);
    await ensureMember(companyId, user);
    await prisma.inboxMember.update({ where: { companyId_userId: { companyId, userId: user.id } }, data: { monitoringAckAt: new Date() } });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Xodim o'z Telegram chatini bog'lashi uchun bir martalik kod (15 daqiqa). */
export async function createTelegramLinkCode(companyId: string): Promise<Result<{ code: string; botUsername: string | null }>> {
  try {
    const user = await ctx(companyId);
    await ensureMember(companyId, user);
    const settings = await ensureSettings(companyId);
    if (!settings.tgBotTokenEnc) throw new Error("Telegram бот ҳали уланмаган — админга мурожаат қилинг");
    const code = randomToken(9);
    await prisma.inboxMember.update({
      where: { companyId_userId: { companyId, userId: user.id } },
      data: { linkCodeHash: sha256(code), linkCodeExpiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    return { ok: true, code, botUsername: settings.tgBotUsername };
  } catch (e) {
    return fail(e);
  }
}

export async function unlinkTelegram(companyId: string, userId?: string): Promise<Result> {
  try {
    const user = await ctx(companyId);
    const target = userId && userId !== user.id ? (await adminCtx(companyId), userId) : user.id;
    await prisma.inboxMember.updateMany({ where: { companyId, userId: target }, data: { telegramChatId: null } });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── AI топилмалари ─────────────

export async function reviewFinding(companyId: string, findingId: string, decision: "CONFIRMED" | "REJECTED" | "PENDING"): Promise<Result> {
  try {
    const user = await managerCtx(companyId);
    const res = await prisma.inboxFinding.updateMany({
      where: { id: findingId, companyId },
      data: { status: decision, reviewedById: decision === "PENDING" ? null : user.id, reviewedAt: decision === "PENDING" ? null : new Date() },
    });
    if (res.count === 0) throw new Error("Топилма топилмади");
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function analyzeNow(companyId: string, conversationId: string): Promise<Result<{ findings: number; note?: string }>> {
  try {
    await managerCtx(companyId);
    if (!isAiConfigured()) throw new Error("Серверда ANTHROPIC_API_KEY созланмаган — AI таҳлили ишламайди");
    const r = await analyzeConversation(companyId, conversationId);
    refresh(companyId);
    if (r.status === "error") throw new Error(r.reason ?? "AI хатоси");
    const note =
      r.reason === "no_new_messages" ? "Охирги таҳлилдан бери янги хабар йўқ"
      : r.reason === "no_staff_messages" ? "Суҳбатда ходим жавоби йўқ — сифатни баҳолаш учун материал йўқ"
      : undefined;
    return { ok: true, findings: r.findings, note };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Ҳисобот ─────────────

export async function sendReportNow(companyId: string, which: "last" | "current"): Promise<Result<{ sent: number; failed: number; recipients: number }>> {
  try {
    await managerCtx(companyId);
    const settings = await ensureSettings(companyId);
    const now = new Date();
    const p = reportPeriod(now, settings.reportTime, settings.timezone);
    const [from, to] = which === "last" ? [p.from, p.to] : [p.to, now];
    const r = await deliverReport(companyId, from, to, now, `report-manual:${companyId}:${now.getTime()}`);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Созламалар (фақат админ) ─────────────

export type GeneralSettingsInput = {
  reminderMinutes: number;
  managerMinutes: number;
  adminMinutes: number;
  reportTime: string;
  timezone: string;
  retentionDays: number;
  autoReplyPatterns: string;
  deliveryTerms: string;
  aiEnabled: boolean;
  aiModel: string;
};

export async function saveGeneralSettings(companyId: string, input: GeneralSettingsInput): Promise<Result> {
  try {
    await adminCtx(companyId);
    const mins = [input.reminderMinutes, input.managerMinutes, input.adminMinutes];
    if (mins.some((m) => !Number.isInteger(m) || m < 1 || m > 1440)) throw new Error("Вақтлар 1–1440 дақиқа оралиғида бўлсин");
    if (!(input.reminderMinutes <= input.managerMinutes && input.managerMinutes <= input.adminMinutes)) {
      throw new Error("Тартиб: сотувчи ≤ менежер ≤ админ вақти");
    }
    if (parseHHMM(input.reportTime) === null) throw new Error("Ҳисобот вақти СС:ДД форматида бўлсин");
    if (!isValidTimeZone(input.timezone)) throw new Error("Вақт минтақаси нотўғри");
    if (!Number.isInteger(input.retentionDays) || input.retentionDays < 7 || input.retentionDays > 3650) throw new Error("Сақлаш муддати 7–3650 кун");
    if (!AI_MODELS[input.aiModel]) throw new Error("Нотўғри AI модели");
    await ensureSettings(companyId);
    await prisma.inboxSettings.update({
      where: { companyId },
      data: {
        reminderMinutes: input.reminderMinutes,
        managerMinutes: input.managerMinutes,
        adminMinutes: input.adminMinutes,
        reportTime: input.reportTime,
        timezone: input.timezone,
        retentionDays: input.retentionDays,
        autoReplyPatterns: input.autoReplyPatterns.slice(0, 4000),
        deliveryTerms: input.deliveryTerms.slice(0, 4000),
        aiEnabled: input.aiEnabled,
        aiModel: input.aiModel,
      },
    });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function connectBot(companyId: string, token: string): Promise<Result<{ username: string; businessMode: boolean }>> {
  try {
    await adminCtx(companyId);
    const r = await connectTelegramBot(companyId, token);
    refresh(companyId);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectBot(companyId: string): Promise<Result> {
  try {
    await adminCtx(companyId);
    await disconnectTelegramBot(companyId);
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveInstagramApp(companyId: string, appId: string, appSecret: string): Promise<Result> {
  try {
    await adminCtx(companyId);
    if (!/^\d{5,25}$/.test(appId.trim())) throw new Error("Instagram илова ID рақамлардан иборат бўлиши керак");
    const settings = await ensureSettings(companyId);
    if (!appSecret.trim() && !settings.igAppSecretEnc) throw new Error("Илова махфий калитини киритинг");
    await prisma.inboxSettings.update({
      where: { companyId },
      data: {
        igAppId: appId.trim(),
        ...(appSecret.trim() ? { igAppSecretEnc: encryptSecret(appSecret.trim()) } : {}),
        igVerifyToken: settings.igVerifyToken ?? randomToken(18),
      },
    });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function startInstagramConnect(companyId: string): Promise<Result<{ url: string }>> {
  try {
    const user = await adminCtx(companyId);
    const settings = await ensureSettings(companyId);
    if (!settings.igAppId || !settings.igAppSecretEnc) throw new Error("Аввал Instagram илова ID ва махфий калитини сақланг");
    if (!appBaseUrl().startsWith("https://")) throw new Error("Instagram уланиши учун дастур HTTPS манзилда ишлаши керак");
    const state = signState({ companyId, userId: user.id, exp: Date.now() + 10 * 60_000 });
    return { ok: true, url: instagramAuthorizeUrl(settings.igAppId, state) };
  } catch (e) {
    return fail(e);
  }
}

export async function removeChannel(companyId: string, channelId: string): Promise<Result> {
  try {
    await adminCtx(companyId);
    await prisma.inboxChannel.deleteMany({ where: { id: channelId, companyId } });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type MemberInput = {
  userId: string;
  notifyReminder: boolean;
  notifyManager: boolean;
  notifyAdmin: boolean;
  receiveReport: boolean;
  allChannels: boolean;
  channelIds: string[];
};

export async function saveMember(companyId: string, input: MemberInput): Promise<Result> {
  try {
    await adminCtx(companyId);
    const staff = await listStaff(companyId);
    const target = staff.find((s) => s.id === input.userId);
    if (!target) throw new Error("Ходим бу дўконга тегишли эмас");
    if (!isManager(target.role) && (input.notifyManager || input.notifyAdmin || input.receiveReport)) {
      throw new Error("Менежер/админ огоҳлантиришлари ва ҳисобот фақат менежер ёки админ ролидаги ходимга юборилади");
    }
    await ensureMember(companyId, target);
    const channels = await prisma.inboxChannel.findMany({ where: { companyId, id: { in: input.channelIds } }, select: { id: true } });
    await prisma.$transaction([
      prisma.inboxMember.update({
        where: { companyId_userId: { companyId, userId: input.userId } },
        data: {
          notifyReminder: input.notifyReminder,
          notifyManager: input.notifyManager,
          notifyAdmin: input.notifyAdmin,
          receiveReport: input.receiveReport,
          allChannels: input.allChannels,
        },
      }),
      prisma.inboxChannelAccess.deleteMany({ where: { userId: input.userId, channel: { companyId } } }),
      ...channels.map((c) => prisma.inboxChannelAccess.create({ data: { channelId: c.id, userId: input.userId } })),
    ]);
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addShift(companyId: string, input: { userId: string; days: number[]; start: string; end: string }): Promise<Result> {
  try {
    await adminCtx(companyId);
    const staff = await listStaff(companyId);
    if (!staff.some((s) => s.id === input.userId)) throw new Error("Ходим бу дўконга тегишли эмас");
    const start = parseHHMM(input.start);
    const end = parseHHMM(input.end);
    if (start === null || end === null) throw new Error("Вақт СС:ДД форматида бўлсин");
    const days = [...new Set(input.days)].filter((d) => d >= 1 && d <= 7).sort();
    if (days.length === 0) throw new Error("Камида бир кунни танланг");
    await prisma.inboxShift.create({ data: { companyId, userId: input.userId, days: days.join(","), startMinute: start, endMinute: end } });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteShift(companyId: string, shiftId: string): Promise<Result> {
  try {
    await adminCtx(companyId);
    await prisma.inboxShift.deleteMany({ where: { id: shiftId, companyId } });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addCatalogItem(companyId: string, input: { name: string; price: number | null; available: boolean; note: string }): Promise<Result> {
  try {
    await adminCtx(companyId);
    if (!input.name.trim()) throw new Error("Номини киритинг");
    if (input.price !== null && (!Number.isInteger(input.price) || input.price < 0)) throw new Error("Нарх нотўғри");
    await prisma.inboxCatalogItem.create({
      data: { companyId, name: input.name.trim().slice(0, 120), price: input.price, available: input.available, note: input.note.trim().slice(0, 300) || null },
    });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCatalogItem(companyId: string, itemId: string): Promise<Result> {
  try {
    await adminCtx(companyId);
    await prisma.inboxCatalogItem.deleteMany({ where: { id: itemId, companyId } });
    refresh(companyId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
