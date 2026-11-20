import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildEpisodes, isSubstantiveStaffReply, type EpisodeMessage } from "./episodes";
import { matchesAutoReply, messageNeedsReply } from "./classify";

export type Platform = "TELEGRAM" | "INSTAGRAM";
export type ConversationStatus = "NEW" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "CLOSED";

export const STATUS_LABELS: Record<ConversationStatus, string> = {
  NEW: "Янги",
  IN_PROGRESS: "Жараёнда",
  WAITING_CUSTOMER: "Мижоздан жавоб кутилмоқда",
  CLOSED: "Якунланган",
};

export const PLATFORM_LABELS: Record<Platform, string> = { TELEGRAM: "Telegram", INSTAGRAM: "Instagram" };

export async function ensureSettings(companyId: string) {
  return prisma.inboxSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
}

export type IncomingEvent =
  | {
      type: "message";
      channelId: string;
      chatId: string;
      externalId: string;
      direction: "IN" | "OUT";
      /** PANEL_ECHO — platforma bizning panel/bot orqali yuborilgan xabarni qaytarib bildirdi. */
      origin: "CUSTOMER" | "EXTERNAL" | "AUTO" | "PANEL_ECHO";
      kind: string;
      text: string;
      sentAt: Date;
      customerName?: string | null;
      customerUsername?: string | null;
    }
  | { type: "edit"; channelId: string; chatId: string; externalId: string; text: string; editedAt: Date }
  | { type: "delete"; channelId: string; chatId: string | null; externalIds: string[]; deletedAt: Date };

export type IngestResult = { status: "created" | "duplicate" | "matched" | "updated" | "ignored"; conversationId?: string; messageId?: string };

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

async function getOrCreateConversation(
  companyId: string,
  channelId: string,
  chatId: string,
  sentAt: Date,
  customer?: { name?: string | null; username?: string | null }
) {
  const where = { channelId_externalChatId: { channelId, externalChatId: chatId } };
  let conv = await prisma.inboxConversation.findUnique({ where });
  if (!conv) {
    try {
      conv = await prisma.inboxConversation.create({
        data: {
          companyId,
          channelId,
          externalChatId: chatId,
          customerName: customer?.name ?? null,
          customerUsername: customer?.username ?? null,
          firstMessageAt: sentAt,
        },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      conv = await prisma.inboxConversation.findUniqueOrThrow({ where });
    }
  } else if (customer && (customer.name || customer.username) && (conv.customerName !== (customer.name ?? conv.customerName) || conv.customerUsername !== (customer.username ?? conv.customerUsername))) {
    conv = await prisma.inboxConversation.update({
      where: { id: conv.id },
      data: { customerName: customer.name ?? conv.customerName, customerUsername: customer.username ?? conv.customerUsername },
    });
  }
  return conv;
}

/**
 * Platformadan kelgan bitta voqeani qayta ishlaydi. Idempotent: bir xil
 * xabar ikki marta kelsa ikkinchisi "duplicate" bo'lib qaytadi. Xabarlar
 * tartibsiz kelishi mumkin — holat har safar `sentAt` bo'yicha qayta hisoblanadi.
 */
export async function ingestEvent(companyId: string, event: IncomingEvent, now: Date = new Date()): Promise<IngestResult> {
  const channel = await prisma.inboxChannel.findFirst({ where: { id: event.channelId, companyId } });
  if (!channel) return { status: "ignored" };

  await prisma.inboxChannel.update({
    where: { id: channel.id },
    data: { lastEventAt: now, trackingStartedAt: channel.trackingStartedAt ?? now },
  });

  if (event.type === "edit") {
    const conv = await prisma.inboxConversation.findUnique({
      where: { channelId_externalChatId: { channelId: channel.id, externalChatId: event.chatId } },
    });
    if (!conv) return { status: "ignored" };
    const msg = await prisma.inboxMessage.findUnique({
      where: { conversationId_externalId: { conversationId: conv.id, externalId: event.externalId } },
    });
    if (!msg) return { status: "ignored" };
    if (msg.text === event.text) return { status: "duplicate", conversationId: conv.id, messageId: msg.id };
    if (msg.editedAt && msg.editedAt.getTime() > event.editedAt.getTime()) return { status: "ignored", conversationId: conv.id };
    await prisma.inboxMessage.update({
      where: { id: msg.id },
      data: {
        text: event.text,
        originalText: msg.originalText ?? msg.text,
        editedAt: event.editedAt,
        needsReply: msg.direction === "IN" ? messageNeedsReply({ kind: msg.kind, text: event.text }) : false,
      },
    });
    await recomputeConversation(conv.id);
    return { status: "updated", conversationId: conv.id, messageId: msg.id };
  }

  if (event.type === "delete") {
    const convs = event.chatId
      ? await prisma.inboxConversation.findMany({ where: { channelId: channel.id, externalChatId: event.chatId }, select: { id: true } })
      : await prisma.inboxConversation.findMany({
          where: { channelId: channel.id, messages: { some: { externalId: { in: event.externalIds } } } },
          select: { id: true },
        });
    let touched = 0;
    for (const conv of convs) {
      const res = await prisma.inboxMessage.updateMany({
        where: { conversationId: conv.id, externalId: { in: event.externalIds }, deletedAt: null },
        data: { deletedAt: event.deletedAt },
      });
      if (res.count > 0) {
        touched += res.count;
        await recomputeConversation(conv.id);
      }
    }
    return { status: touched ? "updated" : "ignored", conversationId: convs[0]?.id };
  }

  const conv = await getOrCreateConversation(
    companyId,
    channel.id,
    event.chatId,
    event.sentAt,
    event.direction === "IN" ? { name: event.customerName, username: event.customerUsername } : undefined
  );

  const existing = await prisma.inboxMessage.findUnique({
    where: { conversationId_externalId: { conversationId: conv.id, externalId: event.externalId } },
  });
  if (existing) return { status: "duplicate", conversationId: conv.id, messageId: existing.id };

  if (event.origin === "PANEL_ECHO") {
    // Paneldan yuborilgan, lekin tashqi IDsi hali yozilmagan xabarni topamiz (webhook API javobidan oldin kelishi mumkin).
    const pending = await prisma.inboxMessage.findFirst({
      where: {
        conversationId: conv.id,
        direction: "OUT",
        authorType: "STAFF_PANEL",
        externalId: null,
        text: event.text,
        deliveryStatus: { in: ["PENDING", "UNKNOWN", "SENT"] },
        receivedAt: { gte: new Date(now.getTime() - 10 * 60_000) },
      },
      orderBy: { receivedAt: "asc" },
    });
    if (pending) {
      try {
        await prisma.inboxMessage.update({
          where: { id: pending.id },
          data: { externalId: event.externalId, deliveryStatus: "SENT", deliveryError: null, sentAt: event.sentAt },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
      await recomputeConversation(conv.id);
      return { status: "matched", conversationId: conv.id, messageId: pending.id };
    }
  }

  const settings = await ensureSettings(companyId);
  let authorType: string;
  if (event.direction === "IN") authorType = "CUSTOMER";
  else if (event.origin === "AUTO") authorType = "AUTO";
  else if (matchesAutoReply(event.text, settings.autoReplyPatterns)) authorType = "AUTO";
  else authorType = "EXTERNAL_UNKNOWN"; // muallif aniqlanmagan — hech kimga taxminan yozilmaydi

  let messageId: string;
  try {
    const created = await prisma.inboxMessage.create({
      data: {
        companyId,
        conversationId: conv.id,
        externalId: event.externalId,
        direction: event.direction,
        authorType,
        authorUserId: null,
        kind: event.kind,
        text: event.text,
        needsReply: event.direction === "IN" ? messageNeedsReply({ kind: event.kind, text: event.text }) : false,
        sentAt: event.sentAt,
        receivedAt: now,
      },
    });
    messageId = created.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { status: "duplicate", conversationId: conv.id };
    throw e;
  }
  await recomputeConversation(conv.id);
  return { status: "created", conversationId: conv.id, messageId };
}

/** Suhbat holati va kutish taymerini xabarlar tarixidan qayta hisoblaydi. */
export async function recomputeConversation(conversationId: string) {
  const conv = await prisma.inboxConversation.findUnique({ where: { id: conversationId } });
  if (!conv) return null;
  const [messages, events] = await Promise.all([
    prisma.inboxMessage.findMany({
      where: { conversationId },
      orderBy: { sentAt: "asc" },
      select: {
        id: true, direction: true, authorType: true, authorUserId: true, kind: true,
        needsReply: true, sentAt: true, deletedAt: true, deliveryStatus: true,
      },
    }),
    prisma.inboxEvent.findMany({
      where: { conversationId, type: { in: ["CLOSE", "REOPEN"] } },
      orderBy: { createdAt: "asc" },
      select: { type: true, createdAt: true, byUserId: true },
    }),
  ]);

  const closeTimes = effectiveCloseTimes(events);
  const episodes = buildEpisodes(messages as EpisodeMessage[], closeTimes);
  const last = episodes[episodes.length - 1];
  const open = last && last.outcome === "OPEN" ? last : null;

  const staffReplies = (messages as EpisodeMessage[]).filter(isSubstantiveStaffReply);
  const lastStaff = staffReplies[staffReplies.length - 1];
  const inbound = messages.filter((m) => m.direction === "IN" && !m.deletedAt);
  const lastIn = inbound[inbound.length - 1];
  const lastMsg = messages[messages.length - 1];

  let status = conv.status as ConversationStatus;
  let closedAt = conv.closedAt;
  let reopenCount = conv.reopenCount;
  let reopened = false;
  let waitingSince: Date | null = open ? open.startAt : null;
  let waitingMessageId: string | null = open ? open.startMessageId : null;

  if (conv.isSpam) {
    waitingSince = null;
    waitingMessageId = null;
  } else if (status === "CLOSED" && !open) {
    // yakunlangan suhbat: "rahmat" kabi xabarlar uni qayta ochmaydi
  } else {
    if (status === "CLOSED" && open) {
      reopened = true;
      reopenCount += 1;
      closedAt = null;
    }
    status = open ? (lastStaff ? "IN_PROGRESS" : "NEW") : lastStaff ? "WAITING_CUSTOMER" : "NEW";
  }

  const updated = await prisma.inboxConversation.update({
    where: { id: conversationId },
    data: {
      status,
      closedAt,
      reopenCount,
      waitingSince,
      waitingMessageId,
      firstMessageAt: messages[0]?.sentAt ?? conv.firstMessageAt,
      lastMessageAt: lastMsg?.sentAt ?? conv.lastMessageAt,
      lastCustomerAt: lastIn?.sentAt ?? null,
      lastStaffAt: lastStaff?.sentAt ?? null,
    },
  });
  if (reopened) {
    await prisma.inboxEvent.create({
      data: { companyId: conv.companyId, conversationId, type: "REOPEN", note: "Мижоз янги савол ёзди — суҳбат автоматик қайта очилди" },
    });
  }
  return updated;
}

/** Xodim qo'lda qayta ochgan bo'lsa, undan oldingi yopish bekor hisoblanadi. */
export function effectiveCloseTimes(events: { type: string; createdAt: Date; byUserId: string | null }[]): Date[] {
  const closes: Date[] = [];
  for (const e of events) {
    if (e.type === "CLOSE") closes.push(e.createdAt);
    else if (e.type === "REOPEN" && e.byUserId) closes.pop();
  }
  return closes;
}

export async function assignConversation(input: {
  companyId: string;
  conversationId: string;
  toUserId: string | null;
  byUserId: string | null;
  note?: string;
}) {
  const conv = await prisma.inboxConversation.findFirst({ where: { id: input.conversationId, companyId: input.companyId } });
  if (!conv) throw new Error("Суҳбат топилмади");
  if (conv.assigneeId === input.toUserId) return conv;
  const [updated] = await prisma.$transaction([
    prisma.inboxConversation.update({ where: { id: conv.id }, data: { assigneeId: input.toUserId } }),
    prisma.inboxEvent.create({
      data: {
        companyId: input.companyId,
        conversationId: conv.id,
        type: "ASSIGN",
        fromUserId: conv.assigneeId,
        toUserId: input.toUserId,
        byUserId: input.byUserId,
        note: input.note ?? null,
      },
    }),
  ]);
  return updated;
}

export async function closeConversation(companyId: string, conversationId: string, byUserId: string, now: Date = new Date()) {
  const conv = await prisma.inboxConversation.findFirst({ where: { id: conversationId, companyId } });
  if (!conv) throw new Error("Суҳбат топилмади");
  if (conv.status === "CLOSED") return conv;
  await prisma.$transaction([
    prisma.inboxEvent.create({ data: { companyId, conversationId, type: "CLOSE", byUserId, createdAt: now } }),
    prisma.inboxConversation.update({ where: { id: conversationId }, data: { status: "CLOSED", closedAt: now, resolvedThroughAt: now } }),
  ]);
  return recomputeConversation(conversationId);
}

export async function reopenConversation(companyId: string, conversationId: string, byUserId: string, now: Date = new Date()) {
  const conv = await prisma.inboxConversation.findFirst({ where: { id: conversationId, companyId } });
  if (!conv) throw new Error("Суҳбат топилмади");
  if (conv.status !== "CLOSED") return conv;
  await prisma.$transaction([
    prisma.inboxEvent.create({ data: { companyId, conversationId, type: "REOPEN", byUserId, createdAt: now } }),
    prisma.inboxConversation.update({ where: { id: conversationId }, data: { status: "NEW", closedAt: null, isSpam: false } }),
  ]);
  return recomputeConversation(conversationId);
}

export async function setSpam(companyId: string, conversationId: string, isSpam: boolean, byUserId: string, now: Date = new Date()) {
  const conv = await prisma.inboxConversation.findFirst({ where: { id: conversationId, companyId } });
  if (!conv) throw new Error("Суҳбат топилмади");
  if (conv.isSpam === isSpam) return conv;
  await prisma.inboxEvent.create({ data: { companyId, conversationId, type: isSpam ? "SPAM" : "UNSPAM", byUserId, createdAt: now } });
  if (isSpam) {
    await prisma.inboxEvent.create({ data: { companyId, conversationId, type: "CLOSE", byUserId, note: "Спам", createdAt: now } });
    await prisma.inboxConversation.update({ where: { id: conversationId }, data: { isSpam: true, status: "CLOSED", closedAt: now } });
  } else {
    await prisma.inboxEvent.create({ data: { companyId, conversationId, type: "REOPEN", byUserId, createdAt: now } });
    await prisma.inboxConversation.update({ where: { id: conversationId }, data: { isSpam: false, status: "NEW", closedAt: null } });
  }
  return recomputeConversation(conversationId);
}

export async function linkOrder(companyId: string, conversationId: string, orderRef: string | null, byUserId: string) {
  const conv = await prisma.inboxConversation.findFirst({ where: { id: conversationId, companyId } });
  if (!conv) throw new Error("Суҳбат топилмади");
  const ref = orderRef?.trim() || null;
  await prisma.$transaction([
    prisma.inboxConversation.update({ where: { id: conversationId }, data: { orderRef: ref } }),
    prisma.inboxEvent.create({
      data: { companyId, conversationId, type: "ORDER_LINK", byUserId, note: ref ? `Буюртма: ${ref}` : "Буюртма боғлови олиб ташланди" },
    }),
  ]);
}

/** Webhook voqeasi avval qayta ishlanganmi. */
export async function alreadyProcessed(dedupeKey: string): Promise<boolean> {
  return !!(await prisma.inboxWebhookEvent.findUnique({ where: { dedupeKey }, select: { id: true } }));
}

export async function markProcessed(companyId: string, dedupeKey: string) {
  try {
    await prisma.inboxWebhookEvent.create({ data: { companyId, dedupeKey } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
}

/** Uzilishni ochadi/yopadi va kanal holatini yangilaydi. Holat o'zgargan bo'lsa true qaytaradi. */
export async function setChannelStatus(
  channelId: string,
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | "PENDING",
  detail: string | null,
  now: Date = new Date()
): Promise<{ changed: boolean; outageId: string | null }> {
  const channel = await prisma.inboxChannel.findUnique({ where: { id: channelId } });
  if (!channel) return { changed: false, outageId: null };
  const wasUp = channel.status === "CONNECTED";
  const isUp = status === "CONNECTED";
  let outageId: string | null = null;
  if (wasUp && !isUp) {
    const outage = await prisma.inboxOutage.create({
      data: { companyId: channel.companyId, channelId, startedAt: now, reason: detail ?? status },
    });
    outageId = outage.id;
  } else if (!isUp) {
    const openOutage = await prisma.inboxOutage.findFirst({ where: { channelId, endedAt: null }, orderBy: { startedAt: "desc" } });
    outageId = openOutage?.id ?? null;
  } else if (!wasUp && isUp) {
    await prisma.inboxOutage.updateMany({ where: { channelId, endedAt: null }, data: { endedAt: now } });
  }
  await prisma.inboxChannel.update({
    where: { id: channelId },
    data: {
      status,
      statusDetail: detail,
      lastCheckAt: now,
      ...(isUp ? { lastSyncOkAt: now, trackingStartedAt: channel.trackingStartedAt ?? now } : {}),
    },
  });
  return { changed: channel.status !== status, outageId };
}
