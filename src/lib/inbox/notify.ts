import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "./http";
import { sendBotMessage, type TgButton } from "./telegram";
import type { Recipient } from "./members";

export function conversationUrl(companyId: string, conversationId: string): string {
  return `${appBaseUrl()}/c/${companyId}/inbox/${conversationId}`;
}

/**
 * Bitta holat uchun bitta oluvchiga faqat bir marta yuboradi: `dedupeBase`
 * bo'yicha yozuv avval yaratiladi (unikal kalit), keyin xabar jo'natiladi.
 * Yetkazib bo'lmagan holatlar ham yozib qo'yiladi — sozlamalarda ko'rinadi.
 */
export async function notifyOnce(input: {
  companyId: string;
  kind: string;
  dedupeBase: string;
  recipients: Recipient[];
  text: string;
  buttons?: TgButton[];
  conversationId?: string;
  channelId?: string;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const targets: (Recipient | null)[] = input.recipients.length ? input.recipients : [null];
  for (const r of targets) {
    const dedupeKey = `${input.dedupeBase}:${r?.userId ?? "none"}`;
    let alert;
    try {
      alert = await prisma.inboxAlert.create({
        data: {
          companyId: input.companyId,
          kind: input.kind,
          dedupeKey,
          conversationId: input.conversationId ?? null,
          channelId: input.channelId ?? null,
          recipientUserId: r?.userId ?? null,
          ok: false,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        skipped++;
        continue;
      }
      throw e;
    }
    let error: string | null = null;
    if (!r) error = "Қабул қилувчи белгиланмаган";
    else if (!r.chatId) error = "Ходим Telegram'ни боғламаган";
    else {
      const res = await sendBotMessage(input.companyId, r.chatId, input.text, input.buttons ?? []);
      if (!res.ok) error = res.error ?? "Юборилмади";
    }
    await prisma.inboxAlert.update({ where: { id: alert.id }, data: { ok: !error, error } });
    if (error) failed++;
    else sent++;
  }
  return { sent, failed, skipped };
}
