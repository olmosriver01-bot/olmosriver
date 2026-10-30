"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createCompany, updateCompany, type CompanyInput } from "./actions";

export function CompanyFormDialog({
  company,
}: {
  company?: { id: string; name: string; industry: string | null; employeeCount: number | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CompanyInput>({
    name: company?.name ?? "",
    industry: company?.industry ?? "",
    employeeCount: company?.employeeCount ?? null,
  });

  async function onSubmit() {
    setLoading(true);
    try {
      if (company) {
        await updateCompany(company.id, form);
        toast.success("Компания янгиланди");
      } else {
        await createCompany(form);
        toast.success("Компания яратилди");
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Хатолик");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {company ? (
          <Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button><Plus className="h-4 w-4" /> Янги компания</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{company ? "Компанияни таҳрирлаш" : "Янги компания"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Номи *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Фаолият йўналиши</Label>
            <Input value={form.industry ?? ""} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Ходимлар сони</Label>
            <Input
              type="number"
              value={form.employeeCount ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, employeeCount: e.target.value ? Number(e.target.value) : null }))}
            />
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
