"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_PRIORITY_ORDER,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_ORDER,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/constants";
import { createIssue, updateIssue, uploadIssueEvidence, type IssueInput } from "@/app/c/[companyId]/issues/actions";

export type IssuePrefill = Partial<IssueInput> & { id?: string };

export function IssueFormDialog({
  companyId,
  prefill,
  trigger,
  onSaved,
}: {
  companyId: string;
  prefill?: IssuePrefill;
  trigger?: React.ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = !!prefill?.id;

  const [form, setForm] = useState<IssueInput>({
    title: prefill?.title ?? "",
    cause: prefill?.cause ?? "",
    solutionPlan: prefill?.solutionPlan ?? "",
    ownerName: prefill?.ownerName ?? "",
    startDate: prefill?.startDate ? prefill.startDate.slice(0, 10) : "",
    dueDate: prefill?.dueDate ? prefill.dueDate.slice(0, 10) : "",
    priority: prefill?.priority ?? "MEDIUM",
    status: prefill?.status ?? "NEW",
    notes: prefill?.notes ?? "",
    questionId: prefill?.questionId ?? null,
    blockId: prefill?.blockId ?? null,
    auditId: prefill?.auditId ?? null,
    evidenceUrl: prefill?.evidenceUrl ?? null,
    evidenceName: prefill?.evidenceName ?? null,
  });
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadIssueEvidence(companyId, fd);
      set("evidenceUrl", res.url);
      set("evidenceName", res.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Юклашда хатолик");
    } finally {
      setUploading(false);
    }
  }

  function set<K extends keyof IssueInput>(key: K, value: IssueInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit() {
    setLoading(true);
    try {
      if (isEdit && prefill?.id) {
        await updateIssue(companyId, prefill.id, form);
        toast.success("Вазифа сақланди");
      } else {
        await createIssue(companyId, form);
        toast.success("Вазифа яратилди");
      }
      setOpen(false);
      onSaved?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Хатолик юз берди");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="h-4 w-4" /> Янги вазифа
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Вазифани таҳрирлаш" : "Муаммони вазифага айлантириш"}</DialogTitle>
          <DialogDescription>Барча майдонларни тўлдиринг — масъул, муддат ва ечим режаси аниқ бўлсин.</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Муаммо номи *</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Масалан: Lavozim boyicha KPI sonini qisqartirish" />
          </div>
          <div className="space-y-1.5">
            <Label>Сабаби</Label>
            <Textarea value={form.cause ?? ""} onChange={(e) => set("cause", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ечим режаси</Label>
            <Textarea value={form.solutionPlan ?? ""} onChange={(e) => set("solutionPlan", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Масъул ходим</Label>
              <Input value={form.ownerName ?? ""} onChange={(e) => set("ownerName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Устуворлик</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v as IssuePriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ISSUE_PRIORITY_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>{ISSUE_PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Бошланиш санаси</Label>
              <Input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Тугатиш муддати</Label>
              <Input type="date" value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Бажарилиш ҳолати</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v as IssueStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ISSUE_STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Изоҳлар</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Далил файли</Label>
            <div className="flex items-center gap-2">
              <input type="file" className="hidden" id="issue-evidence-input" onChange={handleFile} />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => document.getElementById("issue-evidence-input")?.click()}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                Файл танлаш
              </Button>
              {form.evidenceUrl && (
                <span className="flex items-center gap-1 text-xs text-accent">
                  {form.evidenceName}
                  <button type="button" onClick={() => { set("evidenceUrl", null); set("evidenceName", null); }}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Бекор қилиш</Button>
          <Button onClick={onSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Сақлаш
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
