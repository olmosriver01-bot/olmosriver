"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Copy, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ackMonitoring, analyzeNow, assignTo, createTelegramLinkCode, deleteConversation, reviewFinding,
  sendReply, sendReportNow, setConversationState, setOrderRef, unlinkTelegram,
} from "../actions";

/** Ro'yxat va suhbatni vaqti-vaqti bilan yangilaydi (yangi xabarlar ko'rinishi uchun). */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

function fmt(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "<1 дақ";
  if (m < 60) return `${m} дақ`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} с ${m % 60} дақ`;
  return `${Math.floor(h / 24)} кун ${h % 24} с`;
}

export function WaitingTimer({ since, warnMin, dangerMin }: { since: string; warnMin: number; dangerMin: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (now === null) return <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold">кутмоқда</span>;
  const ms = now - new Date(since).getTime();
  const min = ms / 60_000;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
        min >= dangerMin ? "bg-danger/15 text-danger" : min >= warnMin ? "bg-warning/15 text-warning" : "bg-info/15 text-info"
      )}
      title="Мижоз жавоб кутаётган вақт"
    >
      ⏱ {fmt(ms)}
    </span>
  );
}

export function MonitoringNotice({ companyId, acked }: { companyId: string; acked: boolean }) {
  const [pending, start] = useTransition();
  if (acked) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Eye className="h-3.5 w-3.5" /> Хизмат ёзишмалари сифат назорати учун кузатилади ва таҳлил қилинади.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
      <p className="font-semibold">Ходимлар учун огоҳлантириш</p>
      <p className="mt-1 text-foreground/80">
        Дўконнинг Telegram ва Instagram профилларидаги мижозлар билан хизмат ёзишмалари шу тизимда сақланади, жавоб тезлиги
        ўлчанади ва сифати (жумладан AI ёрдамида) таҳлил қилинади. Натижаларни раҳбар ва менежерлар кўради. Панелдан
        юборган ҳар бир хабарингиз сизнинг логинингиз билан сақланади. AI хулосаси автоматик жазо ёки жаримага сабаб
        бўлмайди — ҳар бир топилмани раҳбар текширади.
      </p>
      <Button size="sm" className="mt-3" disabled={pending} onClick={() => start(async () => void (await ackMonitoring(companyId)))}>
        Танишдим
      </Button>
    </div>
  );
}

export function TelegramLinkCard({ companyId, linked, botConnected }: { companyId: string; linked: boolean; botConnected: boolean }) {
  const [code, setCode] = useState<{ code: string; bot: string | null } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!botConnected) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Telegram хабарномалари</p>
          <p className="text-xs text-muted-foreground">
            {linked ? "Боғланган — эслатмалар шахсий Telegram чатингизга келади." : "Боғланмаган — эслатмалар сизга етиб бормайди."}
          </p>
        </div>
        {linked ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await unlinkTelegram(companyId); router.refresh(); })}>
            Узиш
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createTelegramLinkCode(companyId);
                if (!r.ok) toast.error(r.error);
                else setCode({ code: r.code, bot: r.botUsername });
              })
            }
          >
            Telegram&apos;га боғлаш
          </Button>
        )}
      </div>
      {code && !linked && (
        <div className="mt-3 rounded-lg bg-surface-muted p-3 text-xs">
          {code.bot ? (
            <a className="font-semibold text-accent underline" href={`https://t.me/${code.bot}?start=${code.code}`} target="_blank" rel="noreferrer">
              @{code.bot} ботини очиб «Start» босинг
            </a>
          ) : null}
          <p className="mt-1">
            Ёки ботга шу хабарни юборинг: <code className="font-mono font-semibold">/start {code.code}</code> (15 дақиқа амал қилади)
          </p>
        </div>
      )}
    </div>
  );
}

function newToken() {
  return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

export function Composer({ companyId, conversationId, disabledReason, draft }: { companyId: string; conversationId: string; disabledReason: string | null; draft?: string }) {
  const [text, setText] = useState(draft ?? "");
  const [pending, start] = useTransition();
  // Bitta yozilgan xabar uchun bitta kalit: qayta bosish yoki tarmoq qaytarishi ikkinchi marta yubormaydi.
  const token = useRef<string>("");
  const router = useRouter();
  useEffect(() => {
    const onDraft = (e: Event) => setText((e as CustomEvent<string>).detail);
    window.addEventListener("inbox:draft", onDraft);
    return () => window.removeEventListener("inbox:draft", onDraft);
  }, []);

  const submit = () => {
    const value = text.trim();
    if (!value || pending) return;
    if (!token.current) token.current = newToken();
    const t = token.current;
    start(async () => {
      const r = await sendReply(companyId, conversationId, value, t);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      token.current = "";
      if (r.status === "SENT") setText("");
      else if (r.status === "FAILED") toast.error(`Юборилмади: ${r.error ?? "платформа рад этди"}`);
      else {
        setText("");
        toast.warning("Хабар етиб боргани номаълум. Иловада текширинг — автоматик қайта юборилмайди.");
      }
      router.refresh();
    });
  };

  if (disabledReason) {
    return <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm text-muted-foreground">{disabledReason}</p>;
  }
  return (
    <div className="flex items-end gap-2">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          token.current = "";
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        rows={2}
        maxLength={1000}
        placeholder="Жавоб ёзинг…"
        className="min-h-12 flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      />
      <Button onClick={submit} disabled={pending || !text.trim()} variant="accent" className="h-12">
        <Send /> {pending ? "…" : "Юбориш"}
      </Button>
    </div>
  );
}

type Staff = { id: string; name: string };

export function ConversationControls(props: {
  companyId: string;
  conversationId: string;
  status: string;
  isSpam: boolean;
  assigneeId: string | null;
  orderRef: string | null;
  staff: Staff[];
  meId: string;
  manager: boolean;
  admin: boolean;
  aiAvailable: boolean;
}) {
  const { companyId, conversationId } = props;
  const [pending, start] = useTransition();
  const [order, setOrder] = useState(props.orderRef ?? "");
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Хато");
      else if (okMsg) toast.success(okMsg);
      router.refresh();
    });
  const canTransfer = props.manager || props.assigneeId === props.meId;

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Масъул сотувчи</p>
        {canTransfer ? (
          <select
            className="h-10 w-full rounded-lg border border-border bg-surface px-2"
            value={props.assigneeId ?? ""}
            disabled={pending}
            onChange={(e) => run(() => assignTo(companyId, conversationId, e.target.value || null), "Масъул ўзгартирилди")}
          >
            {(props.manager || !props.assigneeId) && <option value="">— бириктирилмаган —</option>}
            {props.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.id === props.meId ? " (мен)" : ""}
              </option>
            ))}
          </select>
        ) : props.assigneeId === null ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => assignTo(companyId, conversationId, props.meId), "Суҳбат сизга бириктирилди")}>
            Ўзимга олиш
          </Button>
        ) : (
          <p>{props.staff.find((s) => s.id === props.assigneeId)?.name ?? "—"}</p>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Буюртма</p>
        <div className="flex gap-2">
          <input
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            placeholder="Буюртма рақами"
            maxLength={60}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3"
          />
          <Button size="sm" variant="outline" className="h-10" disabled={pending || order === (props.orderRef ?? "")} onClick={() => run(() => setOrderRef(companyId, conversationId, order), "Сақланди")}>
            Боғлаш
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {props.status === "CLOSED" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setConversationState(companyId, conversationId, props.isSpam ? "unspam" : "reopen"))}>
            {props.isSpam ? "Спам эмас" : "Қайта очиш"}
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setConversationState(companyId, conversationId, "close"), "Суҳбат якунланди")}>
              Якунлаш
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setConversationState(companyId, conversationId, "spam"))}>
              Спам
            </Button>
          </>
        )}
        {props.manager && props.aiAvailable && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await analyzeNow(companyId, conversationId);
                if (!r.ok) toast.error(r.error);
                else toast.success(r.note ?? `AI таҳлили тугади: ${r.findings} та янги топилма`);
                router.refresh();
              })
            }
          >
            AI таҳлили
          </Button>
        )}
        {props.admin && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            disabled={pending}
            onClick={() => {
              if (!confirm("Суҳбат ва унинг барча хабарлари CRMдан бутунлай ўчирилади. Давом этасизми?")) return;
              start(async () => {
                const r = await deleteConversation(companyId, conversationId);
                if (!r.ok) toast.error(r.error);
                else router.push(`/c/${companyId}/inbox`);
              });
            }}
          >
            Ўчириш
          </Button>
        )}
      </div>
    </div>
  );
}

export function FindingActions({ companyId, findingId, status, suggestedReply }: { companyId: string; findingId: string; status: string; suggestedReply: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (d: "CONFIRMED" | "REJECTED" | "PENDING") =>
    start(async () => {
      const r = await reviewFinding(companyId, findingId, d);
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "PENDING" ? (
        <>
          <Button size="sm" disabled={pending} onClick={() => act("CONFIRMED")}>
            Тасдиқлаш
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act("REJECTED")}>
            Хато аниқланган
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("PENDING")}>
          Қарорни бекор қилиш
        </Button>
      )}
      {suggestedReply && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("inbox:draft", { detail: suggestedReply }));
            navigator.clipboard?.writeText(suggestedReply).catch(() => {});
            toast.success("Жавоб лойиҳаси нусхаланди — юборишдан олдин текширинг");
          }}
        >
          <Copy /> Лойиҳани олиш
        </Button>
      )}
    </div>
  );
}

export function SendReportButton({ companyId, which }: { companyId: string; which: "last" | "current" }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sendReportNow(companyId, which);
          if (!r.ok) toast.error(r.error);
          else if (r.recipients === 0) toast.error("Ҳисобот олувчилар белгиланмаган (Созламалар → Қабул қилувчилар)");
          else if (r.failed) toast.warning(`Юборилди: ${r.sent}, етказилмади: ${r.failed} (Telegram боғланмаган бўлиши мумкин)`);
          else toast.success(`Ҳисобот ${r.sent} кишига юборилди`);
        })
      }
    >
      <Send /> Telegram&apos;га юбориш
    </Button>
  );
}
