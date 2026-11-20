import { prisma } from "@/lib/prisma";

/**
 * Chiquvchi xabarlar integratsiyaga kelayotganini tekshiradi. Xodimlar
 * Telegram/Instagram ilovasidan javob beradi; agar bu javoblar CRMga
 * kelmasa, mijozni "javobsiz" deyish noto'g'ri bo'ladi. Shuning uchun
 * chiquvchi oqim tasdiqlanmagan profilda kuzatuv "to'liq emas" deb ko'rsatiladi.
 */
export type Coverage = {
  state: "OK" | "NO_DATA" | "NEVER" | "STALE";
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  detail: string | null;
};

const STALE_MIN_WAITING = 5;

export async function outboundCoverage(channelId: string, now: Date = new Date()): Promise<Coverage> {
  const [lastIn, lastOut] = await Promise.all([
    prisma.inboxMessage.findFirst({
      where: { direction: "IN", conversation: { channelId } },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
    // Faqat platformaning o'zi yetkazgan chiquvchi xabarlar hisobga olinadi (tashqi IDsi bor)
    prisma.inboxMessage.findFirst({
      where: { direction: "OUT", externalId: { not: null }, kind: { not: "REACTION" }, conversation: { channelId } },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
  ]);
  const base = { lastInboundAt: lastIn?.sentAt ?? null, lastOutboundAt: lastOut?.sentAt ?? null };
  if (!lastIn) return { state: "NO_DATA", ...base, detail: "Ҳали бирорта хабар келмаган" };
  if (!lastOut) {
    return {
      state: "NEVER",
      ...base,
      detail: "Чиқувчи хабарлар ҳали бирор марта келмаган — ходимлар жавоби CRMга етиб келаётгани тасдиқланмаган",
    };
  }
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const recentWaiting = await prisma.inboxConversation.findMany({
    where: { channelId, isSpam: false, status: { not: "CLOSED" }, waitingSince: { gte: dayAgo, lte: new Date(now.getTime() - 30 * 60_000) } },
    select: { waitingSince: true },
    orderBy: { waitingSince: "asc" },
  });
  if (recentWaiting.length >= STALE_MIN_WAITING && lastOut.sentAt < recentWaiting[0].waitingSince!) {
    return {
      state: "STALE",
      ...base,
      detail: `Охирги 24 соатда ${recentWaiting.length} мижоз ёзган, лекин шу вақт ичида бирорта чиқувчи хабар келмаган — ё ҳеч ким жавоб бермаяпти, ё чиқувчи хабарлар интеграцияга келмаяпти`,
    };
  }
  return { state: "OK", ...base, detail: null };
}

export async function coverageByChannel(companyId: string, now: Date = new Date()): Promise<Map<string, Coverage>> {
  const channels = await prisma.inboxChannel.findMany({ where: { companyId }, select: { id: true } });
  const out = new Map<string, Coverage>();
  for (const c of channels) out.set(c.id, await outboundCoverage(c.id, now));
  return out;
}

export function coverageIncomplete(c: Coverage | undefined): boolean {
  return !!c && (c.state === "NEVER" || c.state === "STALE");
}
