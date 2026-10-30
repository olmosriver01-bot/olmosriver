"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { CompanyFormDialog } from "./company-form-dialog";
import { deleteCompany } from "./actions";

export type CompanyRow = {
  id: string;
  name: string;
  industry: string | null;
  employeeCount: number | null;
  memberCount: number;
  auditCount: number;
};

export function CompaniesTable({ rows }: { rows: CompanyRow[] }) {
  const router = useRouter();

  async function onDelete(id: string) {
    if (!confirm("Компанияни ўчирсангиз, унга тегишли барча аудит ва вазифалар ҳам ўчади. Давом этасизми?")) return;
    try {
      await deleteCompany(id);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Хатолик");
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Компания</TableHead>
          <TableHead>Фаолият</TableHead>
          <TableHead>Ходимлар</TableHead>
          <TableHead>Аъзолар</TableHead>
          <TableHead>Аудитлар</TableHead>
          <TableHead className="text-right">Амаллар</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">
              <Link href={`/c/${c.id}/dashboard`} className="hover:underline">{c.name}</Link>
            </TableCell>
            <TableCell>{c.industry ?? "—"}</TableCell>
            <TableCell>{c.employeeCount ?? "—"}</TableCell>
            <TableCell>{c.memberCount}</TableCell>
            <TableCell>{c.auditCount}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" asChild title="Аъзоларни бошқариш">
                  <Link href={`/admin/companies/${c.id}`}>
                    <Users className="h-4 w-4" />
                  </Link>
                </Button>
                <CompanyFormDialog company={c} />
                <Button size="icon" variant="ghost" onClick={() => onDelete(c.id)} title="Ўчириш">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
