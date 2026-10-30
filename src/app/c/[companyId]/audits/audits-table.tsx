"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileDown, FileSpreadsheet, Trash2, GitCompareArrows, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { deleteAudit } from "./actions";

export type AuditRow = {
  id: string;
  title: string;
  status: "DRAFT" | "COMPLETED";
  startedAt: string;
  completedAt: string | null;
  answeredCount: number;
  issueCount: number;
  percent: number | null;
};

export function AuditsTable({ companyId, rows, isAdmin, canEdit }: { companyId: string; rows: AuditRow[]; isAdmin: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  async function onDelete(id: string) {
    if (!confirm("Аудитни ўчиришни тасдиқлайсизми? Бу амални қайтариб бўлмайди.")) return;
    try {
      await deleteAudit(companyId, id);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Хатолик");
    }
  }

  return (
    <div className="space-y-3">
      {selected.length === 2 && (
        <div className="flex items-center justify-between rounded-lg border border-accent/40 bg-accent/5 px-4 py-2.5">
          <p className="text-sm">2 та аудит танланди, солиштириш мумкин.</p>
          <Button size="sm" asChild>
            <Link href={`/c/${companyId}/audits/compare?left=${selected[0]}&right=${selected[1]}`}>
              <GitCompareArrows className="h-4 w-4" /> Солиштириш
            </Link>
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Аудит</TableHead>
            <TableHead>Ҳолат</TableHead>
            <TableHead>Натижа</TableHead>
            <TableHead>Муаммолар</TableHead>
            <TableHead>Сана</TableHead>
            <TableHead className="text-right">Амаллар</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                {r.status === "COMPLETED" && (
                  <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => toggle(r.id)} />
                )}
              </TableCell>
              <TableCell className="font-medium">{r.title}</TableCell>
              <TableCell>
                {r.status === "COMPLETED" ? (
                  <Badge variant="success">Якунланган</Badge>
                ) : (
                  <Badge variant="warning">Жараёнда ({r.answeredCount}/42)</Badge>
                )}
              </TableCell>
              <TableCell>{r.percent !== null ? `${r.percent.toFixed(0)}%` : "—"}</TableCell>
              <TableCell>{r.issueCount}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(r.completedAt ?? r.startedAt)}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {r.status === "DRAFT" && canEdit ? (
                    <Button size="icon" variant="ghost" asChild title="Давом эттириш">
                      <Link href={`/c/${companyId}/audits/${r.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : (
                    <Button size="icon" variant="ghost" asChild title="Натижани кўриш">
                      <Link href={`/c/${companyId}/audits/${r.id}/result`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                  {r.status === "COMPLETED" && (
                    <>
                      <Button size="icon" variant="ghost" asChild title="Excel экспорт">
                        <a href={`/api/audits/${r.id}/export/xlsx`}>
                          <FileSpreadsheet className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button size="icon" variant="ghost" asChild title="PDF ҳисобот">
                        <a href={`/api/audits/${r.id}/export/pdf`}>
                          <FileDown className="h-4 w-4" />
                        </a>
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button size="icon" variant="ghost" onClick={() => onDelete(r.id)} title="Ўчириш">
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
