import { prisma } from "@/lib/prisma";
import { PLATFORM_LABELS, type Platform } from "./core";
import { recipientsFor } from "./members";
import { notifyOnce } from "./notify";
import { appBaseUrl } from "./http";
import { checkTelegramHealth } from "./telegram";
import { checkInstagramHealth } from "./instagram";

function settingsUrl(companyId: string) {
  return `${appBaseUrl()}/c/${companyId}/inbox/settings`;
}

/** Uzilish haqida adminlarga xabar — har bir uzilish uchun bir marta. */
export async function alertChannelDown(channelId: string, now: Date = new Date()) {
  const ch = await prisma.inboxChannel.findUnique({ where: { id: channelId } });
  if (!ch || ch.status === "CONNECTED") return;
  const outage = await prisma.inboxOutage.findFirst({ where: { channelId, endedAt: null }, orderBy: { startedAt: "desc" } });
  if (!outage) return;
  await notifyOnce({
    companyId: ch.companyId,
    kind: "CHANNEL_DOWN",
    dedupeBase: `chan-down:${outage.id}`,
    recipients: await recipientsFor(ch.companyId, "admin"),
    text:
      `🔌 Профил уланиши узилди: ${ch.name} (${PLATFORM_LABELS[ch.platform as Platform]})\n` +
      `Сабаб: ${ch.statusDetail ?? "номаълум"}\n` +
      `Уланиш тиклангунча бу профилдаги ёзишмалар CRMга тушмайди ва назорат қилинмайди.`,
    buttons: [{ text: "Уланишларни очиш", url: settingsUrl(ch.companyId) }],
    channelId,
  });
  void now;
}

async function alertChannelUp(channelId: string) {
  const ch = await prisma.inboxChannel.findUnique({ where: { id: channelId } });
  if (!ch) return;
  const outage = await prisma.inboxOutage.findFirst({ where: { channelId, endedAt: { not: null } }, orderBy: { endedAt: "desc" } });
  if (!outage) return;
  await notifyOnce({
    companyId: ch.companyId,
    kind: "CHANNEL_UP",
    dedupeBase: `chan-up:${outage.id}`,
    recipients: await recipientsFor(ch.companyId, "admin"),
    text:
      `✅ Профил уланиши тикланди: ${ch.name} (${PLATFORM_LABELS[ch.platform as Platform]})\n` +
      `Узилиш вақтидаги хабарлар автоматик тикланмаган бўлиши мумкин — шу оралиқни иловадан текширинг.`,
    channelId,
  });
}

export async function runHealthChecks(companyId: string, now: Date = new Date()) {
  const tg = await checkTelegramHealth(companyId, now);
  const ig = await checkInstagramHealth(companyId, now);
  for (const c of [...tg.changed, ...ig]) {
    if (c.up) await alertChannelUp(c.channelId);
    else await alertChannelDown(c.channelId, now);
  }
  return { telegramOk: tg.ok, changed: tg.changed.length + ig.length };
}
