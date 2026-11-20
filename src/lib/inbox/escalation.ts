import { prisma } from "@/lib/prisma";
import { ensureSettings, PLATFORM_LABELS, type Platform } from "./core";
import { recipientsFor, type Recipient } from "./members";
import { conversationUrl, notifyOnce } from "./notify";
import { isOnShift } from "./time";

export const ESCALATION_KINDS = ["REMINDER", "MANAGER", "ADMIN"] as const;

/**
 * Javob kutayotgan suhbatlar bo'yicha bosqichma-bosqich ogohlantirish.
 * Kalit: suhbat + kutish epizodining birinchi xabari + bosqich. Mijoz ketma-ket
 * yozsa epizod o'zgarmaydi, shuning uchun bir holat uchun takroriy xabar bo'lmaydi.
 */
export async function runEscalations(companyId: string, now: Date = new Date()) {
  const settings = await ensureSettings(companyId);
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

  let sent = 0;
  for (const conv of waiting) {
    if (!conv.waitingSince || !conv.waitingMessageId) continue;
    const waitedMin = Math.floor((now.getTime() - conv.waitingSince.getTime()) / 60_000);
    for (const level of levels) {
      if (waitedMin < level.minutes) continue;
      const dedupeBase = `esc:${conv.id}:${conv.waitingMessageId}:${level.kind}`;
      const already = await prisma.inboxAlert.findFirst({ where: { dedupeKey: { startsWith: `${dedupeBase}:` } }, select: { id: true } });
      if (already) continue;

      let recipients: Recipient[];
      let note = "";
      if (level.kind === "REMINDER") {
        recipients = [];
        if (conv.assigneeId) {
          const member = await prisma.inboxMember.findUnique({ where: { companyId_userId: { companyId, userId: conv.assigneeId } } });
          const shifts = await prisma.inboxShift.findMany({ where: { companyId, userId: conv.assigneeId } });
          if (member?.notifyReminder && isOnShift(shifts, now, settings.timezone)) {
            recipients = [{ userId: conv.assigneeId, name: conv.assignee?.name ?? "", chatId: member.telegramChatId }];
          } else {
            note = "\nМасъул сотувчи ҳозир сменада эмас — эслатма сменадаги сотувчиларга юборилди.";
          }
        }
        if (recipients.length === 0) {
          recipients = await recipientsFor(companyId, "reminder", { now, timeZone: settings.timezone, channelId: conv.channelId, onlyOnShift: true });
        }
      } else {
        recipients = await recipientsFor(companyId, level.kind === "MANAGER" ? "manager" : "admin");
      }

      const head =
        level.kind === "REMINDER" ? "⏰ Мижоз жавоб кутмоқда" : level.kind === "MANAGER" ? "⚠️ Мижозга жавоб берилмаяпти" : "🚨 Мижоз узоқ вақт жавобсиз қолди";
      const text =
        `${head}: ${waitedMin} дақиқа\n` +
        `Профил: ${conv.channel.name} (${PLATFORM_LABELS[conv.channel.platform as Platform]})\n` +
        `Масъул: ${conv.assignee?.name ?? "бириктирилмаган"}` +
        note;
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
  return { checked: waiting.length, sent };
}
