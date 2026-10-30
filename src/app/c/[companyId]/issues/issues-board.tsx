"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatDateShort } from "@/lib/utils";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_ORDER,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/constants";
import { IssueFormDialog } from "@/components/issues/issue-form-dialog";
import { updateIssue, deleteIssue } from "./actions";

export type IssueRow = {
  id: string;
  title: string;
  cause: string | null;
  solutionPlan: string | null;
  ownerName: string | null;
  startDate: string | null;
  dueDate: string | null;
  priority: IssuePriority;
  status: IssueStatus;
  notes: string | null;
  blockId: number | null;
  questionId: number | null;
  auditId: string | null;
  evidenceUrl: string | null;
  evidenceName: string | null;
};

const PRIORITY_BADGE: Record<IssuePriority, "danger" | "warning" | "info" | "default"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "default",
};

export function IssuesBoard({ companyId, rows, canEdit }: { companyId: string; rows: IssueRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filtered = useMemo(
    () => (statusFilter === "ALL" ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter]
  );

  async function onStatusChange(id: string, status: IssueStatus) {
    try {
      await updateIssue(companyId, id, { status });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Хатолик");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Вазифани ўчиришни тасдиқлайсизми?")) return;
    try {
      await deleteIssue(companyId, id);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Хатолик");
    }
  }

  const isOverdue = (r: IssueRow) => r.status !== "DONE" && r.dueDate && new Date(r.dueDate) < new Date();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Барча ҳолатлар</SelectItem>
            {ISSUE_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{filtered.length} вазифа</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Вазифа</TableHead>
            <TableHead>Устуворлик</TableHead>
            <TableHead>Масъул</TableHead>
            <TableHead>Муддат</TableHead>
            <TableHead>Ҳолат</TableHead>
            <TableHead className="text-right">Амаллар</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <p className="font-medium">{r.title}</p>
                {r.blockId && <p className="text-xs text-muted-foreground">{r.blockId}-блок{r.questionId ? `, ${r.questionId}-савол` : ""}</p>}
                {r.evidenceUrl && (
                  <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-accent hover:underline">
                    <Paperclip className="h-3 w-3" /> {r.evidenceName ?? "Ҳужжат"}
                  </a>
                )}
              </TableCell>
              <TableCell><Badge variant={PRIORITY_BADGE[r.priority]}>{ISSUE_PRIORITY_LABELS[r.priority]}</Badge></TableCell>
              <TableCell>{r.ownerName ?? "—"}</TableCell>
              <TableCell className={isOverdue(r) ? "font-medium text-danger" : ""}>{formatDateShort(r.dueDate)}</TableCell>
              <TableCell>
                <Select value={r.status} onValueChange={(v) => onStatusChange(r.id, v as IssueStatus)}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ISSUE_STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {canEdit && (
                    <>
                      <IssueFormDialog
                        companyId={companyId}
                        prefill={{ ...r, id: r.id }}
                        trigger={
                          <Button size="icon" variant="ghost" title="Таҳрирлаш">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button size="icon" variant="ghost" onClick={() => onDelete(r.id)} title="Ўчириш">
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                Вазифалар топилмади
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
