import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABELS, STATUS_LABELS, type ConversationStatus, type Platform } from "@/lib/inbox/core";
import { conversationScope, listStaff } from "@/lib/inbox/members";
import { formatLocal } from "@/lib/inbox/time";
import { coverageByChannel, coverageIncomplete } from "@/lib/inbox/coverage";
import { inboxPageCtx } from "./_components/ctx";
import { InboxNav } from "./_components/inbox-nav";
import { AutoRefresh, MonitoringNotice, TelegramLinkCard, WaitingTimer } from "./_components/client";

const STATUS_VARIANT: Record<ConversationStatus, "info" | "warning" | "default" | "outline"> = {
  NEW: "info",
  IN_PROGRESS: "warning",
  WAITING_CUSTOMER: "default",
  CLOSED: "outline",
};

type Search = { platform?: string; channel?: string; status?: string; assignee?: string; queue?: string };

export default async function InboxPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Search> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { user, settings, member, manager, admin } = await inboxPageCtx(companyId);

  const scope = await conversationScope(companyId, user);
  const filters: Prisma.InboxConversationWhereInput[] = [scope];
  if (sp.platform === "TELEGRAM" || sp.platform === "INSTAGRAM") filters.push({ channel: { platform: sp.platform } });
  if (sp.channel) filters.push({ channelId: sp.channel });
  if (sp.status && sp.status in STATUS_LABELS) filters.push({ status: sp.status });
  else if (sp.queue !== "waiting" && sp.queue !== "unassigned") filters.push({ status: { not: "CLOSED" } });
  if (sp.assignee === "me") filters.push({ assigneeId: user.id });
  else if (sp.assignee === "none") filters.push({ assigneeId: null });
  else if (sp.assignee) filters.push({ assigneeId: sp.assignee });
  if (sp.queue === "waiting") filters.push({ waitingSince: { not: null }, status: { not: "CLOSED" }, isSpam: false });
  if (sp.queue === "unassigned") filters.push({ assigneeId: null, status: { not: "CLOSED" }, isSpam: false });

  const [conversations, channels, staff, waitingCount, unassignedCount, pendingFindings] = await Promise.all([
    prisma.inboxConversation.findMany({
      where: { AND: filters },
      include: {
        channel: { select: { name: true, platform: true } },
        assignee: { select: { name: true } },
        messages: { orderBy: { sentAt: "desc" }, take: 1, select: { text: true, kind: true, direction: true, deletedAt: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 200,
    }),
    prisma.inboxChannel.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    manager ? listStaff(companyId) : Promise.resolve([]),
    prisma.inboxConversation.count({ where: { AND: [scope, { waitingSince: { not: null }, status: { not: "CLOSED" }, isSpam: false }] } }),
    prisma.inboxConversation.count({ where: { AND: [scope, { assigneeId: null, status: { not: "CLOSED" }, isSpam: false }] } }),
    manager ? prisma.inboxFinding.count({ where: { companyId, status: "PENDING" } }) : Promise.resolve(0),
  ]);

  // Javob kutayotganlar tepada (eng uzoq kutgan birinchi), qolganlari oxirgi xabar bo'yicha
  conversations.sort((a, b) => {
    const aw = a.waitingSince && a.status !== "CLOSED" ? a.waitingSince.getTime() : Infinity;
    const bw = b.waitingSince && b.status !== "CLOSED" ? b.waitingSince.getTime() : Infinity;
    if (aw !== bw) return aw - bw;
    return (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0);
  });

  const down = channels.filter((c) => c.status !== "CONNECTED");
  const coverage = await coverageByChannel(companyId);
  const blind = channels.filter((c) => c.status === "CONNECTED" && coverageIncomplete(coverage.get(c.id)));
  const base = `/c/${companyId}/inbox`;
  const qs = (patch: Partial<Search>) => {
    const next = { ...sp, ...patch } as Record<string, string | undefined>;
    const q = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `${base}?${q}` : base;
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap ${active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground/80"}`;
  const selectCls = "h-9 rounded-lg border border-border bg-surface px-2 text-sm";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <AutoRefresh />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ёзишмалар назорати</h1>
        <p className="mt-1 text-sm text-muted-foreground">Telegram ва Instagram профилларидаги мижоз суҳбатлари бир ойнада.</p>
      </div>
      <InboxNav companyId={companyId} manager={manager} admin={admin} pendingFindings={pendingFindings} />
      <MonitoringNotice companyId={companyId} acked={!!member.monitoringAckAt} />

      {channels.length === 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-semibold">Ҳали ҳеч қандай профил уланмаган</p>
          <p className="mt-1">
            Ёзишмалар кузатилмаяпти. {admin ? <Link className="text-accent underline" href={`${base}/settings`}>Созламаларда профил уланг</Link> : "Профилни админ улайди."}
          </p>
        </div>
      ) : down.length > 0 ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
          <p className="font-semibold text-danger">Уланиш муаммоси — қуйидаги профиллардан хабар келмаяпти</p>
          <ul className="mt-1 space-y-0.5">
            {down.map((c) => (
              <li key={c.id}>
                {c.name} ({PLATFORM_LABELS[c.platform as Platform]}): {c.statusDetail ?? "уланмаган"} · охирги муваффақиятли текширув: {formatLocal(c.lastSyncOkAt, settings.timezone)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Бу профиллардаги жавобсиз мижозлар рўйхатда кўринмаслиги мумкин.</p>
        </div>
      ) : null}

      {blind.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-semibold">Кузатув тўлиқ эмас — чиқувчи жавоблар келмаяпти</p>
          <ul className="mt-1 space-y-0.5">
            {blind.map((c) => (
              <li key={c.id}>
                {c.name} ({PLATFORM_LABELS[c.platform as Platform]}): {coverage.get(c.id)?.detail}.
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            Бу профиллардаги мижозлар «жавобсиз» деб ҳисобланмайди ва улар бўйича огоҳлантириш юборилмайди. Текшириш учун шу профилдан иловада бирор мижозга жавоб ёзинг — у
            суҳбатда кўринса, кузатув тикланади.
          </p>
        </div>
      )}

      <TelegramLinkCard companyId={companyId} linked={!!member.telegramChatId} botConnected={!!settings.tgBotTokenEnc} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        <Link className={chip(!sp.queue && !sp.assignee && !sp.status)} href={qs({ queue: undefined, assignee: undefined, status: undefined })}>Очиқ суҳбатлар</Link>
        <Link className={chip(sp.queue === "waiting")} href={qs({ queue: "waiting", status: undefined })}>Жавоб кутмоқда · {waitingCount}</Link>
        <Link className={chip(sp.queue === "unassigned")} href={qs({ queue: "unassigned", assignee: undefined, status: undefined })}>Бириктирилмаган · {unassignedCount}</Link>
        <Link className={chip(sp.assignee === "me")} href={qs({ assignee: sp.assignee === "me" ? undefined : "me", queue: sp.queue === "unassigned" ? undefined : sp.queue })}>Менинг суҳбатларим</Link>
      </div>

      <form method="get" action={base} className="flex flex-wrap items-center gap-2">
        {sp.queue && <input type="hidden" name="queue" value={sp.queue} />}
        <select name="platform" defaultValue={sp.platform ?? ""} className={selectCls} aria-label="Платформа">
          <option value="">Барча платформалар</option>
          <option value="TELEGRAM">Telegram</option>
          <option value="INSTAGRAM">Instagram</option>
        </select>
        <select name="channel" defaultValue={sp.channel ?? ""} className={selectCls} aria-label="Профил">
          <option value="">Барча профиллар</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className={selectCls} aria-label="Ҳолат">
          <option value="">Очиқ ҳолатлар</option>
          {(Object.keys(STATUS_LABELS) as ConversationStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {manager && (
          <select name="assignee" defaultValue={sp.assignee ?? ""} className={selectCls} aria-label="Масъул">
            <option value="">Барча масъуллар</option>
            <option value="none">Масъулсиз</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Фильтрлаш</button>
      </form>

      <ul className="space-y-2">
        {conversations.length === 0 && (
          <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {channels.length === 0 ? "Профил улангач суҳбатлар шу ерда пайдо бўлади." : "Бу фильтр бўйича суҳбат йўқ."}
          </li>
        )}
        {conversations.map((c) => {
          const last = c.messages[0];
          const snippet = !last ? "" : last.deletedAt ? "хабар ўчирилган" : last.text || `[${last.kind.toLowerCase()}]`;
          return (
            <li key={c.id}>
              <Link href={`${base}/${c.id}`} className="block rounded-xl border border-border bg-surface p-3.5 shadow-sm hover:border-accent/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.customerName || (c.customerUsername ? `@${c.customerUsername}` : "Мижоз")}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {PLATFORM_LABELS[c.channel.platform as Platform]} · {c.channel.name}
                    </p>
                  </div>
                  {c.waitingSince && c.status !== "CLOSED" ? (
                    <WaitingTimer since={c.waitingSince.toISOString()} warnMin={settings.managerMinutes} dangerMin={settings.adminMinutes} unverified={coverageIncomplete(coverage.get(c.channelId))} />
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">{formatLocal(c.lastMessageAt, settings.timezone)}</span>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-foreground/80">
                  {last?.direction === "OUT" ? <span className="text-muted-foreground">Биз: </span> : null}
                  {snippet}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant={STATUS_VARIANT[c.status as ConversationStatus]}>{c.isSpam ? "Спам" : STATUS_LABELS[c.status as ConversationStatus]}</Badge>
                  {c.assignee && <Badge variant="default">{c.assignee.name}</Badge>}
                  {c.orderRef && <Badge variant="success">Буюртма {c.orderRef}</Badge>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
