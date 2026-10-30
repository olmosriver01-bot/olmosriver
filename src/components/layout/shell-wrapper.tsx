import { AppShell } from "./app-shell";
import { getAccessibleCompanies, type SessionUser } from "@/lib/access";

export async function ShellWrapper({
  user,
  currentCompanyId,
  children,
}: {
  user: SessionUser;
  currentCompanyId?: string;
  children: React.ReactNode;
}) {
  const companies = await getAccessibleCompanies(user);

  return (
    <AppShell user={user} companies={companies.map((c) => ({ id: c.id, name: c.name }))} currentCompanyId={currentCompanyId}>
      {children}
    </AppShell>
  );
}
