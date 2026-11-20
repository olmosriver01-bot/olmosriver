import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABELS, STATUS_LABELS, type ConversationStatus, type Platform } from "@/lib/inbox/core";
import { getConversationForUser, listStaff } from "@/lib/inbox/members";
import { formatLocal, msSince } from "@/lib/inbox/time";
import { isAiConfigured } from "@/lib/inbox/ai";
import { coverageIncomplete, outboundCoverage } from "@/lib/inbox/coverage";
import { FINDING_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/inbox/report";
import { cn } from "@/lib/utils";
import { inboxPageCtx } from "../_components/ctx";
import { AutoRefresh, Composer, ConversationControls, FindingActions, WaitingTimer } from "../_components/client";

const EVENT_LABELS: Record<string, string> = { CLOSE: "Якунланди", REOPEN: "Қайта очилди", SPAM: "Спам деб белгиланди", UNSPAM: "Спам белгиси олинди", ORDER_LINK: "Буюртма" };

export default async function ConversationPage({ params }: { params: Promise<{ companyId: string; conversationId: string }> }) {
  const { companyId, conversationId } = await params;
  const { user, settings, manager, admin } = await inboxPageCtx(companyId);
  const allowed = await getConversationForUser(companyId, conversationId, user);
  if (!allowed) notFound();

  const [conv, staff, findings] = await Promise.all([
    prisma.inboxConversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        channel: true,
        messages: { orderBy: { sentAt: "asc" }, include: { author: { select: { name: true } } } },
        events: { orderBy: { createdAt: "asc" } },
      },
    }),
    listStaff(companyId),
    manager ? prisma.inboxFinding.findMany({ where: { conversationId, companyId }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
  ]);
  const tz = settings.timezone;
  const name = new Map(staff.map((s) => [s.id, s.name]));
  const flagged = new Set(findings.filter((f) => f.status !== "REJECTED").flatMap((f) => JSON.parse(f.messageIds) as string[]));
  const channel = conv.channel;
  const cov = await outboundCoverage(channel.id);
  const unverified = coverageIncomplete(cov);

  const windowClosed = !conv.lastCustomerAt || msSince(conv.lastCustomerAt) > 24 * 3600_000;
  const lockedByOther = !manager && conv.assigneeId !== null && conv.assigneeId !== user.id;
  const disabledReason =
    channel.status !== "CONNECTED" ? `Профил уланмаган (${channel.statusDetail ?? "сабаб номаълум"}) — панелдан жавоб юбориб бўлмайди.`
    : !channel.canReply ? "Бу профилда ботга жавоб ёзиш ҳуқуқи берилмаган. Telegram Business → Chatbots созламасида рухсат беринг."
    : windowClosed ? "Мижознинг охирги хабаридан 24 соатдан кўп ўтган — платформа қоидаси бўйича API орқали ёзиб бўлмайди. Иловадан тўғридан-тўғри ёзинг."
    : lockedByOther ? "Суҳбат бошқа сотувчига бириктирилган."
    : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_20rem]">
      <AutoRefresh seconds={15} />
      <section className="flex min-h-[70vh] flex-col rounded-xl border border-border bg-surface">
        <header className="flex items-start gap-3 border-b border-border p-3.5">
          <Link href={`/c/${companyId}/inbox`} className="mt-0.5 rounded-md p-1.5 hover:bg-surface-muted" aria-label="Орқага">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{conv.customerName || (conv.customerUsername ? `@${conv.customerUsername}` : "Мижоз")}</p>
            <p className="truncate text-xs text-muted-foreground">
              {PLATFORM_LABELS[channel.platform as Platform]} · {channel.name}
              {conv.customerUsername ? ` · @${conv.customerUsername}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="info">{conv.isSpam ? "Спам" : STATUS_LABELS[conv.status as ConversationStatus]}</Badge>
              {conv.waitingSince && conv.status !== "CLOSED" && (
                <WaitingTimer since={conv.waitingSince.toISOString()} warnMin={settings.managerMinutes} dangerMin={settings.adminMinutes} unverified={unverified} />
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto p-3.5">
          <p className="mx-auto max-w-md rounded-lg bg-surface-muted px-3 py-1.5 text-center text-[11px] text-muted-foreground">
            Бу профилда кузатув {formatLocal(channel.trackingStartedAt, tz)} да бошланган. Ундан олдинги ёзишмалар CRMда йўқ.
          </p>
          {unverified && (
            <p className="mx-auto max-w-md rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-center text-[11px]">
              Бу профилда чиқувчи хабарлар CRMга келмаяпти: {cov.detail}. Мижозга иловадан жавоб берилган бўлиши мумкин.
            </p>
          )}
          {conv.messages.map((m) => {
            const out = m.direction === "OUT";
            const who =
              m.authorType === "CUSTOMER" ? null
              : m.authorType === "STAFF_PANEL" ? (m.author?.name ?? "Ходим (ўчирилган ҳисоб)")
              : m.authorType === "AUTO" ? "Автоматик жавоб"
              : `${channel.name} профилидан · иловадан ёзилган, ходим аниқланмаган`;
            return (
              <div key={m.id} id={`m-${m.id}`} className={cn("flex", out ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                    out ? "bg-accent/10" : "bg-surface-muted",
                    m.authorType === "AUTO" && "border border-dashed border-border bg-transparent",
                    flagged.has(m.id) && "ring-2 ring-warning/60",
                    m.deletedAt && "opacity-60"
                  )}
                >
                  {who && <p className={cn("mb-0.5 text-[11px] font-semibold", "text-muted-foreground")}>{who}</p>}
                  <p className={cn("whitespace-pre-wrap break-words", m.deletedAt && "line-through")}>
                    {m.kind === "REACTION" ? `Реакция: ${m.text}` : m.text || `[${m.kind.toLowerCase()}]`}
                  </p>
                  {m.originalText !== null && <p className="mt-1 border-t border-border pt-1 text-xs text-muted-foreground">Таҳрирдан олдин: {m.originalText}</p>}
                  <p className="mt-1 text-right text-[10px] text-muted-foreground">
                    {formatLocal(m.sentAt, tz)}
                    {m.editedAt ? " · таҳрирланган" : ""}
                    {m.deletedAt ? " · ўчирилган" : ""}
                    {m.deliveryStatus === "PENDING" ? " · юборилмоқда" : ""}
                    {m.deliveryStatus === "FAILED" ? " · ❌ юборилмади" : ""}
                    {m.deliveryStatus === "UNKNOWN" ? " · ⚠️ етиб боргани номаълум" : ""}
                  </p>
                  {m.deliveryStatus === "FAILED" && m.deliveryError && <p className="text-[11px] text-danger">{m.deliveryError}</p>}
                </div>
              </div>
            );
          })}
          {conv.messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Хабарлар йўқ (сақлаш муддати ўтган бўлиши мумкин).</p>}
        </div>

        <footer className="sticky bottom-0 border-t border-border bg-surface p-3">
          <Composer companyId={companyId} conversationId={conv.id} disabledReason={disabledReason} />
          <p className="mt-1.5 text-[11px] text-muted-foreground">CRMдан жавоб бериш ихтиёрий — иловадан ёзилган жавоблар ҳам шу ерда кўринади. Бу ердан юборилган хабар логинингиз билан сақланади; AI мижозга ҳеч нарса юбормайди.</p>
        </footer>
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <ConversationControls
            companyId={companyId}
            conversationId={conv.id}
            status={conv.status}
            isSpam={conv.isSpam}
            assigneeId={conv.assigneeId}
            orderRef={conv.orderRef}
            staff={staff.map((s) => ({ id: s.id, name: s.name }))}
            meId={user.id}
            manager={manager}
            admin={admin}
            aiAvailable={isAiConfigured()}
          />
        </div>

        {manager && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-2 text-sm font-semibold">AI топилмалари</p>
            {findings.length === 0 && <p className="text-xs text-muted-foreground">Бу суҳбат бўйича топилма йўқ.</p>}
            <ul className="space-y-3">
              {findings.map((f) => (
                <li key={f.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={f.severity === "HIGH" ? "danger" : f.severity === "MEDIUM" ? "warning" : "default"}>{SEVERITY_LABELS[f.severity]}</Badge>
                    <Badge variant="outline">ишонч {Math.round(f.confidence * 100)}%</Badge>
                    <Badge variant={f.status === "CONFIRMED" ? "danger" : f.status === "REJECTED" ? "outline" : "info"}>
                      {f.status === "CONFIRMED" ? "Тасдиқланган" : f.status === "REJECTED" ? "Хато аниқланган" : "Текширилмаган"}
                    </Badge>
                  </div>
                  <p className="mt-1.5 font-medium">{FINDING_TYPE_LABELS[f.type] ?? f.type}</p>
                  <p className="mt-0.5 text-foreground/80">{f.reason}</p>
                  {f.verification === "INSUFFICIENT_DATA" && <p className="mt-1 text-xs text-warning">Текшириш учун маълумот етарли эмас (CRMда тасдиқланган манба йўқ).</p>}
                  {f.suggestedReply && <p className="mt-2 rounded-md bg-surface-muted p-2 text-xs"><span className="font-semibold">Тавсия этилган жавоб: </span>{f.suggestedReply}</p>}
                  <div className="mt-2">
                    <FindingActions companyId={companyId} findingId={f.id} status={f.status} suggestedReply={f.suggestedReply} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-sm font-semibold">Бириктириш ва ҳолат тарихи</p>
          {conv.events.length === 0 && <p className="text-xs text-muted-foreground">Ҳали ўзгариш йўқ.</p>}
          <ul className="space-y-2 text-xs">
            {conv.events.map((e) => (
              <li key={e.id} className="border-l-2 border-border pl-2">
                <p className="text-muted-foreground">{formatLocal(e.createdAt, tz)}</p>
                <p>
                  {e.type === "ASSIGN"
                    ? `${e.fromUserId ? (name.get(e.fromUserId) ?? "Ходим") : "Масъулсиз"} → ${e.toUserId ? (name.get(e.toUserId) ?? "Ходим") : "масъулсиз"}`
                    : (EVENT_LABELS[e.type] ?? e.type)}
                  {e.byUserId ? ` · ${name.get(e.byUserId) ?? "ходим"}` : " · автоматик"}
                </p>
                {e.note && <p className="text-muted-foreground">{e.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
