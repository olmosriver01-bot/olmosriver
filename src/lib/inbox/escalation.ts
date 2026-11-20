import { prisma } from "@/lib/prisma";
import { ensureSettings, PLATFORM_LABELS, type Platform } from "./core";
import { leadershipRecipients, recipientsFor, type Recipient } from "./members";
import { conversationUrl, notifyOnce } from "./notify";
import { formatLocal, isOnShift, localParts } from "./time";
import { coverageIncomplete, outboundCoverage, type Coverage } from "./coverage";
import { customerLabel, evidenceQuote } from "./labels";
import { draftWaitingReply } from "./ai";
import { appBaseUrl } from "./http";

/**
 * Javob kutayotgan suhbatlar bo'yicha bosqichma-bosqich ogohlantirish.
 * Kalit: suhbat + kutish holatining birinchi xabari + bosqich. Mijoz ketma-ket
 * yozsa holat o'zgarmaydi, shuning uchun bir holat uchun takroriy xabar bo'lmaydi.
 *
 * Chiquvchi javoblar integratsiyaga kelayotgani tasdiqlanmagan profilda alohida
 * mijozlar "javobsiz" deb e'lon qilinmaydi — o'rniga rahbarga bitta
 * "kuzatuv to'liq emas" xabari boradi.
 */
export async function runEscalations(companyId: string, now: Date = new Date()) {
  const settings = await ensureSettings(companyId);
  const tz = settings.timezone;
  const levels = [
    { kind: "REMINDER" as const, minutes: settings.reminderMinutes },
    { kind: "MANAGER" as const, minutes: settings.managerMinutes },
    { kind: "ADMIN" as const, minutes: settings.adminMinutes },
  ];
  const minMinutes = Math.min(...levels.map((l) => l.minutes));
  const waiting = await prisma.inboxConversation.findMany({
    where: {
      companyId,
      isSpam: false,
      status: { not: "CLOSED" },
      waitingSince: { not: null, lte: new Date(now.getTime() - minMinutes * 60_000) },
    },
    include: { channel: { select: { id: true, name: true, platform: true } }, assignee: { select: { id: true, name: true } } },
  });

  const coverage = new Map<string, Coverage>();
  let sent = 0;
  let suppressed = 0;
  for (const conv of waiting) {
    if (!conv.waitingSince || !conv.waitingMessageId) continue;

    if (!coverage.has(conv.channelId)) coverage.set(conv.channelId, await outboundCoverage(conv.channelId, now));
    const cov = coverage.get(conv.channelId)!;
    if (coverageIncomplete(cov)) {
      suppressed++;
      const p = localParts(now, tz);
      await notifyOnce({
        companyId,
        kind: "COVERAGE",
        dedupeBase: `coverage:${conv.channelId}:${cov.state}:${p.year}-${p.month}-${p.day}`,
        recipients: await leadershipRecipients(companyId),
        text:
          `⚠️ Кузатув тўлиқ эмас: ${conv.channel.name} (${PLATFORM_LABELS[conv.channel.platform as Platform]})\n` +
          `${cov.detail}.\n` +
          `Охирги кирувчи хабар: ${formatLocal(cov.lastInboundAt, tz)} · охирги чиқувчи хабар: ${formatLocal(cov.lastOutboundAt, tz)}\n\n` +
          `Шу сабабли бу профилдаги мижозлар ҳозирча «жавобсиз» деб эълон қилинмаяпти. Текшириш: шу профилдан иловада бирор мижозга жавоб ёзинг — ` +
          `у CRMдаги суҳбатда кўринса, кузатув тикланади. Кўринмаса, уланиш созламасини текширинг.`,
        buttons: [{ text: "Профил суҳбатларини очиш", url: `${appBaseUrl()}/c/${companyId}/inbox?channel=${conv.channelId}&queue=waiting` }],
        channelId: conv.channelId,
      });
      continue;
    }

    const waitedMin = Math.floor((now.getTime() - conv.waitingSince.getTime()) / 60_000);
    for (const level of levels) {
      if (waitedMin < level.minutes) continue;
      const dedupeBase = `esc:${conv.id}:${conv.waitingMessageId}:${level.kind}`;
      const already = await prisma.inboxAlert.findFirst({ where: { dedupeKey: { startsWith: `${dedupeBase}:` } }, select: { id: true } });
      if (already) continue;

      let recipients: Recipient[];
      if (level.kind === "REMINDER") {
        recipients = [];
        if (conv.assigneeId) {
          const member = await prisma.inboxMember.findUnique({ where: { companyId_userId: { companyId, userId: conv.assigneeId } } });
          const shifts = await prisma.inboxShift.findMany({ where: { companyId, userId: conv.assigneeId } });
          if (member?.notifyReminder && isOnShift(shifts, now, tz)) {
            recipients = [{ userId: conv.assigneeId, name: conv.assignee?.name ?? "", chatId: member.telegramChatId }];
          }
        }
        if (recipients.length === 0) {
          recipients = await recipientsFor(companyId, "reminder", { now, timeZone: tz, channelId: conv.channelId, onlyOnShift: true });
        }
        // Sotuvchilar CRMdan foydalanmasa (Telegram bog'lanmagan) — bu bosqich jim o'tkaziladi, rahbar bosqichlari ishlaydi.
        recipients = recipients.filter((r) => r.chatId);
        if (recipients.length === 0) continue;
      } else {
        recipients = await recipientsFor(companyId, level.kind === "MANAGER" ? "manager" : "admin");
      }

      const [question, extra] = await Promise.all([
        prisma.inboxMessage.findUnique({ where: { id: conv.waitingMessageId } }),
        prisma.inboxMessage.count({
          where: { conversationId: conv.id, direction: "IN", needsReply: true, deletedAt: null, sentAt: { gt: conv.waitingSince } },
        }),
      ]);
      const draft = level.kind === "REMINDER" ? conv.waitingDraftFor === conv.waitingMessageId ? conv.waitingDraft : null : await draftWaitingReply(companyId, conv.id, now);
      const head =
        level.kind === "REMINDER" ? "⏰ Мижоз жавоб кутмоқда" : level.kind === "MANAGER" ? "⚠️ Мижозга жавоб берилмаяпти" : "🚨 Мижоз узоқ вақт жавобсиз қолди";
      const text = [
        `${head}: ${waitedMin} дақиқа`,
        `Профил: ${conv.channel.name} (${PLATFORM_LABELS[conv.channel.platform as Platform]})`,
        `Суҳбат: ${customerLabel(conv)}`,
        `Жавобсиз савол (${formatLocal(conv.waitingSince, tz)}): «${question ? evidenceQuote(question.text, question.kind) : "хабар топилмади"}»` +
          (extra > 0 ? ` ва яна ${extra} та хабар` : ""),
        draft
          ? `Тавсия этилган жавоб: «${draft}»`
          : "Тавсия: мижозга ҳозироқ жавоб беринг ва саволининг ҳар бир қисмига (нарх, мавжудлик, етказиш) аниқ жавоб ёзинг.",
      ].join("\n");
      const r = await notifyOnce({
        companyId,
        kind: `ESCALATION_${level.kind}`,
        dedupeBase,
        recipients,
        text,
        buttons: [{ text: "Суҳбатни очиш", url: conversationUrl(companyId, conv.id) }],
        conversationId: conv.id,
        channelId: conv.channelId,
      });
      sent += r.sent;
    }
  }
  return { checked: waiting.length, sent, suppressed };
}
