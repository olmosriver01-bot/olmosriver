import { prisma } from "@/lib/prisma";
import { ensureSettings, recomputeConversation } from "./core";
import { runEscalations } from "./escalation";
import { runHealthChecks } from "./health";
import { sendScheduledReport } from "./report";
import { checkCallbackPromises, runAiBatch } from "./ai";
import { redact } from "./crypto";

const HEALTH_EVERY_MS = 5 * 60_000;

/** Saqlash muddati o'tgan yozishmalarni o'chiradi. */
export async function runRetention(companyId: string, now: Date = new Date()) {
  const settings = await ensureSettings(companyId);
  const cutoff = new Date(now.getTime() - settings.retentionDays * 86400_000);
  const affected = await prisma.inboxMessage.findMany({
    where: { companyId, sentAt: { lt: cutoff } },
    select: { conversationId: true },
    distinct: ["conversationId"],
  });
  const deleted = await prisma.inboxMessage.deleteMany({ where: { companyId, sentAt: { lt: cutoff } } });
  for (const a of affected) {
    const left = await prisma.inboxMessage.count({ where: { conversationId: a.conversationId } });
    if (left === 0) await prisma.inboxConversation.delete({ where: { id: a.conversationId } });
    else await recomputeConversation(a.conversationId);
  }
  await prisma.inboxWebhookEvent.deleteMany({ where: { companyId, receivedAt: { lt: new Date(now.getTime() - 14 * 86400_000) } } });
  await prisma.inboxAlert.deleteMany({ where: { companyId, createdAt: { lt: cutoff } } });
  await prisma.inboxSettings.update({ where: { companyId }, data: { lastRetentionAt: now } });
  return { deletedMessages: deleted.count };
}

export async function tickCompany(companyId: string, now: Date = new Date()) {
  const settings = await ensureSettings(companyId);
  const steps: [string, () => Promise<unknown>][] = [["escalations", () => runEscalations(companyId, now)]];
  if (!settings.tgLastCheckAt || now.getTime() - settings.tgLastCheckAt.getTime() >= HEALTH_EVERY_MS) {
    steps.unshift(["health", () => runHealthChecks(companyId, now)]);
  }
  steps.push(["promises", () => checkCallbackPromises(companyId, now)]);
  steps.push(["report", () => sendScheduledReport(companyId, now)]);
  steps.push(["ai", () => runAiBatch(companyId, now)]);
  if (!settings.lastRetentionAt || now.getTime() - settings.lastRetentionAt.getTime() >= 86400_000) {
    steps.push(["retention", () => runRetention(companyId, now)]);
  }
  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (e) {
      console.error(`[inbox] ${name} қадамида хато (${companyId}):`, redact(e instanceof Error ? e.message : String(e)));
    }
  }
}

export async function tickAll(now: Date = new Date()) {
  const companies = await prisma.inboxSettings.findMany({ select: { companyId: true } });
  for (const c of companies) await tickCompany(c.companyId, now);
  return companies.length;
}

const g = globalThis as unknown as { __inboxScheduler?: { timer: NodeJS.Timeout; running: boolean } };

/** Server ichidagi rejalashtiruvchi: har daqiqada eskalatsiya, ulanish tekshiruvi, hisobot. */
export function startScheduler() {
  if (g.__inboxScheduler || process.env.INBOX_SCHEDULER === "off") return;
  const state = { running: false, timer: null as unknown as NodeJS.Timeout };
  state.timer = setInterval(async () => {
    if (state.running) return;
    state.running = true;
    try {
      await tickAll();
    } catch (e) {
      console.error("[inbox] режалаштирувчи хатоси:", redact(e instanceof Error ? e.message : String(e)));
    } finally {
      state.running = false;
    }
  }, 60_000);
  state.timer.unref?.();
  g.__inboxScheduler = state;
}
