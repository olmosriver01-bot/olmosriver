import { prisma } from "./prisma";
import { computeAuditResult, type AnswerMap, type AuditResult } from "./scoring";

export function answersToMap(answers: { questionId: number; score: number | null; comment: string | null }[]): AnswerMap {
  const map: AnswerMap = {};
  for (const a of answers) {
    map[a.questionId] = { score: a.score, comment: a.comment };
  }
  return map;
}

export async function getAuditResult(auditId: string): Promise<AuditResult | null> {
  const answers = await prisma.auditAnswer.findMany({ where: { auditId } });
  if (answers.length === 0) {
    return computeAuditResult({});
  }
  return computeAuditResult(answersToMap(answers));
}

export async function getCompanyAudits(companyId: string) {
  return prisma.audit.findMany({
    where: { companyId },
    orderBy: { startedAt: "desc" },
    include: { _count: { select: { answers: true, issues: true } }, createdBy: { select: { name: true } } },
  });
}

export async function getLatestCompletedAuditBefore(companyId: string, beforeDate: Date, excludeAuditId?: string) {
  return prisma.audit.findFirst({
    where: {
      companyId,
      status: "COMPLETED",
      startedAt: { lt: beforeDate },
      id: excludeAuditId ? { not: excludeAuditId } : undefined,
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function getLatestCompletedAudit(companyId: string) {
  return prisma.audit.findFirst({
    where: { companyId, status: "COMPLETED" },
    orderBy: { startedAt: "desc" },
  });
}

export async function getCompanyIssuesSummary(companyId: string) {
  const issues = await prisma.issue.findMany({ where: { companyId } });
  const open = issues.filter((i) => i.status !== "DONE");
  const overdue = open.filter((i) => i.dueDate && new Date(i.dueDate) < new Date());
  return { total: issues.length, open: open.length, done: issues.length - open.length, overdue: overdue.length };
}
