import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GlobalRole } from "@/lib/constants";
import { isOnShift } from "./time";

export type InboxUser = { id: string; role: GlobalRole };

export function isManager(role: GlobalRole): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

/** Do'kon xodimlari: kompaniya a'zolari + global administratorlar. */
export async function listStaff(companyId: string) {
  const users = await prisma.user.findMany({
    where: { OR: [{ role: "ADMIN" }, { memberships: { some: { companyId } } }] },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ ...u, role: u.role as GlobalRole }));
}

export async function ensureMember(companyId: string, user: InboxUser) {
  const existing = await prisma.inboxMember.findUnique({ where: { companyId_userId: { companyId, userId: user.id } } });
  if (existing) return existing;
  return prisma.inboxMember.upsert({
    where: { companyId_userId: { companyId, userId: user.id } },
    update: {},
    create: {
      companyId,
      userId: user.id,
      notifyReminder: user.role === "EMPLOYEE",
      notifyManager: user.role === "MANAGER",
      notifyAdmin: user.role === "ADMIN",
      receiveReport: user.role !== "EMPLOYEE",
    },
  });
}

export async function ensureAllMembers(companyId: string) {
  const staff = await listStaff(companyId);
  for (const u of staff) await ensureMember(companyId, u);
  return staff;
}

/** Sotuvchi ko'ra oladigan profillar (null = hammasi). */
export async function allowedChannelIds(companyId: string, user: InboxUser): Promise<string[] | null> {
  if (isManager(user.role)) return null;
  const member = await ensureMember(companyId, user);
  if (member.allChannels) return null;
  const rows = await prisma.inboxChannelAccess.findMany({ where: { userId: user.id, channel: { companyId } }, select: { channelId: true } });
  return rows.map((r) => r.channelId);
}

/** Do'kon va rol bo'yicha qat'iy filtr: sotuvchi — o'ziga biriktirilgan va ruxsatli profillardagi mas'ulsiz suhbatlar. */
export async function conversationScope(companyId: string, user: InboxUser): Promise<Prisma.InboxConversationWhereInput> {
  if (isManager(user.role)) return { companyId };
  const allowed = await allowedChannelIds(companyId, user);
  return {
    companyId,
    OR: [{ assigneeId: user.id }, { assigneeId: null, ...(allowed ? { channelId: { in: allowed } } : {}) }],
  };
}

export async function getConversationForUser(companyId: string, conversationId: string, user: InboxUser) {
  const scope = await conversationScope(companyId, user);
  return prisma.inboxConversation.findFirst({ where: { AND: [scope, { id: conversationId }] } });
}

export type Recipient = { userId: string; name: string; chatId: string | null };

/** Belgilangan turdagi xabarnoma oluvchilar (sozlamalardan). */
export async function recipientsFor(
  companyId: string,
  kind: "reminder" | "manager" | "admin" | "report",
  opts: { now?: Date; timeZone?: string; channelId?: string; onlyOnShift?: boolean } = {}
): Promise<Recipient[]> {
  const field = { reminder: "notifyReminder", manager: "notifyManager", admin: "notifyAdmin", report: "receiveReport" }[kind];
  const staff = await listStaff(companyId);
  const staffIds = new Set(staff.map((s) => s.id));
  const members = await prisma.inboxMember.findMany({
    where: { companyId, [field]: true },
    include: { user: { select: { id: true, name: true, role: true } } },
  });
  const out: Recipient[] = [];
  for (const m of members) {
    if (!staffIds.has(m.userId)) continue; // do'kondan chiqarilgan xodimga yuborilmaydi
    if (opts.channelId && m.user.role === "EMPLOYEE" && !m.allChannels) {
      const has = await prisma.inboxChannelAccess.findUnique({ where: { channelId_userId: { channelId: opts.channelId, userId: m.userId } } });
      if (!has) continue;
    }
    if (opts.onlyOnShift && opts.now && opts.timeZone) {
      const shifts = await prisma.inboxShift.findMany({ where: { companyId, userId: m.userId } });
      if (!isOnShift(shifts, opts.now, opts.timeZone)) continue;
    }
    out.push({ userId: m.userId, name: m.user.name, chatId: m.telegramChatId });
  }
  return out;
}
