"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanAccessCompany, canEdit } from "@/lib/access";
import { TOTAL_QUESTIONS } from "@/lib/kpi-data";

export async function createAudit(companyId: string, title: string) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  if (!canEdit(user.role)) throw new Error("Сизда янги аудит яратиш ҳуқуқи йўқ");

  const audit = await prisma.audit.create({
    data: { companyId, title: title.trim() || "Янги аудит", status: "DRAFT", createdById: user.id },
  });
  revalidatePath(`/c/${companyId}/audits`);
  return audit.id;
}

export async function deleteAudit(companyId: string, auditId: string) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  if (user.role !== "ADMIN") throw new Error("Фақат администратор аудитни ўчира олади");
  await prisma.audit.delete({ where: { id: auditId } });
  revalidatePath(`/c/${companyId}/audits`);
}

export async function saveAnswer(
  companyId: string,
  auditId: string,
  questionId: number,
  data: { score?: number | null; comment?: string | null }
) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  if (!canEdit(user.role)) throw new Error("Сизда жавобларни таҳрирлаш ҳуқуқи йўқ");

  await prisma.auditAnswer.upsert({
    where: { auditId_questionId: { auditId, questionId } },
    update: {
      ...(data.score !== undefined ? { score: data.score } : {}),
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
    },
    create: {
      auditId,
      questionId,
      score: data.score ?? null,
      comment: data.comment ?? null,
    },
  });

  const answeredCount = await prisma.auditAnswer.count({ where: { auditId, score: { not: null } } });
  const isComplete = answeredCount === TOTAL_QUESTIONS;
  const audit = await prisma.audit.findUnique({ where: { id: auditId } });

  if (isComplete && audit?.status !== "COMPLETED") {
    await prisma.audit.update({ where: { id: auditId }, data: { status: "COMPLETED", completedAt: new Date() } });
  } else if (!isComplete && audit?.status === "COMPLETED") {
    await prisma.audit.update({ where: { id: auditId }, data: { status: "DRAFT", completedAt: null } });
  }

  revalidatePath(`/c/${companyId}/audits/${auditId}`);
  revalidatePath(`/c/${companyId}/dashboard`);
  return { answeredCount, isComplete };
}

export async function saveEvidence(
  companyId: string,
  auditId: string,
  questionId: number,
  evidenceUrl: string | null,
  evidenceName: string | null
) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  if (!canEdit(user.role)) throw new Error("Сизда ҳужжат бириктириш ҳуқуқи йўқ");

  await prisma.auditAnswer.upsert({
    where: { auditId_questionId: { auditId, questionId } },
    update: { evidenceUrl, evidenceName },
    create: { auditId, questionId, score: null, evidenceUrl, evidenceName },
  });
  revalidatePath(`/c/${companyId}/audits/${auditId}`);
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function uploadEvidence(companyId: string, auditId: string, questionId: number, formData: FormData) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  if (!canEdit(user.role)) throw new Error("Сизда ҳужжат бириктириш ҳуқуқи йўқ");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Файл танланмади");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Файл ҳажми 10MB дан ошмаслиги керак");

  const uploadDir = path.join(process.cwd(), "public", "uploads", auditId);
  await mkdir(uploadDir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const fileName = `${questionId}-${randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, fileName), buffer);

  const url = `/uploads/${auditId}/${fileName}`;
  await saveEvidence(companyId, auditId, questionId, url, file.name);
  return { url, name: file.name };
}

export async function renameAudit(companyId: string, auditId: string, title: string) {
  const user = await requireUser();
  await assertCanAccessCompany(user, companyId);
  if (!canEdit(user.role)) throw new Error("Рухсат йўқ");
  await prisma.audit.update({ where: { id: auditId }, data: { title: title.trim() || "Номсиз аудит" } });
  revalidatePath(`/c/${companyId}/audits`);
}
