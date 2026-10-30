"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { SCORE_SCALE } from "@/lib/kpi-data";
import { saveAnswer, saveEvidence, uploadEvidence } from "../actions";

type Answer = { score: number | null; comment: string | null; evidenceUrl: string | null; evidenceName: string | null };

export function QuestionCard({
  companyId,
  auditId,
  questionId,
  index,
  text,
  initial,
  canEdit,
  onScoreChange,
}: {
  companyId: string;
  auditId: string;
  questionId: number;
  index: number;
  text: string;
  initial: Answer;
  canEdit: boolean;
  onScoreChange: (questionId: number, score: number | null) => void;
}) {
  const [score, setScore] = useState<number | null>(initial.score);
  const [comment, setComment] = useState(initial.comment ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(initial.evidenceUrl);
  const [evidenceName, setEvidenceName] = useState(initial.evidenceName);
  const [savingScore, setSavingScore] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleScoreClick(value: number) {
    if (!canEdit) return;
    const next = score === value ? null : value; // bosilganni qayta bosish - javobsiz holatga qaytarish
    setScore(next);
    onScoreChange(questionId, next);
    setSavingScore(true);
    try {
      await saveAnswer(companyId, auditId, questionId, { score: next });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Сақлашда хатолик");
    } finally {
      setSavingScore(false);
    }
  }

  async function handleCommentBlur() {
    if (!canEdit) return;
    if (comment === (initial.comment ?? "")) return;
    setSavingComment(true);
    try {
      await saveAnswer(companyId, auditId, questionId, { comment });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Сақлашда хатолик");
    } finally {
      setSavingComment(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadEvidence(companyId, auditId, questionId, fd);
      setEvidenceUrl(res.url);
      setEvidenceName(res.name);
      toast.success("Ҳужжат бириктирилди");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Юклашда хатолик");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveEvidence() {
    setEvidenceUrl(null);
    setEvidenceName(null);
    try {
      await saveEvidence(companyId, auditId, questionId, null, null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Хатолик");
    }
  }

  const isUnanswered = score === null;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        isUnanswered ? "border-border bg-surface" : "border-border bg-surface-muted/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-relaxed">
          <span className="mr-1.5 text-muted-foreground">{index}.</span>
          {text}
        </p>
        {isUnanswered ? (
          <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Жавобсиз
          </span>
        ) : savingScore ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-success" />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SCORE_SCALE.map((s) => (
          <button
            key={s.value}
            type="button"
            disabled={!canEdit}
            onClick={() => handleScoreClick(s.value)}
            title={s.description}
            className={cn(
              "rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              score === s.value
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface hover:bg-surface-muted"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <Textarea
          placeholder="Изоҳ / далил ёзинг (ихтиёрий)"
          className="min-h-9 flex-1 text-sm"
          value={comment}
          disabled={!canEdit}
          onChange={(e) => setComment(e.target.value)}
          onBlur={handleCommentBlur}
        />
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-muted disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                Ҳужжат
              </button>
            </>
          )}
          {savingComment && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {evidenceUrl && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <a href={evidenceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
            <Paperclip className="h-3 w-3" /> {evidenceName ?? "Ҳужжат"}
          </a>
          {canEdit && (
            <button onClick={handleRemoveEvidence} className="text-muted-foreground hover:text-danger">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
