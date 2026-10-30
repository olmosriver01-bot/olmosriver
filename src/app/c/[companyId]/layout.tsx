import { notFound, redirect } from "next/navigation";
import { requireUser, canAccessCompany } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ShellWrapper } from "@/components/layout/shell-wrapper";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const user = await requireUser();

  const ok = await canAccessCompany(user, companyId);
  if (!ok) redirect("/select-company");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) notFound();

  return <ShellWrapper user={user} currentCompanyId={companyId}>{children}</ShellWrapper>;
}
