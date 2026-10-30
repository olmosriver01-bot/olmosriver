"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanAccessCompany, canEdit } from "@/lib/access";
import { ISSUE_PRIORITY_ORDER, ISSUE_STATUS_ORDER, type IssuePriority, type IssueStatus } from "@/lib/constants";

export type IssueInput = {
  title: string;
  cause?: string | null;
  solutionPlan?: string | null;
  ownerName?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  priority: IssuePriority;
  status: IssueStatus;
  notes?: string | null;
  questionId?: number | null;
  blockId?: number | null;
  auditId?: string | null;
  evidenceUrl?: string | null;
  evidenceName?: string | null;
};

function assertValid(input: IssueInput) {
  if (!input.title?.trim()) throw new Error("Вазифа номи киритилиши шарт");
  if (!ISSUE_PRIORITY_ORDER.includes(input.priority)) throw new Error("Нотўғри устуворлик даражаси");
  if (!ISSUE_STATUS_ORDER.includes(input.status)) throw new Error("Нотўғри ҳолат");
}

export async function createIssue(companyId: string, input: IssueInput) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  if (!canEdit(user.role)) throw new Error("Сизда вазифа яратиш ҳуқуқи йўқ");
  assertValid(input);

  const issue = await prisma.issue.create({
    data: {
      companyId,
      auditId: input.auditId ?? null,
      questionId: input.questionId ?? null,
      blockId: input.blockId ?? null,
      title: input.title.trim(),
      cause: input.cause ?? null,
      solutionPlan: input.solutionPlan ?? null,
      ownerName: input.ownerName ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      priority: input.priority,
      status: input.status,
      notes: input.notes ?? null,
      evidenceUrl: input.evidenceUrl ?? null,
      evidenceName: input.evidenceName ?? null,
      createdById: user.id,
    },
  });

  revalidatePath(`/c/${companyId}/issues`);
  return issue.id;
}

export async function updateIssue(companyId: string, issueId: string, input: Partial<IssueInput>) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);

  const existing = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!existing || existing.companyId !== companyId) throw new Error("Вазифа топилмади");

  // Xodim faqat holatni yangilashi mumkin (bajarilishini belgilash), boshqa maydonlarni emas.
  if (!canEdit(user.role)) {
    if (Object.keys(input).some((k) => k !== "status")) {
      throw new Error("Сизда фақат вазифа ҳолатини ўзгартириш ҳуқуқи бор");
    }
  }

  await prisma.issue.update({
    where: { id: issueId },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.cause !== undefined ? { cause: input.cause } : {}),
      ...(input.solutionPlan !== undefined ? { solutionPlan: input.solutionPlan } : {}),
      ...(input.ownerName !== undefined ? { ownerName: input.ownerName } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.evidenceUrl !== undefined ? { evidenceUrl: input.evidenceUrl } : {}),
      ...(input.evidenceName !== undefined ? { evidenceName: input.evidenceName } : {}),
    },
  });

  revalidatePath(`/c/${companyId}/issues`);
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function uploadIssueEvidence(companyId: string, formData: FormData) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  if (!canEdit(user.role)) throw new Error("Сизда ҳужжат бириктириш ҳуқуқи йўқ");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Файл танланмади");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Файл ҳажми 10MB дан ошмаслиги керак");

  const uploadDir = path.join(process.cwd(), "public", "uploads", "issues");
  await mkdir(uploadDir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const fileName = `${randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, fileName), buffer);

  return { url: `/uploads/issues/${fileName}`, name: file.name };
}

export async function deleteIssue(companyId: string, issueId: string) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  if (!canEdit(user.role)) throw new Error("Сизда вазифани ўчириш ҳуқуқи йўқ");
  await prisma.issue.delete({ where: { id: issueId } });
  revalidatePath(`/c/${companyId}/issues`);
}
