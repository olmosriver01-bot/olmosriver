import { prisma } from "@/lib/prisma";
import { ensureSettings, PLATFORM_LABELS, type Platform } from "./core";
import { leadershipRecipients } from "./members";
import { conversationUrl, notifyOnce } from "./notify";
import { formatLocal } from "./time";
import { customerLabel, evidenceQuote, FINDING_TYPE_LABELS, SEVERITY_LABELS } from "./labels";

/**
 * Yangi topilma haqida rahbarga xabar. Topilma profil va suhbat kesimida
 * ko'rsatiladi — hech bir xodimga biriktirilmaydi.
 */
export async function notifyFinding(findingId: string) {
  const f = await prisma.inboxFinding.findUnique({ where: { id: findingId }, include: { conversation: { include: { channel: true } } } });
  if (!f) return;
  const settings = await ensureSettings(f.companyId);
  const ids = JSON.parse(f.messageIds) as string[];
  const messages = await prisma.inboxMessage.findMany({ where: { id: { in: ids }, companyId: f.companyId }, orderBy: { sentAt: "asc" }, take: 4 });
  const lines = [
    `🔎 Эҳтимолий камчилик: ${FINDING_TYPE_LABELS[f.type] ?? f.type}`,
    `Профил: ${f.conversation.channel.name} (${PLATFORM_LABELS[f.conversation.channel.platform as Platform]})`,
    `Суҳбат: ${customerLabel(f.conversation)}`,
    `Сабаб: ${f.reason}`,
    `Жиддийлик: ${SEVERITY_LABELS[f.severity] ?? f.severity} · ишонч: ${Math.round(f.confidence * 100)}%`,
  ];
  if (f.verification === "INSUFFICIENT_DATA") lines.push("Текшириш учун маълумот етарли эмас (тасдиқланган нарх/шарт манбаси йўқ).");
  if (messages.length) {
    lines.push("", "Далил:");
    for (const m of messages) {
      const who = m.direction === "IN" ? "Мижоз" : m.authorType === "AUTO" ? "Автоматик жавоб" : "Профил жавоби";
      lines.push(`• ${formatLocal(m.sentAt, settings.timezone)} · ${who}: «${evidenceQuote(m.text, m.kind)}»`);
    }
  }
  if (f.suggestedReply) lines.push("", `Тавсия этилган жавоб: «${f.suggestedReply.slice(0, 600)}»`);
  lines.push("", "Бу AI/қоида хулосаси — текширилмаган. CRMда «тасдиқлаш» ёки «хато аниқланган» деб белгиланг.");
  await notifyOnce({
    companyId: f.companyId,
    kind: "FINDING",
    dedupeBase: `finding:${f.id}`,
    recipients: await leadershipRecipients(f.companyId),
    text: lines.join("\n"),
    buttons: [{ text: "Суҳбатни очиш", url: conversationUrl(f.companyId, f.conversationId) }],
    conversationId: f.conversationId,
    channelId: f.conversation.channelId,
  });
}
