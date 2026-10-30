import { requireAdmin } from "@/lib/access";
import { ShellWrapper } from "@/components/layout/shell-wrapper";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <ShellWrapper user={user}>{children}</ShellWrapper>;
}
