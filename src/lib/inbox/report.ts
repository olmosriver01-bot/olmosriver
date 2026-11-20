import { prisma } from "@/lib/prisma";
import { effectiveCloseTimes, ensureSettings, PLATFORM_LABELS, type Platform } from "./core";
import { buildEpisodes, type EpisodeMessage } from "./episodes";
import { recipientsFor } from "./members";
import { conversationUrl, notifyOnce } from "./notify";
import { formatDuration, formatLocal, lastScheduledMoment } from "./time";
import { appBaseUrl } from "./http";
import type { TgButton } from "./telegram";

export const FINDING_TYPE_LABELS: Record<string, string> = {
  UNANSWERED_PART: "Саволнинг бир қисми жавобсиз қолган",
  RUDE_REPLY: "Қўпол ёки менсимай ёзилган жавоб",
  MISSING_ORDER_DETAILS: "Буюртмада келишилмаган муҳим маълумот",
  IGNORED_COMPLAINT: "Мижоз норозилиги эътиборсиз қолган",
  BROKEN_CALLBACK_PROMISE: "Ваъда қилинган қайта алоқа бажарилмаган",
  PRICE_MISMATCH: "Нарх/шарт CRMдаги маълумотга мос эмас",
  OTHER: "Бошқа камчилик",
};
export const SEVERITY_LABELS: Record<string, string> = { HIGH: "юқори", MEDIUM: "ўртача", LOW: "паст" };
const SEVERITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export type ReportData = {
  companyName: string;
  timezone: string;
  from: Date;
  to: Date;
  slaMinutes: number;
  channels: {
    id: string; name: string; platform: string; status: string; statusDetail: string | null;
    trackingStartedAt: Date | null; lastEventAt: Date | null; lastSyncOkAt: Date | null;
  }[];
  dataIssues: string[];
  complete: boolean;
  newConversations: number;
  unassignedOpen: number;
  waiting: { conversationId: string; channelName: string; assigneeName: string | null; waitedMs: number }[];
  late: { conversationId: string; channelName: string; responderName: string | null; latencyMs: number }[];
  repliedEpisodes: number;
  closedWithoutReply: number;
  sellers: { userId: string; name: string; replies: number; avgMs: number | null; medianMs: number | null; late: number; openConversations: number }[];
  unknownAuthor: { messages: number; replies: number; avgMs: number | null; late: number };
  pendingFindings: { id: string; conversationId: string; type: string; severity: string; confidence: number; channelName: string }[];
  pendingFindingsTotal: number;
  confirmedFindings: { id: string; conversationId: string; type: string; severity: string; channelName: string }[];
  aiCostUsd: number;
  aiRuns: number;
  undeliveredAlerts: number;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export async function computeReport(companyId: string, from: Date, to: Date, now: Date = to): Promise<ReportData> {
  const settings = await ensureSettings(companyId);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } });
  const slaMs = settings.reminderMinutes * 60_000;

  const channels = await prisma.inboxChannel.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  const channelName = new Map(channels.map((c) => [c.id, `${c.name} (${PLATFORM_LABELS[c.platform as Platform]})`]));
  const outages = await prisma.inboxOutage.findMany({
    where: { companyId, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
    orderBy: { startedAt: "asc" },
  });

  const dataIssues: string[] = [];
  if (channels.length === 0) dataIssues.push("Ҳеч қандай профил уланмаган — ёзишмалар кузатилмаяпти.");
  for (const c of channels) {
    const label = channelName.get(c.id)!;
    if (c.status !== "CONNECTED") dataIssues.push(`${label}: уланмаган (${c.statusDetail ?? c.status}). Охирги муваффақиятли текширув: ${formatLocal(c.lastSyncOkAt, settings.timezone)}.`);
    if (!c.trackingStartedAt) dataIssues.push(`${label}: кузатув ҳали бошланмаган — ҳеч қандай хабар келмаган.`);
    else if (c.trackingStartedAt > from) dataIssues.push(`${label}: кузатув ${formatLocal(c.trackingStartedAt, settings.timezone)} да бошланган — давр тўлиқ қамралмаган.`);
  }
  for (const o of outages) {
    dataIssues.push(
      `${channelName.get(o.channelId) ?? "Профил"}: узилиш ${formatLocal(o.startedAt, settings.timezone)} — ${o.endedAt ? formatLocal(o.endedAt, settings.timezone) : "ҳали давом этмоқда"} (${o.reason}).`
    );
  }
  if (!settings.tgBotTokenEnc) dataIssues.push("Telegram бот уланмаган — огоҳлантириш ва ҳисоботлар Telegram'га юборилмайди.");

  const [newConversations, unassignedOpen] = await Promise.all([
    prisma.inboxConversation.count({ where: { companyId, firstMessageAt: { gte: from, lt: to } } }),
    prisma.inboxConversation.count({ where: { companyId, assigneeId: null, isSpam: false, status: { not: "CLOSED" } } }),
  ]);

  const waitingRows = await prisma.inboxConversation.findMany({
    where: { companyId, isSpam: false, status: { not: "CLOSED" }, waitingSince: { not: null } },
    include: { assignee: { select: { name: true } } },
    orderBy: { waitingSince: "asc" },
  });
  const waiting = waitingRows.map((c) => ({
    conversationId: c.id,
    channelName: channelName.get(c.channelId) ?? "",
    assigneeName: c.assignee?.name ?? null,
    waitedMs: now.getTime() - c.waitingSince!.getTime(),
  }));

  // Davr ichida faol bo'lgan suhbatlar bo'yicha javob epizodlari
  const active = await prisma.inboxConversation.findMany({
    where: { companyId, isSpam: false, lastMessageAt: { gte: from } },
    select: { id: true, channelId: true },
  });
  const staffNames = new Map((await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const perSeller = new Map<string, number[]>();
  const unknownLatencies: number[] = [];
  const late: ReportData["late"] = [];
  let repliedEpisodes = 0;
  let closedWithoutReply = 0;

  for (const conv of active) {
    const [messages, events] = await Promise.all([
      prisma.inboxMessage.findMany({
        where: { conversationId: conv.id },
        orderBy: { sentAt: "asc" },
        select: { id: true, direction: true, authorType: true, authorUserId: true, kind: true, needsReply: true, sentAt: true, deletedAt: true, deliveryStatus: true },
      }),
      prisma.inboxEvent.findMany({
        where: { conversationId: conv.id, type: { in: ["CLOSE", "REOPEN"] } },
        orderBy: { createdAt: "asc" },
        select: { type: true, createdAt: true, byUserId: true },
      }),
    ]);
    for (const ep of buildEpisodes(messages as EpisodeMessage[], effectiveCloseTimes(events))) {
      if (!ep.endAt || ep.endAt < from || ep.endAt >= to) continue;
      if (ep.outcome === "CLOSED_NO_REPLY") {
        closedWithoutReply++;
        continue;
      }
      repliedEpisodes++;
      const latency = ep.endAt.getTime() - ep.startAt.getTime();
      if (ep.responderKnown && ep.responderUserId) {
        if (!perSeller.has(ep.responderUserId)) perSeller.set(ep.responderUserId, []);
        perSeller.get(ep.responderUserId)!.push(latency);
      } else unknownLatencies.push(latency);
      if (latency > slaMs) {
        late.push({
          conversationId: conv.id,
          channelName: channelName.get(conv.channelId) ?? "",
          responderName: ep.responderKnown && ep.responderUserId ? (staffNames.get(ep.responderUserId) ?? null) : null,
          latencyMs: latency,
        });
      }
    }
  }
  late.sort((a, b) => b.latencyMs - a.latencyMs);

  const openByAssignee = await prisma.inboxConversation.groupBy({
    by: ["assigneeId"],
    where: { companyId, isSpam: false, status: { not: "CLOSED" }, assigneeId: { not: null } },
    _count: { _all: true },
  });
  const openMap = new Map(openByAssignee.map((r) => [r.assigneeId!, r._count._all]));
  const sellerIds = new Set([...perSeller.keys(), ...openMap.keys()]);
  const sellers = [...sellerIds]
    .map((userId) => {
      const lat = perSeller.get(userId) ?? [];
      return {
        userId,
        name: staffNames.get(userId) ?? "Ходим",
        replies: lat.length,
        avgMs: avg(lat),
        medianMs: median(lat),
        late: lat.filter((l) => l > slaMs).length,
        openConversations: openMap.get(userId) ?? 0,
      };
    })
    .sort((a, b) => b.replies - a.replies);

  const unknownMessages = await prisma.inboxMessage.count({
    where: { companyId, direction: "OUT", authorType: "EXTERNAL_UNKNOWN", sentAt: { gte: from, lt: to } },
  });

  const pendingAll = await prisma.inboxFinding.findMany({ where: { companyId, status: "PENDING" }, include: { conversation: { select: { channelId: true } } } });
  pendingAll.sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) || b.confidence - a.confidence);
  const confirmed = await prisma.inboxFinding.findMany({
    where: { companyId, status: "CONFIRMED", reviewedAt: { gte: from, lt: to } },
    include: { conversation: { select: { channelId: true } } },
    orderBy: { reviewedAt: "desc" },
  });

  const aiAgg = await prisma.inboxAiRun.aggregate({ where: { companyId, createdAt: { gte: from, lt: to } }, _sum: { costUsd: true }, _count: { _all: true } });
  const undeliveredAlerts = await prisma.inboxAlert.count({ where: { companyId, ok: false, createdAt: { gte: from, lt: to } } });
  if (undeliveredAlerts > 0) dataIssues.push(`${undeliveredAlerts} та огоҳлантириш етказилмади (қабул қилувчи белгиланмаган ёки Telegram боғланмаган).`);

  return {
    companyName: company.name,
    timezone: settings.timezone,
    from,
    to,
    slaMinutes: settings.reminderMinutes,
    channels: channels.map((c) => ({
      id: c.id, name: c.name, platform: c.platform, status: c.status, statusDetail: c.statusDetail,
      trackingStartedAt: c.trackingStartedAt, lastEventAt: c.lastEventAt, lastSyncOkAt: c.lastSyncOkAt,
    })),
    dataIssues,
    complete: dataIssues.length === 0,
    newConversations,
    unassignedOpen,
    waiting,
    late,
    repliedEpisodes,
    closedWithoutReply,
    sellers,
    unknownAuthor: { messages: unknownMessages, replies: unknownLatencies.length, avgMs: avg(unknownLatencies), late: unknownLatencies.filter((l) => l > slaMs).length },
    pendingFindings: pendingAll.slice(0, 5).map((f) => ({
      id: f.id, conversationId: f.conversationId, type: f.type, severity: f.severity, confidence: f.confidence,
      channelName: channelName.get(f.conversation.channelId) ?? "",
    })),
    pendingFindingsTotal: pendingAll.length,
    confirmedFindings: confirmed.map((f) => ({
      id: f.id, conversationId: f.conversationId, type: f.type, severity: f.severity, channelName: channelName.get(f.conversation.channelId) ?? "",
    })),
    aiCostUsd: aiAgg._sum.costUsd ?? 0,
    aiRuns: aiAgg._count._all,
    undeliveredAlerts,
  };
}

/**
 * Telegram uchun matn. Mijoz ismi, telefoni yoki xabar matni ko'chirilmaydi —
 * har bir holat yonida CRMdagi suhbatni ochadigan tugma bo'ladi.
 */
export function formatReport(companyId: string, r: ReportData): { text: string; buttons: TgButton[] }[] {
  const tz = r.timezone;
  const buttons: TgButton[] = [];
  const L: string[] = [];
  let n = 0;
  const ref = (conversationId: string, label: string) => {
    if (buttons.length >= 12) return "";
    n++;
    buttons.push({ text: `${n}. ${label}`, url: conversationUrl(companyId, conversationId) });
    return ` [${n}]`;
  };

  L.push(`📊 Ёзишмалар назорати — ${r.companyName}`);
  L.push(`Давр: ${formatLocal(r.from, tz)} — ${formatLocal(r.to, tz)} (${tz})`);
  L.push("");
  L.push("Қамраб олинган профиллар:");
  if (r.channels.length === 0) L.push("— йўқ");
  for (const c of r.channels) {
    const mark = c.status === "CONNECTED" ? "🟢" : "🔴";
    L.push(`${mark} ${c.name} (${PLATFORM_LABELS[c.platform as Platform]}) — охирги текширув: ${formatLocal(c.lastSyncOkAt, tz)}`);
  }
  L.push("");
  if (!r.complete) {
    L.push("⚠️ МАЪЛУМОТ ТЎЛИҚ ЭМАС — қуйидаги рақамлар фақат келиб тушган хабарлар бўйича:");
    for (const i of r.dataIssues.slice(0, 8)) L.push(`• ${i}`);
    if (r.dataIssues.length > 8) L.push(`• …яна ${r.dataIssues.length - 8} та`);
    L.push("");
  }

  L.push(`Янги суҳбатлар: ${r.newConversations}`);
  L.push(`Жавоб берилган мурожаатлар: ${r.repliedEpisodes}`);
  if (r.closedWithoutReply) L.push(`Жавобсиз якунланган мурожаатлар: ${r.closedWithoutReply}`);
  L.push(`Масъулсиз очиқ суҳбатлар: ${r.unassignedOpen}`);
  L.push("");

  L.push(`Ҳали жавоб кутаётган мижозлар: ${r.waiting.length}`);
  for (const w of r.waiting.slice(0, 5)) {
    L.push(`• ${w.channelName} — ${formatDuration(w.waitedMs)}, масъул: ${w.assigneeName ?? "йўқ"}${ref(w.conversationId, "Жавоб кутмоқда")}`);
  }
  if (r.waiting.length > 5) L.push(`• …яна ${r.waiting.length - 5} та`);
  L.push("");

  L.push(`${r.slaMinutes} дақиқадан кеч жавоб берилган: ${r.late.length}`);
  for (const l of r.late.slice(0, 4)) {
    L.push(`• ${l.channelName} — ${formatDuration(l.latencyMs)}, жавоб берган: ${l.responderName ?? "аниқланмаган"}${ref(l.conversationId, "Кеч жавоб")}`);
  }
  if (r.late.length > 4) L.push(`• …яна ${r.late.length - 4} та`);
  L.push("");

  L.push("Сотувчилар:");
  if (r.sellers.length === 0) L.push("— панел орқали жавоб берилмаган");
  for (const s of r.sellers) {
    const speed = s.medianMs === null ? "жавоб йўқ" : `ўртача ${formatDuration(s.avgMs!)}, медиана ${formatDuration(s.medianMs)}`;
    L.push(`• ${s.name}: ${s.replies} жавоб, ${speed}, кеч: ${s.late}, очиқ суҳбат: ${s.openConversations}`);
  }
  L.push("");

  L.push(`Муаллифи аниқланмаган хабарлар: ${r.unknownAuthor.messages}`);
  if (r.unknownAuthor.replies) {
    L.push(`  (иловадан тўғридан-тўғри ёзилган ${r.unknownAuthor.replies} жавоб, ўртача ${formatDuration(r.unknownAuthor.avgMs!)}, кеч: ${r.unknownAuthor.late} — ҳеч бир ходимга ёзилмаган)`);
  }
  L.push("");

  L.push(`Текшириш керак бўлган ҳолатлар (AI, тасдиқланмаган): ${r.pendingFindingsTotal}`);
  for (const f of r.pendingFindings) {
    L.push(`• ${FINDING_TYPE_LABELS[f.type] ?? f.type} — ${f.channelName}, жиддийлик: ${SEVERITY_LABELS[f.severity] ?? f.severity}, ишонч: ${Math.round(f.confidence * 100)}%${ref(f.conversationId, "Текшириш")}`);
  }
  L.push("");
  L.push(`Тасдиқланган камчиликлар (шу даврда): ${r.confirmedFindings.length}`);
  for (const f of r.confirmedFindings.slice(0, 4)) {
    L.push(`• ${FINDING_TYPE_LABELS[f.type] ?? f.type} — ${f.channelName}${ref(f.conversationId, "Камчилик")}`);
  }
  if (r.aiRuns) {
    L.push("");
    L.push(`AI таҳлили: ${r.aiRuns} та, харажат ≈ $${r.aiCostUsd.toFixed(3)}`);
  }

  const base = appBaseUrl();
  if (base) buttons.push({ text: "Тўлиқ ҳисобот", url: `${base}/c/${companyId}/inbox/reports` });
  return [{ text: L.join("\n"), buttons }];
}

export function reportPeriod(now: Date, reportTime: string, timezone: string) {
  const { at, key } = lastScheduledMoment(now, reportTime, timezone);
  return { from: new Date(at.getTime() - 24 * 3600_000), to: at, key };
}

/** Rejadagi hisobot: har bir hisobot lahzasi uchun bir marta, faqat sozlamada belgilanganlarga. */
export async function sendScheduledReport(companyId: string, now: Date = new Date()): Promise<{ sent: boolean; reason?: string }> {
  const settings = await ensureSettings(companyId);
  const { from, to, key } = reportPeriod(now, settings.reportTime, settings.timezone);
  if (settings.lastReportKey === key) return { sent: false, reason: "already" };
  if (now.getTime() - to.getTime() > 6 * 3600_000) return { sent: false, reason: "stale" };
  if (settings.createdAt > to) return { sent: false, reason: "not_started" };
  // Avval belgilab qo'yamiz — parallel ishga tushishda ikki marta yuborilmasin.
  const claimed = await prisma.inboxSettings.updateMany({
    where: { companyId, OR: [{ lastReportKey: null }, { lastReportKey: { not: key } }] },
    data: { lastReportKey: key },
  });
  if (claimed.count === 0) return { sent: false, reason: "already" };
  await deliverReport(companyId, from, to, now, `report:${companyId}:${key}`);
  return { sent: true };
}

export async function deliverReport(companyId: string, from: Date, to: Date, now: Date, dedupeBase: string) {
  const data = await computeReport(companyId, from, to, now);
  const parts = formatReport(companyId, data);
  const recipients = await recipientsFor(companyId, "report");
  let i = 0;
  let sent = 0;
  let failed = 0;
  for (const part of parts) {
    const r = await notifyOnce({ companyId, kind: "REPORT", dedupeBase: `${dedupeBase}:${i++}`, recipients, text: part.text, buttons: part.buttons });
    sent += r.sent;
    failed += r.failed;
  }
  return { sent, failed, recipients: recipients.length };
}
