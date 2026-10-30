"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Gauge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Email ёки парол нотўғри");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Gauge className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">KPI AUDIT PRO</CardTitle>
          <CardDescription>Тизимга киришингиз учун маълумотларни киритинг</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@kpiaudit.pro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Парол</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Кириш
            </Button>
          </form>
          <div className="mt-5 rounded-lg bg-surface-muted p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Демо ҳисоблар:</p>
            <p>admin@kpiaudit.pro / Admin123!</p>
            <p>manager@kpiaudit.pro / Manager123!</p>
            <p>employee@kpiaudit.pro / Employee123!</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
