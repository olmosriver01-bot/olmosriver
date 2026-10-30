"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AiSummaryCard({ companyId, auditId }: { companyId: string; auditId: string }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/audits/${auditId}/ai-summary`);
      const data = await res.json();
      if (!data.available) {
        setUnavailable(true);
      } else {
        setText(data.text);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" /> AI тавсиялари (қўшимча)
        </CardTitle>
        <CardDescription>
          Бу бўлим Excel дагi асосий тавсиялардан мустақил, қўшимча AI таҳлилидир. API калит созланмаса ҳам асосий дастур тўлиқ ишлайди.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {text ? (
          <p className="whitespace-pre-line text-sm leading-relaxed">{text}</p>
        ) : unavailable ? (
          <p className="text-sm text-muted-foreground">
            AI таҳлили ҳозирда мавжуд эмас: серверда AI API калити созланмаган (масалан, ANTHROPIC_API_KEY). Бу асосий аудит натижаларига таъсир қилмайди.
          </p>
        ) : (
          <Button size="sm" variant="accent" onClick={load} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            AI хулосасини олиш
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
