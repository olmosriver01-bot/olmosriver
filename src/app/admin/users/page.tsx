import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UserFormDialog } from "./user-form-dialog";
import { UsersTable, type UserRow } from "./users-table";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { memberships: true } } },
  });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as UserRow["role"],
    companyCount: u._count.memberships,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Фойдаланувчилар</h1>
          <p className="mt-1 text-sm text-muted-foreground">Роллар: Admin (барчасига кириш), Manager (бириктирилган компаниялар), Employee (фақат кўриш).</p>
        </div>
        <UserFormDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Барча фойдаланувчилар</CardTitle>
          <CardDescription>Компанияларга бириктириш учун «Компаниялар» бўлимидаги аъзолар саҳифасидан фойдаланинг.</CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable rows={rows} currentUserId={admin.id} />
        </CardContent>
      </Card>
    </div>
  );
}
