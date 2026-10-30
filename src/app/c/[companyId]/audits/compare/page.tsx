import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/access";
import { getAuditResult, getCompanyAudits } from "@/lib/data";
import { compareAudits } from "@/lib/scoring";
import { getQuestionById } from "@/lib/kpi-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatDate } from "@/lib/utils";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const { companyId } = await params;
  const { left, right } = await searchParams;
  await requireUser();

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) notFound();

  const audits = await getCompanyAudits(companyId);
  const completed = audits.filter((a) => a.status === "COMPLETED");

  if (!left || !right) {
    return (
      <div className="space-y-4">
        <Link href={`/c/${companyId}/audits`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Аудитлар
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Солиштириш учун «Аудитлар» саҳифасида 2 та якунланган аудитни танланг.
          </CardContent>
        </Card>
      </div>
    );
  }

  const leftAudit = audits.find((a) => a.id === left);
  const rightAudit = audits.find((a) => a.id === right);
  if (!leftAudit || !rightAudit) notFound();

  // Vaqt tartibida: oldingi (previous) va keyingi (current)
  const [olderAudit, newerAudit] = leftAudit.startedAt < rightAudit.startedAt ? [leftAudit, rightAudit] : [rightAudit, leftAudit];
  const olderResult = await getAuditResult(olderAudit.id);
  const newerResult = await getAuditResult(newerAudit.id);
  if (!olderResult || !newerResult) notFound();

  const diff = compareAudits(olderResult, newerResult);

  const resolved: { questionId: number; text: string }[] = [];
  const stillWeak: { questionId: number; text: string }[] = [];
  for (const block of newerResult.blocks) {
    const olderBlock = olderResult.blocks.find((b) => b.blockId === block.blockId)!;
    for (const qId of [...olderBlock.zeroScoreQuestionIds, ...olderBlock.oneScoreQuestionIds]) {
      const wasWeak = true;
      const nowWeak = block.zeroScoreQuestionIds.includes(qId) || block.oneScoreQuestionIds.includes(qId);
      const text = getQuestionById(qId)?.text ?? "";
      if (wasWeak && !nowWeak) resolved.push({ questionId: qId, text });
      if (wasWeak && nowWeak) stillWeak.push({ questionId: qId, text });
    }
  }

  const trendResults = await Promise.all(completed.map((a) => getAuditResult(a.id)));
  const trend = completed
    .map((a, idx) => ({ a, r: trendResults[idx] }))
    .filter((x) => x.r?.isComplete)
    .sort((x, y) => x.a.startedAt.getTime() - y.a.startedAt.getTime())
    .map((x) => ({ label: formatDate(x.a.completedAt ?? x.a.startedAt), percent: x.r!.percentDisplay }));

  return (
    <div className="space-y-6">
      <Link href={`/c/${companyId}/audits`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Аудитлар
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Аудитларни солиштириш</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {olderAudit.title} ({formatDate(olderAudit.completedAt)}) → {newerAudit.title} ({formatDate(newerAudit.completedAt)})
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-8 py-6">
          <div>
            <p className="text-sm text-muted-foreground">{olderAudit.title}</p>
            <p className="text-2xl font-bold">{olderResult.percentDisplay.toFixed(1)}%</p>
          </div>
          <div className="text-2xl text-muted-foreground">→</div>
          <div>
            <p className="text-sm text-muted-foreground">{newerAudit.title}</p>
            <p className="text-2xl font-bold">{newerResult.percentDisplay.toFixed(1)}%</p>
          </div>
          {diff.overallDeltaPercent !== null && (
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                diff.overallDeltaPercent >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
              }`}
            >
              {diff.overallDeltaPercent >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {diff.overallDeltaPercent >= 0 ? "+" : ""}
              {(diff.overallDeltaPercent * 100).toFixed(1)}%
            </div>
          )}
        </CardContent>
      </Card>

      {trend.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Вақт давомида ривожланиш</CardTitle>
            <CardDescription>Барча якунланган аудитлар бўйича умумий фоиз тенденцияси</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={trend} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Блоклар бўйича ўзгариш</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Блок</TableHead>
                <TableHead>{olderAudit.title}</TableHead>
                <TableHead>{newerAudit.title}</TableHead>
                <TableHead>Фарқ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diff.blockDeltas.map((b) => (
                <TableRow key={b.blockId}>
                  <TableCell className="font-medium">{b.title}</TableCell>
                  <TableCell>{b.previousPercent !== null ? `${Math.round(b.previousPercent * 100)}%` : "—"}</TableCell>
                  <TableCell>{Math.round(b.currentPercent * 100)}%</TableCell>
                  <TableCell>
                    {b.deltaPercent === null ? (
                      "—"
                    ) : (
                      <span
                        className={`flex items-center gap-1 text-sm font-medium ${
                          b.deltaPercent > 0 ? "text-success" : b.deltaPercent < 0 ? "text-danger" : "text-muted-foreground"
                        }`}
                      >
                        {b.deltaPercent > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : b.deltaPercent < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                        {b.deltaPercent > 0 ? "+" : ""}
                        {Math.round(b.deltaPercent * 100)}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-success/30">
          <CardHeader>
            <CardTitle>Бартараф этилган муаммолар ({resolved.length})</CardTitle>
            <CardDescription>Олдин 0/1 балл бўлган, энди 2 ва ундан юқори баллга кўтарилган мезонлар</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {resolved.length === 0 ? (
              <p className="text-sm text-muted-foreground">Йўқ</p>
            ) : (
              resolved.map((r) => (
                <div key={r.questionId} className="flex items-center gap-2 text-sm">
                  <Badge variant="success">✓</Badge> {r.text}
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="border-danger/30">
          <CardHeader>
            <CardTitle>Ҳали заиф соҳалар ({stillWeak.length})</CardTitle>
            <CardDescription>Икки аудитда ҳам 0/1 балл олган мезонлар</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stillWeak.length === 0 ? (
              <p className="text-sm text-muted-foreground">Йўқ</p>
            ) : (
              stillWeak.map((r) => (
                <div key={r.questionId} className="flex items-center gap-2 text-sm">
                  <Badge variant="danger">!</Badge> {r.text}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
