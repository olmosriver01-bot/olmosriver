"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addCatalogItem, addShift, connectBot, deleteCatalogItem, deleteShift, disconnectBot, removeChannel, saveGeneralSettings,
  saveInstagramApp, saveMember, startInstagramConnect, unlinkTelegram, type GeneralSettingsInput, type MemberInput,
} from "../actions";

const input = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm";
const label = "mb-1 block text-xs font-medium text-muted-foreground";

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg = "Сақланди", after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Хато");
      else {
        toast.success(okMsg);
        after?.();
      }
      router.refresh();
    });
  return { pending, run, start, router };
}

export function GeneralForm({ companyId, initial, models, aiKeyPresent }: { companyId: string; initial: GeneralSettingsInput; models: { id: string; label: string }[]; aiKeyPresent: boolean }) {
  const [v, setV] = useState(initial);
  const { pending, run } = useRun();
  const num = (k: keyof GeneralSettingsInput) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) });
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold">Жавобсиз мижоз огоҳлантиришлари (дақиқа)</p>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={label}>Масъул сотувчига</label><input type="number" min={1} className={input} value={v.reminderMinutes} onChange={num("reminderMinutes")} /></div>
          <div><label className={label}>Менежерга</label><input type="number" min={1} className={input} value={v.managerMinutes} onChange={num("managerMinutes")} /></div>
          <div><label className={label}>Админга</label><input type="number" min={1} className={input} value={v.adminMinutes} onChange={num("adminMinutes")} /></div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Биринчи қиймат ҳисоботдаги «кеч жавоб» чегараси сифатида ҳам ишлатилади.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div><label className={label}>Кунлик ҳисобот вақти</label><input type="time" className={input} value={v.reportTime} onChange={(e) => setV({ ...v, reportTime: e.target.value })} /></div>
        <div><label className={label}>Вақт минтақаси</label><input className={input} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} /></div>
        <div><label className={label}>Ёзишмаларни сақлаш (кун)</label><input type="number" min={7} className={input} value={v.retentionDays} onChange={num("retentionDays")} /></div>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">Сақлаш муддатидан эски хабарлар ҳар куни автоматик ўчирилади. Алоҳида суҳбатни админ суҳбат саҳифасидан ўчира олади.</p>
      <div>
        <label className={label}>Автоматик саломлашув / «ҳозир бандмиз» матнлари (ҳар қаторга биттадан)</label>
        <textarea rows={3} className={`${input} h-auto py-2`} value={v.autoReplyPatterns} onChange={(e) => setV({ ...v, autoReplyPatterns: e.target.value })} placeholder="Ассалому алайкум! Тез орада жавоб берамиз." />
        <p className="mt-1 text-xs text-muted-foreground">Шу матнларга мос чиқувчи хабарлар мазмунли жавоб ҳисобланмайди — мижоз жавоб кутишда давом этади.</p>
      </div>
      <div className="rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={v.aiEnabled} onChange={(e) => setV({ ...v, aiEnabled: e.target.checked })} /> AI орқали сифат текшируви
        </label>
        {!aiKeyPresent && <p className="mt-1 text-xs text-warning">Серверда ANTHROPIC_API_KEY созланмаган — ёқилса ҳам таҳлил ишламайди.</p>}
        <div className="mt-2 max-w-sm">
          <label className={label}>Модел (нарх ва аниқлик)</label>
          <select className={input} value={v.aiModel} onChange={(e) => setV({ ...v, aiModel: e.target.value })}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">AI фақат таҳлил қилади ва жавоб лойиҳасини тайёрлайди; мижозга ҳеч нарса юбормайди. Ҳар сафар фақат янги хабарлар ва қисқа хулоса юборилади.</p>
      </div>
      <div>
        <label className={label}>Тасдиқланган етказиб бериш шартлари (AI фақат шу матн билан солиштиради)</label>
        <textarea rows={3} className={`${input} h-auto py-2`} value={v.deliveryTerms} onChange={(e) => setV({ ...v, deliveryTerms: e.target.value })} placeholder="Масалан: Тошкент шаҳри бўйлаб 30 000 сўм, 500 000 сўмдан юқори буюртмада бепул…" />
      </div>
      <Button disabled={pending} onClick={() => run(() => saveGeneralSettings(companyId, v))}>Сақлаш</Button>
    </div>
  );
}

export function TelegramBotCard({ companyId, connected, username }: { companyId: string; connected: boolean; username: string | null }) {
  const [token, setToken] = useState("");
  const { pending, start, router } = useRun();
  if (connected) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>Бот уланган: <span className="font-semibold">@{username ?? "—"}</span></p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!confirm("Бот узилса Telegram профилларидан хабар келмайди ва огоҳлантиришлар юборилмайди. Давом этасизми?")) return;
            start(async () => {
              const r = await disconnectBot(companyId);
              if (!r.ok) toast.error(r.error);
              router.refresh();
            });
          }}
        >
          Ботни узиш
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <label className={label}>@BotFather берган бот токени</label>
      <div className="flex gap-2">
        <input type="password" autoComplete="off" className={input} value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA…" />
        <Button
          disabled={pending || !token.trim()}
          onClick={() =>
            start(async () => {
              const r = await connectBot(companyId, token);
              setToken("");
              if (!r.ok) toast.error(r.error);
              else if (!r.businessMode) toast.warning(`@${r.username} уланди, лекин Business Mode ўчиқ — @BotFather → Bot Settings → Business Mode'ни ёқинг`);
              else toast.success(`@${r.username} уланди`);
              router.refresh();
            })
          }
        >
          Улаш
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Токен шифрланган ҳолда сақланади ва қайта кўрсатилмайди.</p>
    </div>
  );
}

export function InstagramCard({ companyId, appId, hasSecret, webhookUrl, redirectUri, verifyToken }: { companyId: string; appId: string | null; hasSecret: boolean; webhookUrl: string; redirectUri: string; verifyToken: string | null }) {
  const [id, setId] = useState(appId ?? "");
  const [secret, setSecret] = useState("");
  const { pending, run, start } = useRun();
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label}>Instagram App ID</label><input className={input} value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" /></div>
        <div><label className={label}>Instagram App Secret {hasSecret ? "(сақланган — ўзгартириш учун ёзинг)" : ""}</label><input type="password" autoComplete="off" className={input} value={secret} onChange={(e) => setSecret(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => run(() => saveInstagramApp(companyId, id, secret), "Сақланди", () => setSecret(""))}>Илова маълумотини сақлаш</Button>
        <Button
          disabled={pending || !appId || !hasSecret}
          onClick={() =>
            start(async () => {
              const r = await startInstagramConnect(companyId);
              if (!r.ok) toast.error(r.error);
              else window.location.href = r.url;
            })
          }
        >
          Instagram профилни улаш
        </Button>
      </div>
      {verifyToken && (
        <div className="space-y-1 rounded-lg bg-surface-muted p-3 text-xs">
          <p className="font-semibold">Meta иловасига киритиладиган қийматлар</p>
          <p>Webhook Callback URL: <code className="break-all font-mono">{webhookUrl}</code></p>
          <p>Verify token: <code className="break-all font-mono">{verifyToken}</code></p>
          <p>OAuth Redirect URI: <code className="break-all font-mono">{redirectUri}</code></p>
        </div>
      )}
    </div>
  );
}

export function RemoveChannelButton({ companyId, channelId, name }: { companyId: string; channelId: string; name: string }) {
  const { pending, start, router } = useRun();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-danger"
      disabled={pending}
      aria-label="Профилни ўчириш"
      onClick={() => {
        if (!confirm(`«${name}» профили ва унинг CRMдаги барча суҳбатлари ўчирилади. Давом этасизми?`)) return;
        start(async () => {
          const r = await removeChannel(companyId, channelId);
          if (!r.ok) toast.error(r.error);
          router.refresh();
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}

export function MemberRow({ companyId, name, roleLabel, isManagerRole, linked, initial, channels }: { companyId: string; name: string; roleLabel: string; isManagerRole: boolean; linked: boolean; initial: MemberInput; channels: { id: string; name: string }[] }) {
  const [v, setV] = useState(initial);
  const { pending, run } = useRun();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const box = (k: "notifyReminder" | "notifyManager" | "notifyAdmin" | "receiveReport", text: string, disabled = false) => (
    <label className={`flex items-center gap-1.5 text-xs ${disabled ? "opacity-40" : ""}`}>
      <input type="checkbox" disabled={disabled} checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} /> {text}
    </label>
  );
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{name} <span className="text-xs font-normal text-muted-foreground">· {roleLabel}</span></p>
        <span className={`text-xs ${linked ? "text-success" : "text-warning"}`}>
          {linked ? "Telegram боғланган" : "Telegram боғланмаган"}
          {linked && (
            <button className="ml-2 underline" onClick={() => run(() => unlinkTelegram(companyId, initial.userId), "Узилди")}>узиш</button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {box("notifyReminder", "Сотувчи эслатмаси")}
        {box("notifyManager", "Менежер огоҳлантириши", !isManagerRole)}
        {box("notifyAdmin", "Админ огоҳлантириши", !isManagerRole)}
        {box("receiveReport", "Кунлик ҳисобот", !isManagerRole)}
      </div>
      {!isManagerRole && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={v.allChannels} onChange={(e) => setV({ ...v, allChannels: e.target.checked })} /> Барча профиллар
          </label>
          {!v.allChannels &&
            channels.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={v.channelIds.includes(c.id)}
                  onChange={(e) => setV({ ...v, channelIds: e.target.checked ? [...v.channelIds, c.id] : v.channelIds.filter((x) => x !== c.id) })}
                />{" "}
                {c.name}
              </label>
            ))}
        </div>
      )}
      {dirty && <Button size="sm" disabled={pending} onClick={() => run(() => saveMember(companyId, v))}>Сақлаш</Button>}
    </li>
  );
}

const DAYS = ["Ду", "Се", "Чо", "Па", "Жу", "Ша", "Як"];

export function ShiftForm({ companyId, staff }: { companyId: string; staff: { id: string; name: string }[] }) {
  const [userId, setUserId] = useState(staff[0]?.id ?? "");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("21:00");
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <div><label className={label}>Ходим</label><select className={input} value={userId} onChange={(e) => setUserId(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label className={label}>Бошланиши</label><input type="time" className={input} value={start} onChange={(e) => setStart(e.target.value)} /></div>
      <div><label className={label}>Тугаши</label><input type="time" className={input} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      <div className="flex flex-wrap gap-1">
        {DAYS.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(days.includes(i + 1) ? days.filter((x) => x !== i + 1) : [...days, i + 1])}
            className={`h-10 w-9 rounded-lg border text-xs ${days.includes(i + 1) ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
          >
            {d}
          </button>
        ))}
      </div>
      <Button disabled={pending || !userId} onClick={() => run(() => addShift(companyId, { userId, days, start, end }), "Смена қўшилди")}>Қўшиш</Button>
    </div>
  );
}

export function DeleteButton({ companyId, id, kind }: { companyId: string; id: string; kind: "shift" | "catalog" }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" disabled={pending} aria-label="Ўчириш" onClick={() => run(() => (kind === "shift" ? deleteShift(companyId, id) : deleteCatalogItem(companyId, id)), "Ўчирилди")}>
      <Trash2 />
    </Button>
  );
}

export function CatalogForm({ companyId }: { companyId: string }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [available, setAvailable] = useState(true);
  const [note, setNote] = useState("");
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <div className="min-w-40 flex-1"><label className={label}>Гул / букет номи</label><input className={input} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="w-32"><label className={label}>Нарх (сўм)</label><input className={input} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} /></div>
      <div className="min-w-32 flex-1"><label className={label}>Изоҳ</label><input className={input} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <label className="flex h-10 items-center gap-1.5 text-xs"><input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} /> Мавжуд</label>
      <Button
        disabled={pending || !name.trim()}
        onClick={() => run(() => addCatalogItem(companyId, { name, price: price ? Number(price) : null, available, note }), "Қўшилди", () => { setName(""); setPrice(""); setNote(""); })}
      >
        Қўшиш
      </Button>
    </div>
  );
}
