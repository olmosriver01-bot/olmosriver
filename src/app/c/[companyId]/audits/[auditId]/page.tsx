import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanAccessCompany, canEdit } from "@/lib/access";
import { BLOCKS } from "@/lib/kpi-data";
import { Button } from "@/components/ui/button";
import { AuditSurvey } from "./audit-survey";

export default async function AuditTakePage({ params }: { params: Promise<{ companyId: string; auditId: string }> }) {
  const { companyId, auditId } = await params;
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);

  const audit = await prisma.audit.findUnique({ where: { id: auditId }, include: { answers: true } });
  if (!audit || audit.companyId !== companyId) notFound();

  const initialAnswers: Record<number, { score: number | null; comment: string | null; evidenceUrl: string | null; evidenceName: string | null }> = {};
  for (const a of audit.answers) {
    initialAnswers[a.questionId] = {
      score: a.score,
      comment: a.comment,
      evidenceUrl: a.evidenceUrl,
      evidenceName: a.evidenceName,
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{audit.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            7 блок, 42 мезон. Ҳар бирига 0–3 балл қўйинг. Жавоблар автоматик сақланади.
          </p>
        </div>
        {audit.status === "COMPLETED" && (
          <Button asChild variant="accent">
            <Link href={`/c/${companyId}/audits/${auditId}/result`}>
              Натижани кўриш <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      <AuditSurvey
        companyId={companyId}
        auditId={auditId}
        blocks={BLOCKS}
        initialAnswers={initialAnswers}
        canEdit={canEdit(user.role)}
      />
    </div>
  );
}
