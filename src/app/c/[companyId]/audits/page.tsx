import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canEdit } from "@/lib/access";
import { getCompanyAudits, getAuditResult } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NewAuditDialog } from "./new-audit-dialog";
import { AuditsTable, type AuditRow } from "./audits-table";

export default async function AuditsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const user = await requireUser();

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) notFound();

  const audits = await getCompanyAudits(companyId);

  const rows: AuditRow[] = await Promise.all(
    audits.map(async (a) => {
      const result = a.status === "COMPLETED" ? await getAuditResult(a.id) : null;
      return {
        id: a.id,
        title: a.title,
        status: a.status as "DRAFT" | "COMPLETED",
        startedAt: a.startedAt.toISOString(),
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
        answeredCount: a._count.answers,
        issueCount: a._count.issues,
        percent: result?.isComplete ? result.percentDisplay : null,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KPI аудити</h1>
          <p className="mt-1 text-sm text-muted-foreground">{company.name} — барча аудитлар тарихи</p>
        </div>
        {canEdit(user.role) && <NewAuditDialog companyId={companyId} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Аудитлар рўйхати</CardTitle>
          <CardDescription>Якунланган аудитларни PDF/Excel ҳолатида юклаб олиш ва бир-бири билан солиштириш мумкин.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Ҳали аудит яратилмаган.</p>
          ) : (
            <AuditsTable companyId={companyId} rows={rows} isAdmin={user.role === "ADMIN"} canEdit={canEdit(user.role)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
