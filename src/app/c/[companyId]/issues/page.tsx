import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canEdit } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IssueFormDialog } from "@/components/issues/issue-form-dialog";
import { IssuesBoard, type IssueRow } from "./issues-board";

export default async function IssuesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const user = await requireUser();

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) notFound();

  const issues = await prisma.issue.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });

  const rows: IssueRow[] = issues.map((i) => ({
    id: i.id,
    title: i.title,
    cause: i.cause,
    solutionPlan: i.solutionPlan,
    ownerName: i.ownerName,
    startDate: i.startDate ? i.startDate.toISOString() : null,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    priority: i.priority as IssueRow["priority"],
    status: i.status as IssueRow["status"],
    notes: i.notes,
    blockId: i.blockId,
    questionId: i.questionId,
    auditId: i.auditId,
    evidenceUrl: i.evidenceUrl,
    evidenceName: i.evidenceName,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Вазифалар</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {company.name} — аудитда аниқланган муаммоларни бартараф этиш режаси. Вазифа бажарилиши аудит баллини
            автоматик оширмайди — балл фақат қайта аудит орқали ўзгаради.
          </p>
        </div>
        {canEdit(user.role) && <IssueFormDialog companyId={companyId} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Вазифалар рўйхати</CardTitle>
          <CardDescription>Ҳолатни ўзгартириш учун рўйхатдаги селектдан фойдаланинг.</CardDescription>
        </CardHeader>
        <CardContent>
          <IssuesBoard companyId={companyId} rows={rows} canEdit={canEdit(user.role)} />
        </CardContent>
      </Card>
    </div>
  );
}
