import { prisma } from "@/lib/prisma";
import { assignConversation, recomputeConversation } from "./core";
import { sendTelegramBusinessMessage } from "./telegram";
import { sendInstagramMessage } from "./instagram";
import type { SendResult } from "./http";

const WINDOW_MS = 24 * 3600_000;

export type StaffSendResult = {
  messageId: string;
  status: "SENT" | "FAILED" | "UNKNOWN" | "PENDING";
  error?: string | null;
  duplicate: boolean;
};

/**
 * Paneldan javob yuborish. `clientToken` — brauzer bitta yozilgan xabar uchun
 * bir marta hosil qiladigan kalit: tugma ikki marta bosilsa yoki so'rov qayta
 * yuborilsa, xabar mijozga ikkinchi marta ketmaydi.
 */
export async function sendStaffMessage(input: {
  companyId: string;
  conversationId: string;
  userId: string;
  text: string;
  clientToken: string;
  now?: Date;
}): Promise<StaffSendResult> {
  const now = input.now ?? new Date();
  const text = input.text.trim();
  if (!text) throw new Error("Хабар матни бўш");
  if (text.length > 1000) throw new Error("Хабар 1000 белгидан ошмаслиги керак");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.clientToken)) throw new Error("Нотўғри сўров калити");

  const token = `${input.conversationId}:${input.clientToken}`;
  const prior = await prisma.inboxMessage.findUnique({ where: { clientToken: token } });
  if (prior) return { messageId: prior.id, status: (prior.deliveryStatus ?? "SENT") as StaffSendResult["status"], error: prior.deliveryError, duplicate: true };

  const conv = await prisma.inboxConversation.findFirst({
    where: { id: input.conversationId, companyId: input.companyId },
    include: { channel: true },
  });
  if (!conv) throw new Error("Суҳбат топилмади");
  const channel = conv.channel;
  if (channel.status !== "CONNECTED") throw new Error("Профил уланмаган — хабар юбориб бўлмайди");
  if (!channel.canReply) throw new Error("Бу профилда ботга жавоб ёзиш ҳуқуқи берилмаган");
  if (!conv.lastCustomerAt || now.getTime() - conv.lastCustomerAt.getTime() > WINDOW_MS) {
    throw new Error(
      "Мижознинг охирги хабаридан 24 соатдан кўп ўтган: платформа қоидаси бўйича API орқали жавоб юбориб бўлмайди. Иловадан тўғридан-тўғри ёзинг."
    );
  }

  let message;
  try {
    message = await prisma.inboxMessage.create({
      data: {
        companyId: input.companyId,
        conversationId: conv.id,
        direction: "OUT",
        authorType: "STAFF_PANEL",
        authorUserId: input.userId,
        kind: "TEXT",
        text,
        sentAt: now,
        receivedAt: now,
        deliveryStatus: "PENDING",
        clientToken: token,
      },
    });
  } catch {
    const again = await prisma.inboxMessage.findUnique({ where: { clientToken: token } });
    if (again) return { messageId: again.id, status: (again.deliveryStatus ?? "SENT") as StaffSendResult["status"], error: again.deliveryError, duplicate: true };
    throw new Error("Хабарни сақлаб бўлмади");
  }

  let result: SendResult;
  try {
    result =
      channel.platform === "TELEGRAM"
        ? await sendTelegramBusinessMessage(input.companyId, channel, conv.externalChatId, text)
        : await sendInstagramMessage(channel, conv.externalChatId, text);
  } catch (e) {
    result = { ok: false, definite: false, error: e instanceof Error ? e.message : "номаълум хато" };
  }

  // Webhook (echo) bu orada xabarni tasdiqlab ulgurgan bo'lishi mumkin.
  const current = await prisma.inboxMessage.findUniqueOrThrow({ where: { id: message.id } });
  let status: StaffSendResult["status"];
  if (result.ok) {
    status = "SENT";
    if (current.externalId !== result.externalId) {
      // Echo alohida qator bo'lib tushgan bo'lsa, uni olib tashlab ID'ni shu xabarga biriktiramiz.
      await prisma.inboxMessage.deleteMany({
        where: { conversationId: conv.id, externalId: result.externalId, id: { not: message.id } },
      });
    }
    await prisma.inboxMessage.update({
      where: { id: message.id },
      data: { externalId: result.externalId, deliveryStatus: "SENT", deliveryError: null, sentAt: result.sentAt },
    });
  } else if (current.deliveryStatus === "SENT") {
    status = "SENT";
  } else {
    status = result.definite ? "FAILED" : "UNKNOWN";
    await prisma.inboxMessage.update({ where: { id: message.id }, data: { deliveryStatus: status, deliveryError: result.error } });
  }

  if (status === "SENT" && !conv.assigneeId) {
    await assignConversation({
      companyId: input.companyId,
      conversationId: conv.id,
      toUserId: input.userId,
      byUserId: input.userId,
      note: "Масъулсиз суҳбатга биринчи бўлиб жавоб берди",
    });
  }
  await recomputeConversation(conv.id);
  return { messageId: message.id, status, error: result.ok ? null : result.error, duplicate: false };
}
