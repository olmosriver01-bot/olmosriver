"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Block } from "@/lib/kpi-data";
import { QUESTIONS_PER_BLOCK, TOTAL_QUESTIONS } from "@/lib/kpi-data";
import { QuestionCard } from "./question-card";

type Answer = { score: number | null; comment: string | null; evidenceUrl: string | null; evidenceName: string | null };

export function AuditSurvey({
  companyId,
  auditId,
  blocks,
  initialAnswers,
  canEdit,
}: {
  companyId: string;
  auditId: string;
  blocks: Block[];
  initialAnswers: Record<number, Answer>;
  canEdit: boolean;
}) {
  const [scores, setScores] = useState<Record<number, number | null>>(() => {
    const map: Record<number, number | null> = {};
    for (const b of blocks) for (const q of b.questions) map[q.id] = initialAnswers[q.id]?.score ?? null;
    return map;
  });
  const [wasComplete, setWasComplete] = useState(Object.values(scores).every((s) => s !== null));

  function handleScoreChange(questionId: number, score: number | null) {
    setScores((prev) => {
      const next = { ...prev, [questionId]: score };
      const nowComplete = Object.values(next).every((s) => s !== null);
      if (nowComplete && !wasComplete) {
        toast.success("Аудит якунланди! Натижаларни “Натижа” бўлимида кўринг.");
        setWasComplete(true);
      } else if (!nowComplete && wasComplete) {
        setWasComplete(false);
      }
      return next;
    });
  }

  const answeredTotal = useMemo(() => Object.values(scores).filter((s) => s !== null).length, [scores]);
  const overallPercent = (answeredTotal / TOTAL_QUESTIONS) * 100;

  const blockProgress = useMemo(
    () =>
      blocks.map((b) => ({
        blockId: b.id,
        answered: b.questions.filter((q) => scores[q.id] !== null).length,
      })),
    [blocks, scores]
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {wasComplete ? (
                  <span className="flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="h-4 w-4" /> Аудит тўлиқ якунланди
                  </span>
                ) : (
                  "Умумий жараён"
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">{answeredTotal} / {TOTAL_QUESTIONS}</span>
            </div>
            <Progress value={overallPercent} className="mt-2" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="1">
        <TabsList className="flex-wrap">
          {blocks.map((b) => {
            const progress = blockProgress.find((p) => p.blockId === b.id)!;
            return (
              <TabsTrigger key={b.id} value={String(b.id)} className="flex items-center gap-1.5">
                {b.id}-блок
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    progress.answered === QUESTIONS_PER_BLOCK ? "bg-success/15 text-success" : "bg-surface-muted text-muted-foreground"
                  )}
                >
                  {progress.answered}/{QUESTIONS_PER_BLOCK}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {blocks.map((b) => (
          <TabsContent key={b.id} value={String(b.id)} className="space-y-3">
            <h2 className="text-base font-semibold">{b.title}</h2>
            {b.questions.map((q) => (
              <QuestionCard
                key={q.id}
                companyId={companyId}
                auditId={auditId}
                questionId={q.id}
                index={q.id}
                text={q.text}
                initial={
                  initialAnswers[q.id] ?? { score: null, comment: null, evidenceUrl: null, evidenceName: null }
                }
                canEdit={canEdit}
                onScoreChange={handleScoreChange}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
