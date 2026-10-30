import Link from "next/link";
import { notFound } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  ClipboardList,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/access";
import { getAuditResult, getCompanyAudits, getCompanyIssuesSummary, getLatestCompletedAuditBefore } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BlockBarChart } from "@/components/charts/block-bar-chart";
import { MaturityGauge } from "@/components/charts/maturity-gauge";
import { formatDate } from "@/lib/utils";
import { canEdit } from "@/lib/access";

export default async function DashboardPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const user = await requireUser();

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) notFound();

  const audits = await getCompanyAudits(companyId);
  const latestCompleted = audits.find((a) => a.status === "COMPLETED");
  const inProgress = audits.find((a) => a.status === "DRAFT");
  const issuesSummary = await getCompanyIssuesSummary(companyId);

  const result = latestCompleted ? await getAuditResult(latestCompleted.id) : null;
  const previousAudit = latestCompleted
    ? await getLatestCompletedAuditBefore(companyId, latestCompleted.startedAt, latestCompleted.id)
    : null;
  const previousResult = previousAudit ? await getAuditResult(previousAudit.id) : null;

  const delta =
    result?.isComplete && previousResult?.isComplete ? result.percent * 100 - previousResult.percent * 100 : null;

  const maturityColor =
    result?.maturity?.level === 1
      ? "#dc2626"
      : result?.maturity?.level === 2
      ? "#d97706"
      : result?.maturity?.level === 3
      ? "#ca8a04"
      : result?.maturity?.level === 4
      ? "#16a34a"
      : "#2563eb";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {company.industry ?? "Фаолият йўналиши кўрсатилмаган"}
            {company.employeeCount ? ` · ${company.employeeCount} ходим` : ""}
            {latestCompleted ? ` · Охирги аудит: ${formatDate(latestCompleted.completedAt)}` : ""}
          </p>
        </div>
        {canEdit(user.role) && (
          <Button asChild>
            <Link href={`/c/${companyId}/audits`}>
              <Plus className="h-4 w-4" /> Янги аудит
            </Link>
          </Button>
        )}
      </div>

      {inProgress && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div>
                <p className="text-sm font-semibold">«{inProgress.title}» жараёнда</p>
                <p className="text-xs text-muted-foreground">
                  {inProgress._count.answers} / 42 саволга жавоб берилди. Аудит тўлиқ якунланмагунча якуний рейтинг чиқмайди.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="accent">
              <Link href={`/c/${companyId}/audits/${inProgress.id}`}>Давом эттириш</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!latestCompleted ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">Ҳали якунланган аудит мавжуд эмас</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Компаниянгиз KPI тизимининг етуклик даражасини кўриш учун биринчи аудитни бошланг ва 42 саволнинг ҳаммасига жавоб беринг.
            </p>
            {canEdit(user.role) && (
              <Button asChild className="mt-2">
                <Link href={`/c/${companyId}/audits`}>Аудитни бошлаш</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        result && (
          <>
            <div className="grid gap-4 lg:grid-cols-4">
              <Card className="lg:col-span-1">
                <CardHeader className="items-center pb-0 text-center">
                  <CardTitle>Умумий фоиз</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-2 pt-2">
                  <MaturityGauge percent={result.percentDisplay} color={maturityColor} />
                  <Badge variant="outline" className="text-center">
                    {result.maturity?.label}
                  </Badge>
                  {delta !== null && (
                    <p className={`flex items-center gap-1 text-xs font-medium ${delta >= 0 ? "text-success" : "text-danger"}`}>
                      {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      Олдинги аудитга нисбатан {delta >= 0 ? "+" : ""}
                      {delta.toFixed(1)}%
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>Тўпланган балл</CardDescription>
                  <CardTitle className="text-3xl font-bold">
                    {result.totalScore} <span className="text-base font-normal text-muted-foreground">/ {result.maxTotalScore}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={result.percentDisplay} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>Энг кучли йўналиш</CardDescription>
                  <CardTitle className="text-base">{result.strongestBlock?.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="success">{Math.round((result.strongestBlock?.percent ?? 0) * 100)}%</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>Энг заиф йўналиш</CardDescription>
                  <CardTitle className="text-base">{result.weakestBlock?.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="danger">{Math.round((result.weakestBlock?.percent ?? 0) * 100)}%</Badge>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Блоклар бўйича натижа</CardTitle>
                  <CardDescription>Ҳар бир блокнинг фоизи ва ҳолати (🔴 &lt;40% · 🟡 &lt;60% · 🟢 &lt;80% · 🔵 ≥80%)</CardDescription>
                </CardHeader>
                <CardContent>
                  <BlockBarChart
                    data={result.blocks.map((b) => ({
                      blockId: b.blockId,
                      shortTitle: `${b.blockId}-блок`,
                      percent: Math.round(b.percent * 1000) / 10,
                      statusLabel: b.statusLabel,
                    }))}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Бажарилиши керак бўлган вазифалар</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm"><ListChecks className="h-4 w-4 text-info" /> Очиқ вазифалар</span>
                    <span className="font-semibold">{issuesSummary.open}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-danger" /> Муддати ўтган</span>
                    <span className="font-semibold">{issuesSummary.overdue}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> Бажарилган</span>
                    <span className="font-semibold">{issuesSummary.done}</span>
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/c/${companyId}/issues`}>
                      Вазифаларни кўриш <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {result.bottleneckText && (
              <Card className="border-danger/30 bg-danger/5">
                <CardContent className="flex items-start gap-3 py-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                  <div>
                    <p className="text-sm font-semibold">Энг заиф соҳа (bottleneck)</p>
                    <p className="text-sm text-muted-foreground">{result.bottleneckText}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button asChild variant="link">
                <Link href={`/c/${companyId}/audits/${latestCompleted.id}/result`}>
                  Тўлиқ таҳлилни кўриш <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
