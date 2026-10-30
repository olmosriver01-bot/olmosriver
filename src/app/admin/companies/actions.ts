"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/access";

export type CompanyInput = {
  name: string;
  industry?: string | null;
  employeeCount?: number | null;
  logoUrl?: string | null;
};

export async function createCompany(input: CompanyInput) {
  await requireAdmin();
  if (!input.name?.trim()) throw new Error("Компания номи киритилиши шарт");
  const company = await prisma.company.create({
    data: {
      name: input.name.trim(),
      industry: input.industry || null,
      employeeCount: input.employeeCount ?? null,
      logoUrl: input.logoUrl || null,
    },
  });
  revalidatePath("/admin/companies");
  return company.id;
}

export async function updateCompany(companyId: string, input: CompanyInput) {
  await requireAdmin();
  await prisma.company.update({
    where: { id: companyId },
    data: {
      name: input.name.trim(),
      industry: input.industry || null,
      employeeCount: input.employeeCount ?? null,
      logoUrl: input.logoUrl || null,
    },
  });
  revalidatePath("/admin/companies");
  revalidatePath(`/admin/companies/${companyId}`);
}

export async function deleteCompany(companyId: string) {
  await requireAdmin();
  await prisma.company.delete({ where: { id: companyId } });
  revalidatePath("/admin/companies");
}

export async function addCompanyMember(companyId: string, userId: string) {
  await requireAdmin();
  await prisma.companyMember.upsert({
    where: { userId_companyId: { userId, companyId } },
    update: {},
    create: { userId, companyId },
  });
  revalidatePath(`/admin/companies/${companyId}`);
}

export async function removeCompanyMember(companyId: string, userId: string) {
  await requireAdmin();
  await prisma.companyMember.delete({ where: { userId_companyId: { userId, companyId } } });
  revalidatePath(`/admin/companies/${companyId}`);
}
