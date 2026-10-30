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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ROLE_LABELS, type GlobalRole } from "@/lib/constants";
import { createUser, updateUser } from "./actions";

export function UserFormDialog({ user }: { user?: { id: string; name: string; email: string; role: GlobalRole } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<GlobalRole>(user?.role ?? "EMPLOYEE");
  const [password, setPassword] = useState("");

  async function onSubmit() {
    setLoading(true);
    try {
      if (user) {
        await updateUser(user.id, { name, role, password: password || undefined });
        toast.success("Фойдаланувчи янгиланди");
      } else {
        await createUser({ name, email, role, password });
        toast.success("Фойдаланувчи яратилди");
      }
      setOpen(false);
      setPassword("");
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
        {user ? (
          <Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button><Plus className="h-4 w-4" /> Янги фойдаланувчи</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? "Фойдаланувчини таҳрирлаш" : "Янги фойдаланувчи"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Исм *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Роли</Label>
            <Select value={role} onValueChange={(v) => setRole(v as GlobalRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as GlobalRole[]).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{user ? "Янги парол (ихтиёрий)" : "Парол *"}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="камида 6 белги" />
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
