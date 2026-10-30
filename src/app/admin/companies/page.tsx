import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CompanyFormDialog } from "./company-form-dialog";
import { CompaniesTable, type CompanyRow } from "./companies-table";

export default async function AdminCompaniesPage() {
  await requireAdmin();

  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { members: true, audits: true } } },
  });

  const rows: CompanyRow[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    industry: c.industry,
    employeeCount: c.employeeCount,
    memberCount: c._count.members,
    auditCount: c._count.audits,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Компаниялар</h1>
          <p className="mt-1 text-sm text-muted-foreground">Барча компанияларни ва уларнинг маълумотларини бошқаринг.</p>
        </div>
        <CompanyFormDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Барча компаниялар</CardTitle>
          <CardDescription>Ҳар бир компаниянинг маълумотлари бошқаларидан алоҳида сақланади.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Ҳали компания қўшилмаган.</p>
          ) : (
            <CompaniesTable rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
