"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ROLE_LABELS, type GlobalRole } from "@/lib/constants";
import { UserFormDialog } from "./user-form-dialog";
import { deleteUser } from "./actions";

export type UserRow = { id: string; name: string; email: string; role: GlobalRole; companyCount: number };

const ROLE_BADGE: Record<GlobalRole, "info" | "warning" | "default"> = {
  ADMIN: "info",
  MANAGER: "warning",
  EMPLOYEE: "default",
};

export function UsersTable({ rows, currentUserId }: { rows: UserRow[]; currentUserId: string }) {
  const router = useRouter();

  async function onDelete(id: string) {
    if (!confirm("Фойдаланувчини ўчиришни тасдиқлайсизми?")) return;
    try {
      await deleteUser(id);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Хатолик");
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Исм</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Роли</TableHead>
          <TableHead>Компаниялар</TableHead>
          <TableHead className="text-right">Амаллар</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((u) => (
          <TableRow key={u.id}>
            <TableCell className="font-medium">{u.name}</TableCell>
            <TableCell className="text-muted-foreground">{u.email}</TableCell>
            <TableCell><Badge variant={ROLE_BADGE[u.role]}>{ROLE_LABELS[u.role]}</Badge></TableCell>
            <TableCell>{u.role === "ADMIN" ? "Барчаси" : u.companyCount}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <UserFormDialog user={u} />
                {u.id !== currentUserId && (
                  <Button size="icon" variant="ghost" onClick={() => onDelete(u.id)}>
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
