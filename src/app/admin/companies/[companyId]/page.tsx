import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MembersTable, type UserRow } from "./members-table";

export default async function CompanyMembersPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  await requireAdmin();

  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { members: true } });
  if (!company) notFound();

  const memberIds = new Set(company.members.map((m) => m.userId));
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as UserRow["role"],
    isMember: memberIds.has(u.id),
  }));

  return (
    <div className="space-y-6">
      <Link href="/admin/companies" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Компаниялар
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{company.name} — аъзолар</h1>

      <Card>
        <CardHeader>
          <CardTitle>Фойдаланувчиларни бириктириш</CardTitle>
          <CardDescription>
            Менежер ва ходимлар фақат ўзларига бириктирилган компания маълумотларини кўра олади.
            Администратор барча компанияларга автоматик киради.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MembersTable companyId={companyId} rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
