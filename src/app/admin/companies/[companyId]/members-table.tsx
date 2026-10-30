"use client";

import { useRouter } from "next/navigation";
import { UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/constants";
import type { GlobalRole } from "@/lib/constants";
import { addCompanyMember, removeCompanyMember } from "../actions";

export type UserRow = { id: string; name: string; email: string; role: GlobalRole; isMember: boolean };

export function MembersTable({ companyId, rows }: { companyId: string; rows: UserRow[] }) {
  const router = useRouter();

  async function toggle(userId: string, isMember: boolean) {
    try {
      if (isMember) {
        await removeCompanyMember(companyId, userId);
      } else {
        await addCompanyMember(companyId, userId);
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Хатолик");
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Фойдаланувчи</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Роли</TableHead>
          <TableHead>Ҳолат</TableHead>
          <TableHead className="text-right">Амал</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((u) => (
          <TableRow key={u.id}>
            <TableCell className="font-medium">{u.name}</TableCell>
            <TableCell className="text-muted-foreground">{u.email}</TableCell>
            <TableCell>{ROLE_LABELS[u.role]}</TableCell>
            <TableCell>
              {u.role === "ADMIN" ? (
                <Badge variant="info">Администратор (барча компанияларга кириш ҳуқуқи)</Badge>
              ) : u.isMember ? (
                <Badge variant="success">Аъзо</Badge>
              ) : (
                <Badge variant="outline">Аъзо эмас</Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              {u.role !== "ADMIN" && (
                <Button size="sm" variant="outline" onClick={() => toggle(u.id, u.isMember)}>
                  {u.isMember ? (
                    <><UserMinus className="h-4 w-4" /> Олиб ташлаш</>
                  ) : (
                    <><UserPlus className="h-4 w-4" /> Қўшиш</>
                  )}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
