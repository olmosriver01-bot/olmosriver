import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Ban, CircleAlert, FileDown, FileSpreadsheet, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/access";
import { getAuditResult } from "@/lib/data";
import { prioritizeIssues } from "@/lib/scoring";
import { getQuestionById } from "@/lib/kpi-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { BlockBarChart } from "@/components/charts/block-bar-chart";
import { IssueFormDialog } from "@/components/issues/issue-form-dialog";
import { AiSummaryCard } from "./ai-summary-card";

export default async function AuditResultPage({ params }: { params: Promise<{ companyId: string; auditId: string }> }) {
  const { companyId, auditId } = await params;
  await requireUser();

  const audit = await prisma.audit.findUnique({ where: { id: auditId } });
  if (!audit || audit.companyId !== companyId) notFound();

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const result = await getAuditResult(auditId);
  if (!result) notFound();

  const existingIssueQuestionIds = new Set(
    (await prisma.issue.findMany({ where: { auditId }, select: { questionId: true } })).map((i) => i.questionId)
  );

  if (!result.isComplete) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <CircleAlert className="mx-auto h-10 w-10 text-warning" />
        <h1 className="mt-4 text-xl font-bold">Аудит ҳали якунланмаган</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.answeredCount} / {result.totalQuestions} саволга жавоб берилди. Якуний рейтинг, етуклик даражаси ва муаммоли
          соҳалар фақат барча 42 саволга жавоб берилгандан кейин чиқарилади.
        </p>
        <Button asChild className="mt-6">
          <Link href={`/c/${companyId}/audits/${auditId}`}>Аудитни давом эттириш</Link>
        </Button>
      </div>
    );
  }

  const issues = prioritizeIssues(result);
  const zeroIssues = issues.filter((i) => i.priority === "CRITICAL");
  const oneIssues = issues.filter((i) => i.priority === "HIGH");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/c/${companyId}/audits`} className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Барча аудитлар
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{audit.title} — таҳлил</h1>
          <p className="mt-1 text-sm text-muted-foreground">{company?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/audits/${auditId}/export/xlsx`}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </a>
          </Button>
          <Button variant="accent" asChild>
            <a href={`/api/audits/${auditId}/export/pdf`}>
              <FileDown className="h-4 w-4" /> PDF ҳисобот
            </a>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 py-6">
          <div>
            <p className="text-sm text-muted-foreground">Умумий балл</p>
            <p className="text-3xl font-bold">
              {result.totalScore} <span className="text-base font-normal text-muted-foreground">/ {result.maxTotalScore}</span>
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Фоиз</p>
            <p className="text-3xl font-bold">{result.percentDisplay.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Етуклик даражаси</p>
            <Badge className="mt-1 text-sm">{result.maturity?.label}</Badge>
          </div>
          <div className="flex-1 min-w-[240px] rounded-lg bg-surface-muted p-3 text-sm">{result.maturity?.recommendation}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>7 блок бўйича натижа</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <BlockBarChart
            data={result.blocks.map((b) => ({
              blockId: b.blockId,
              shortTitle: `${b.blockId}-блок`,
              percent: Math.round(b.percent * 1000) / 10,
              statusLabel: b.statusLabel,
            }))}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Блок</TableHead>
                <TableHead>Балл</TableHead>
                <TableHead>Фоиз</TableHead>
                <TableHead>Ҳолат</TableHead>
                <TableHead>Тавсия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.blocks.map((b) => (
                <TableRow key={b.blockId}>
                  <TableCell className="font-medium">{b.title}</TableCell>
                  <TableCell>{b.score} / {b.maxScore}</TableCell>
                  <TableCell>{Math.round(b.percent * 100)}%</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        b.status === "UNSATISFACTORY" ? "danger" : b.status === "WEAK" ? "warning" : b.status === "GOOD" ? "success" : "info"
                      }
                    >
                      {b.statusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">{b.weakRecommendation ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-success/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4 text-success" /> Кучли йўналиш</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{result.strongestBlock?.title}</p>
            <p className="text-sm text-muted-foreground">{Math.round((result.strongestBlock?.percent ?? 0) * 100)}%</p>
          </CardContent>
        </Card>
        <Card className="border-danger/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" /> Энг заиф соҳа (bottleneck)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{result.bottleneckText}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Ban className="h-4 w-4 text-danger" /> 0 балл олган мезонлар ({zeroIssues.length})</CardTitle>
          <CardDescription>Бу мезонлар критик устуворликка эга — биринчи навбатда бартараф этилиши тавсия этилади.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {zeroIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">0 балл олган мезонлар йўқ.</p>
          ) : (
            zeroIssues.map((i) => (
              <div key={i.questionId} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{i.questionText}</p>
                  <p className="text-xs text-muted-foreground">{i.blockTitle}</p>
                </div>
                {existingIssueQuestionIds.has(i.questionId) ? (
                  <Badge variant="outline">Вазифа яратилган</Badge>
                ) : (
                  <IssueFormDialog
                    companyId={companyId}
                    prefill={{
                      title: `${i.blockTitle}: ${getQuestionById(i.questionId)?.text ?? i.questionText}`,
                      priority: "CRITICAL",
                      status: "NEW",
                      questionId: i.questionId,
                      blockId: i.blockId,
                      auditId,
                    }}
                    trigger={<Button size="sm" variant="outline">Вазифага айлантириш</Button>}
                  />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> 1 балл олган мезонлар ({oneIssues.length})</CardTitle>
          <CardDescription>Қисман бажарилган мезонлар — юқори устуворликда тузатилиши тавсия этилади.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {oneIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">1 балл олган мезонлар йўқ.</p>
          ) : (
            oneIssues.map((i) => (
              <div key={i.questionId} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{i.questionText}</p>
                  <p className="text-xs text-muted-foreground">{i.blockTitle}</p>
                </div>
                {existingIssueQuestionIds.has(i.questionId) ? (
                  <Badge variant="outline">Вазифа яратилган</Badge>
                ) : (
                  <IssueFormDialog
                    companyId={companyId}
                    prefill={{
                      title: `${i.blockTitle}: ${getQuestionById(i.questionId)?.text ?? i.questionText}`,
                      priority: "HIGH",
                      status: "NEW",
                      questionId: i.questionId,
                      blockId: i.blockId,
                      auditId,
                    }}
                    trigger={<Button size="sm" variant="outline">Вазифага айлантириш</Button>}
                  />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AiSummaryCard companyId={companyId} auditId={auditId} />
    </div>
  );
}
