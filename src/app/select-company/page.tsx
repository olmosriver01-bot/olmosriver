import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";
import { requireUser, getAccessibleCompanies } from "@/lib/access";
import { ShellWrapper } from "@/components/layout/shell-wrapper";
import { Card, CardContent } from "@/components/ui/card";

export default async function SelectCompanyPage() {
  const user = await requireUser();
  const companies = await getAccessibleCompanies(user);

  return (
    <ShellWrapper user={user}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight">Компанияни танланг</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          KPI аудитини кўриш ёки ўтказиш учун компаниялардан бирини танланг.
        </p>

        {companies.length === 0 ? (
          <Card className="mt-6">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Сизга ҳали бирон компания бириктирилмаган. Администратор билан боғланинг.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {companies.map((c) => (
              <Link key={c.id} href={`/c/${c.id}/dashboard`}>
                <Card className="group transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.industry ?? "Фаолият йўналиши кўрсатилмаган"}
                          {c.employeeCount ? ` · ${c.employeeCount} ходим` : ""}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ShellWrapper>
  );
}
