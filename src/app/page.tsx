import { redirect } from "next/navigation";
import { getCurrentUser, getAccessibleCompanies } from "@/lib/access";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const companies = await getAccessibleCompanies(user);
  if (companies.length === 1) redirect(`/c/${companies[0].id}/dashboard`);
  if (companies.length === 0 && user.role === "ADMIN") redirect("/admin/companies");
  redirect("/select-company");
}
