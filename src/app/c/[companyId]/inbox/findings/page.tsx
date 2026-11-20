import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABELS, type Platform } from "@/lib/inbox/core";
import { FINDING_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/inbox/report";
import { formatLocal } from "@/lib/inbox/time";
import { isAiConfigured } from "@/lib/inbox/ai";
import { inboxPageCtx } from "../_components/ctx";
import { InboxNav } from "../_components/inbox-nav";
import { FindingActions } from "../_components/client";

const TABS = [
  { key: "PENDING", label: "Текшириш керак" },
  { key: "CONFIRMED", label: "Тасдиқланган" },
  { key: "REJECTED", label: "Хато аниқланган" },
];
const RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export default async function FindingsPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ status?: string }> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { settings, manager, admin } = await inboxPageCtx(companyId, "manager");
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "PENDING";

  const findings = await prisma.inboxFinding.findMany({
    where: { companyId, status },
    include: { conversation: { include: { channel: { select: { name: true, platform: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  findings.sort((a, b) => (RANK[b.severity] ?? 0) - (RANK[a.severity] ?? 0) || b.confidence - a.confidence);
  const ids = [...new Set(findings.flatMap((f) => JSON.parse(f.messageIds) as string[]))];
  const messages = new Map(
    (await prisma.inboxMessage.findMany({ where: { id: { in: ids }, companyId }, include: { author: { select: { name: true } } } })).map((m) => [m.id, m])
  );
  const counts = await prisma.inboxFinding.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } });
  const count = (k: string) => counts.find((c) => c.status === k)?._count._all ?? 0;
  const base = `/c/${companyId}/inbox`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Сифат топилмалари</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI ёзишмаларни таҳлил қилиб, эҳтимолий камчиликларни далил билан кўрсатади. Ҳар бир топилмани раҳбар текширади: топилмалар профил
          ва суҳбат кесимида кўрсатилади, ҳеч бир ходимга бириктирилмайди. Мақсад — хизматни яхшилаш; AI мижозга ҳеч нарса юбормайди.
        </p>
      </div>
      <InboxNav companyId={companyId} manager={manager} admin={admin} pendingFindings={count("PENDING")} />

      {(!settings.aiEnabled || !isAiConfigured()) && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          AI таҳлили ҳозир ишламаяпти:{" "}
          {!isAiConfigured() ? "серверда ANTHROPIC_API_KEY созланмаган." : "созламаларда ўчирилган."} Янги топилмалар пайдо бўлмайди — бу «камчилик йўқ» дегани эмас.
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}/findings?status=${t.key}`}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${status === t.key ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"}`}
          >
            {t.label} · {count(t.key)}
          </Link>
        ))}
      </div>

      {findings.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Бу бўлимда топилма йўқ.</p>}
      <ul className="space-y-3">
        {findings.map((f) => {
          const evidence = (JSON.parse(f.messageIds) as string[]).map((id) => messages.get(id)).filter((m) => !!m).sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
          return (
            <li key={f.id} className="rounded-xl border border-border bg-surface p-4 text-sm shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={f.severity === "HIGH" ? "danger" : f.severity === "MEDIUM" ? "warning" : "default"}>Жиддийлик: {SEVERITY_LABELS[f.severity]}</Badge>
                <Badge variant="outline">Ишонч: {Math.round(f.confidence * 100)}%</Badge>
                <Badge variant="outline">{f.source === "RULE" ? "Қоида бўйича" : "AI"}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">{formatLocal(f.createdAt, settings.timezone)}</span>
              </div>
              <p className="mt-2 text-base font-semibold">{FINDING_TYPE_LABELS[f.type] ?? f.type}</p>
              <p className="text-xs text-muted-foreground">
                Профил: {f.conversation.channel.name} ({PLATFORM_LABELS[f.conversation.channel.platform as Platform]}) · Суҳбат:{" "}
                {f.conversation.customerName ?? (f.conversation.customerUsername ? `@${f.conversation.customerUsername}` : "Мижоз")}
              </p>
              <p className="mt-2"><span className="font-medium">Сабаб: </span>{f.reason}</p>
              {f.verification === "INSUFFICIENT_DATA" && <p className="mt-1 text-xs text-warning">Текшириш учун маълумот етарли эмас — CRMда тасдиқланган нарх/шарт манбаси йўқ.</p>}
              {f.verification === "VERIFIED_AGAINST_CRM" && <p className="mt-1 text-xs text-muted-foreground">CRMдаги тасдиқланган маълумот билан солиштирилган.</p>}

              <div className="mt-3 space-y-1.5 rounded-lg bg-surface-muted p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тегишли хабарлар</p>
                {evidence.length === 0 && <p className="text-xs text-muted-foreground">Хабарлар сақлаш муддати ўтгани учун ўчирилган.</p>}
                {evidence.map((m) => (
                  <p key={m.id} className="text-sm">
                    <span className="text-xs text-muted-foreground">
                      {formatLocal(m.sentAt, settings.timezone)} ·{" "}
                      {m.direction === "IN" ? "Мижоз" : m.authorType === "STAFF_PANEL" ? (m.author?.name ?? "Ходим") : m.authorType === "AUTO" ? "Автоматик жавоб" : "Профил жавоби (ходим аниқланмаган)"}:
                    </span>{" "}
                    {m.text || `[${m.kind.toLowerCase()}]`}
                  </p>
                ))}
              </div>

              {f.suggestedReply && (
                <p className="mt-3 rounded-lg border border-border p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тавсия этилган жавоб (лойиҳа)</span>
                  <br />
                  {f.suggestedReply}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <FindingActions companyId={companyId} findingId={f.id} status={f.status} suggestedReply={f.suggestedReply} />
                <Link className="text-sm font-medium text-accent underline" href={`${base}/${f.conversationId}`}>
                  Суҳбатни очиш
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
