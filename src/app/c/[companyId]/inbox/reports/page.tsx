import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABELS, type Platform } from "@/lib/inbox/core";
import { computeReport, FINDING_TYPE_LABELS, reportPeriod, SEVERITY_LABELS } from "@/lib/inbox/report";
import { recipientsFor } from "@/lib/inbox/members";
import { formatDuration, formatLocal } from "@/lib/inbox/time";
import { inboxPageCtx } from "../_components/ctx";
import { InboxNav } from "../_components/inbox-nav";
import { SendReportButton } from "../_components/client";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : ""}`}>{value}</p>
    </div>
  );
}

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ period?: string }> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { settings, manager, admin } = await inboxPageCtx(companyId, "manager");
  const which = sp.period === "last" ? "last" : "current";
  const now = new Date();
  const p = reportPeriod(now, settings.reportTime, settings.timezone);
  const [from, to] = which === "last" ? [p.from, p.to] : [p.to, now];
  const r = await computeReport(companyId, from, to, now);
  const tz = settings.timezone;
  const base = `/c/${companyId}/inbox`;
  const recipients = await recipientsFor(companyId, "report");
  const monthAgo = new Date(now.getTime() - 30 * 86400_000);
  const ai = await prisma.inboxAiRun.aggregate({ where: { companyId, createdAt: { gte: monthAgo } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: { _all: true } });
  const link = (id: string) => (
    <Link className="shrink-0 font-medium text-accent underline" href={`${base}/${id}`}>
      Очиш
    </Link>
  );
  const tab = (key: string, label: string) => (
    <Link href={`${base}/reports?period=${key}`} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${which === key ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"}`}>
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ҳисобот</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ҳар куни {settings.reportTime} да ({tz}) Telegram орқали юборилади. Олувчилар:{" "}
          {recipients.length ? recipients.map((x) => `${x.name}${x.chatId ? "" : " (Telegram боғланмаган)"}`).join(", ") : "белгиланмаган"}.
        </p>
      </div>
      <InboxNav companyId={companyId} manager={manager} admin={admin} pendingFindings={r.pendingFindingsTotal} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {tab("current", "Жорий давр")}
          {tab("last", "Охирги якунланган давр")}
        </div>
        <SendReportButton companyId={companyId} which={which} />
      </div>
      <p className="text-sm">
        Давр: <span className="font-medium">{formatLocal(r.from, tz)} — {formatLocal(r.to, tz)}</span>
      </p>

      {!r.complete && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
          <p className="font-semibold text-danger">Маълумот тўлиқ эмас</p>
          <p className="mt-0.5 text-xs">Қуйидаги рақамлар фақат CRMга келиб тушган хабарлар бўйича. Рақам кичиклиги муаммо йўқлигини билдирмайди.</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {r.dataIssues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Қамраб олинган профиллар</h2>
        {r.channels.length === 0 && <p className="text-sm text-muted-foreground">Профил уланмаган.</p>}
        <ul className="space-y-1.5 text-sm">
          {r.channels.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={c.status === "CONNECTED" ? "success" : "danger"}>{c.status === "CONNECTED" ? "Уланган" : "Узилган"}</Badge>
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">{PLATFORM_LABELS[c.platform as Platform]}</span>
              <span className="text-xs text-muted-foreground">
                кузатув: {formatLocal(c.trackingStartedAt, tz)} дан · охирги кирувчи: {formatLocal(c.lastInboundAt, tz)} · охирги чиқувчи:{" "}
                {c.lastOutboundAt ? formatLocal(c.lastOutboundAt, tz) : "ҳали келмаган"} · охирги текширув: {formatLocal(c.lastSyncOkAt, tz)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Янги суҳбатлар" value={r.newConversations} />
        <Stat label="Ҳали жавоб кутмоқда" value={r.waiting.length} tone={r.waiting.length ? "danger" : undefined} />
        <Stat label={`${r.slaMinutes} дақиқадан кеч жавоб`} value={r.late.length} tone={r.late.length ? "warning" : undefined} />
        <Stat label="Муаллифи аниқланмаган хабар" value={r.unknownAuthor.messages} />
        <Stat label="Жавоб берилган мурожаат" value={r.repliedEpisodes} />
        <Stat label="Жавобсиз якунланган" value={r.closedWithoutReply} />
        <Stat label="Жавоби номаълум (кузатув тўлиқ эмас)" value={r.waitingUnverified.length} tone={r.waitingUnverified.length ? "warning" : undefined} />
        <Stat label="Текширилмаган топилма" value={r.pendingFindingsTotal} />
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Ҳали жавоб кутаётган мижозлар</h2>
        {r.waiting.length === 0 && <p className="text-sm text-muted-foreground">{r.complete ? "Ҳозир жавоб кутаётган мижоз йўқ." : "Келиб тушган хабарлар орасида жавоб кутаётгани йўқ (маълумот тўлиқ эмас)."}</p>}
        <ul className="divide-y divide-border text-sm">
          {r.waiting.map((w) => (
            <li key={w.conversationId} className="flex items-center justify-between gap-3 py-2">
              <span>{w.channelName} · {w.customer} · <span className="font-semibold text-danger">{formatDuration(w.waitedMs)}</span></span>
              {link(w.conversationId)}
            </li>
          ))}
        </ul>
      </section>

      {r.waitingUnverified.length > 0 && (
        <section className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <h2 className="mb-1 text-sm font-semibold">Жавоб берилгани номаълум: {r.waitingUnverified.length}</h2>
          <p className="mb-2 text-xs">Бу профилларда чиқувчи хабарлар CRMга келмаяпти, шунинг учун бу мижозлар «жавобсиз» деб ҳисобланмади. Суҳбатни иловада текширинг.</p>
          <ul className="divide-y divide-border text-sm">
            {r.waitingUnverified.map((w) => (
              <li key={w.conversationId} className="flex items-center justify-between gap-3 py-2">
                <span>{w.channelName} · {w.customer} · {formatDuration(w.waitedMs)}</span>
                {link(w.conversationId)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Профиллар бўйича</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1.5">Профил</th><th>Янги</th><th>Жавоб</th><th>Ўртача</th><th>Медиана</th><th>Кеч</th><th>Кутмоқда</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.channels.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 font-medium">{c.name}{c.outboundVerified ? "" : " ⚠️"}</td>
                  <td>{c.newConversations}</td>
                  <td>{c.replies}</td>
                  <td>{c.avgMs === null ? "—" : formatDuration(c.avgMs)}</td>
                  <td>{c.medianMs === null ? "—" : formatDuration(c.medianMs)}</td>
                  <td>{c.late}</td>
                  <td>{c.waiting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Кеч жавоб берилган суҳбатлар</h2>
        {r.late.length === 0 && <p className="text-sm text-muted-foreground">Йўқ.</p>}
        <ul className="divide-y divide-border text-sm">
          {r.late.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span>{l.channelName} · {formatDuration(l.latencyMs)}</span>
              {link(l.conversationId)}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">CRM панелидан жавоб берганлар</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1.5">Сотувчи</th><th>Жавоблар</th><th>Ўртача</th><th>Медиана</th><th>Кеч</th><th>Очиқ суҳбат</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.sellers.map((s) => (
                <tr key={s.userId}>
                  <td className="py-2 font-medium">{s.name}</td>
                  <td>{s.replies}</td>
                  <td>{s.avgMs === null ? "—" : formatDuration(s.avgMs)}</td>
                  <td>{s.medianMs === null ? "—" : formatDuration(s.medianMs)}</td>
                  <td>{s.late}</td>
                  <td>{s.openConversations}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-medium text-warning">Муаллиф аниқланмаган</td>
                <td>{r.unknownAuthor.replies}</td>
                <td>{r.unknownAuthor.avgMs === null ? "—" : formatDuration(r.unknownAuthor.avgMs)}</td>
                <td>—</td>
                <td>{r.unknownAuthor.late}</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Telegram ёки Instagram иловасидан тўғридан-тўғри ёзилган жавобларда API ходимни билдирмайди — улар ҳеч кимга ёзилмайди ва алоҳида қаторда туради.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Текшириш керак бўлган энг муҳим ҳолатлар</h2>
        {r.pendingFindings.length === 0 && <p className="text-sm text-muted-foreground">Текширилмаган топилма йўқ.</p>}
        <ul className="divide-y divide-border text-sm">
          {r.pendingFindings.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <span>{FINDING_TYPE_LABELS[f.type] ?? f.type} · {f.channelName} · жиддийлик: {SEVERITY_LABELS[f.severity]} · ишонч: {Math.round(f.confidence * 100)}%</span>
              {link(f.conversationId)}
            </li>
          ))}
        </ul>
        <h2 className="mb-2 mt-4 text-sm font-semibold">Шу даврда тасдиқланган камчиликлар</h2>
        {r.confirmedFindings.length === 0 && <p className="text-sm text-muted-foreground">Йўқ.</p>}
        <ul className="divide-y divide-border text-sm">
          {r.confirmedFindings.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <span>{FINDING_TYPE_LABELS[f.type] ?? f.type} · {f.channelName}</span>
              {link(f.conversationId)}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 text-sm">
        <h2 className="mb-1 text-sm font-semibold">AI таҳлили харажати</h2>
        <p>
          Шу давр: {r.aiRuns} та таҳлил, ≈ ${r.aiCostUsd.toFixed(3)}. Охирги 30 кун: {ai._count._all} та таҳлил, ≈ ${(ai._sum.costUsd ?? 0).toFixed(2)} (
          {(ai._sum.inputTokens ?? 0).toLocaleString("en-US")} кирувчи, {(ai._sum.outputTokens ?? 0).toLocaleString("en-US")} чиқувчи токен).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Харажат токенлар сони ва модел нархи бўйича ҳисобланган тахминий қиймат; аниқ ҳисоб Anthropic кабинетида.</p>
      </section>
    </div>
  );
}
