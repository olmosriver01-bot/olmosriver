"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createAudit } from "./actions";

export function NewAuditDialog({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function onCreate() {
    setLoading(true);
    try {
      const auditId = await createAudit(companyId, title || `${new Date().toLocaleDateString("uz-UZ", { year: "numeric", month: "long" })} аудити`);
      setOpen(false);
      setTitle("");
      router.push(`/c/${companyId}/audits/${auditId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Хатолик юз берди");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Янги аудит
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Янги KPI аудитини бошлаш</DialogTitle>
          <DialogDescription>Аудитга ном беринг (масалан, давр номи). Кейинроқ ўзгартириш мумкин.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="audit-title">Аудит номи</Label>
          <Input
            id="audit-title"
            placeholder="2027-йил январь аудити"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Бекор қилиш
          </Button>
          <Button onClick={onCreate} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Бошлаш
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
