import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import type { GlobalRole } from "./constants";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: GlobalRole;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/select-company");
  return user;
}

/** ADMIN uchun null qaytaradi (= cheklovsiz, hamma kompaniya), boshqalar uchun ruxsat berilgan companyId lar ro'yxati. */
export async function getAccessibleCompanyIds(user: SessionUser): Promise<string[] | null> {
  if (user.role === "ADMIN") return null;
  const memberships = await prisma.companyMember.findMany({
    where: { userId: user.id },
    select: { companyId: true },
  });
  return memberships.map((m) => m.companyId);
}

export async function getAccessibleCompanies(user: SessionUser) {
  if (user.role === "ADMIN") {
    return prisma.company.findMany({ orderBy: { name: "asc" } });
  }
  return prisma.company.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { name: "asc" },
  });
}

export async function canAccessCompany(user: SessionUser, companyId: string): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const membership = await prisma.companyMember.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
  });
  return !!membership;
}

export async function assertCanAccessCompany(user: SessionUser, companyId: string) {
  const ok = await canAccessCompany(user, companyId);
  if (!ok) throw new Error("Бу компания маълумотларига рухсатингиз йўқ");
}

/** Faqat ADMIN va MANAGER audit/vazifa yarata va tahrirlay oladi; EMPLOYEE faqat ko'radi (va o'ziga tayinlangan vazifa holatini yangilaydi). */
export function canEdit(role: GlobalRole): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
