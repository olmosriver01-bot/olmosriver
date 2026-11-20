import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import { PLATFORM_LABELS, type Platform } from "@/lib/inbox/core";
import { isManager, listStaff } from "@/lib/inbox/members";
import { formatHHMM, formatLocal } from "@/lib/inbox/time";
import { AI_MODELS, isAiConfigured } from "@/lib/inbox/ai";
import { appBaseUrl } from "@/lib/inbox/http";
import { instagramRedirectUri, instagramWebhookUrl } from "@/lib/inbox/instagram";
import { inboxPageCtx } from "../_components/ctx";
import { InboxNav } from "../_components/inbox-nav";
import { CatalogForm, DeleteButton, GeneralForm, InstagramCard, MemberRow, RemoveChannelButton, ShiftForm, TelegramBotCard } from "./forms";

const DAY_NAMES = ["", "Ду", "Се", "Чо", "Па", "Жу", "Ша", "Як"];
const STATUS_TEXT: Record<string, string> = { CONNECTED: "Уланган", PENDING: "Кутилмоқда", DISCONNECTED: "Узилган", ERROR: "Хато" };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function InboxSettingsPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ ig?: string; msg?: string }> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { settings, manager, admin } = await inboxPageCtx(companyId, "admin");
  const tz = settings.timezone;

  const [channels, staff, members, access, shifts, catalog, failedAlerts, outages] = await Promise.all([
    prisma.inboxChannel.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    listStaff(companyId),
    prisma.inboxMember.findMany({ where: { companyId } }),
    prisma.inboxChannelAccess.findMany({ where: { channel: { companyId } } }),
    prisma.inboxShift.findMany({ where: { companyId }, orderBy: { startMinute: "asc" } }),
    prisma.inboxCatalogItem.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.inboxAlert.findMany({ where: { companyId, ok: false }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.inboxOutage.findMany({ where: { companyId }, orderBy: { startedAt: "desc" }, take: 8, include: { channel: { select: { name: true } } } }),
  ]);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const base = appBaseUrl();
  const https = base.startsWith("https://");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ёзишмалар назорати — созламалар</h1>
      </div>
      <InboxNav companyId={companyId} manager={manager} admin={admin} />

      {sp.ig === "ok" && <p className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">Instagram профил уланди.</p>}
      {sp.ig === "error" && <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">Instagram уланмади: {sp.msg ?? "номаълум хато"}</p>}
      {!https && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          Дастур манзили HTTPS эмас ({base || "APP_URL созланмаган"}). Telegram ва Instagram webhook фақат очиқ HTTPS манзилга хабар юборади — профилларни улаш учун дастур
          серверда (масалан Fly.io) ишлаши керак.
        </p>
      )}

      <Section title="Уланган профиллар" hint="Ҳар бир профилнинг ҳолати Telegram/Instagram API'нинг ўзидан ҳар 5 дақиқада текширилади.">
        {channels.length === 0 && <p className="text-sm text-muted-foreground">Ҳали профил уланмаган. Қуйидаги қадамларни бажаринг.</p>}
        <ul className="divide-y divide-border">
          {channels.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0 space-y-0.5">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {c.name} <span className="font-normal text-muted-foreground">{PLATFORM_LABELS[c.platform as Platform]}{c.username ? ` · @${c.username}` : ""}</span>
                  <Badge variant={c.status === "CONNECTED" ? "success" : c.status === "PENDING" ? "warning" : "danger"}>{STATUS_TEXT[c.status] ?? c.status}</Badge>
                </p>
                {c.statusDetail && <p className="text-xs text-danger">{c.statusDetail}</p>}
                <p className="text-xs text-muted-foreground">
                  Охирги муваффақиятли текширув: {formatLocal(c.lastSyncOkAt, tz)} · Охирги келган хабар: {formatLocal(c.lastEventAt, tz)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Кузатув бошланган: {formatLocal(c.trackingStartedAt, tz)}. Ундан олдинги ёзишмалар юкланмаган.
                  {c.platform === "INSTAGRAM" && c.tokenExpiresAt ? ` Токен муддати: ${formatLocal(c.tokenExpiresAt, tz)} гача (автоматик узайтирилади).` : ""}
                </p>
              </div>
              <RemoveChannelButton companyId={companyId} channelId={c.id} name={c.name} />
            </li>
          ))}
        </ul>
        <p className="mt-2 rounded-lg bg-surface-muted p-3 text-xs text-muted-foreground">
          Тарих ҳақида: Telegram Business бот уланишдан олдинги ёзишмаларни бермайди — фақат улангандан кейинги хабарлар келади. Instagram API ҳар бир суҳбатда фақат охирги
          20 та хабар тафсилотини беради; бу версияда эски тарих импорт қилинмайди. Уланиш узилган вақтдаги хабарлар ҳам автоматик тикланмайди.
        </p>
      </Section>

      <Section title="1. Telegram бот" hint="Битта бот икки ишни бажаради: Telegram Business аккаунтларига уланади ва раҳбар/ходимларга огоҳлантириш юборади.">
        <TelegramBotCard companyId={companyId} connected={!!settings.tgBotTokenEnc} username={settings.tgBotUsername} />
        {settings.tgBotTokenEnc && (
          <p className="mt-2 text-xs text-muted-foreground">
            Бот ҳолати: {settings.tgLastError ? <span className="text-danger">{settings.tgLastError}</span> : "ишламоқда"} · охирги муваффақиятли текширув: {formatLocal(settings.tgLastOkAt, tz)}
          </p>
        )}
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>@BotFather&apos;да янги бот очинг, сўнг Bot Settings → Business Mode&apos;ни ёқинг.</li>
          <li>Токенни юқоридаги майдонга киритинг.</li>
          <li>Дўкон Telegram аккаунтида (Telegram Premium/Business керак): Settings → Telegram Business → Chatbots → бот номини киритинг ва «хабарларга жавоб бериш» рухсатини беринг.</li>
          <li>Профил шу саҳифада автоматик пайдо бўлади. Битта аккаунтга фақат битта бот уланади.</li>
        </ol>
      </Section>

      <Section title="2. Instagram" hint="Instagram Professional (Business ёки Creator) аккаунт ва Meta дастурчи иловаси керак. Парол сўралмайди — рухсат Instagram ойнасида берилади.">
        <InstagramCard
          companyId={companyId}
          appId={settings.igAppId}
          hasSecret={!!settings.igAppSecretEnc}
          webhookUrl={instagramWebhookUrl(companyId)}
          redirectUri={instagramRedirectUri()}
          verifyToken={settings.igVerifyToken}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Чекловлар: App Review ва бизнес тасдиқлашдан ўтмагунча илова фақат унда роли бор (админ/тестер) Instagram аккаунтлари билан ишлайди; webhook келиши учун илова
          «Live» режимда бўлиши керак. Мижоз охирги хабаридан 24 соат ўтгач API орқали жавоб ёзиб бўлмайди.
        </p>
      </Section>

      <Section title="Вақтлар, ҳисобот, AI ва сақлаш">
        <GeneralForm
          companyId={companyId}
          aiKeyPresent={isAiConfigured()}
          models={Object.entries(AI_MODELS).map(([id, m]) => ({ id, label: `${m.label} — $${m.input}/$${m.output} 1М токен` }))}
          initial={{
            reminderMinutes: settings.reminderMinutes,
            managerMinutes: settings.managerMinutes,
            adminMinutes: settings.adminMinutes,
            reportTime: settings.reportTime,
            timezone: settings.timezone,
            retentionDays: settings.retentionDays,
            autoReplyPatterns: settings.autoReplyPatterns,
            deliveryTerms: settings.deliveryTerms,
            aiEnabled: settings.aiEnabled,
            aiModel: settings.aiModel,
          }}
        />
      </Section>

      <Section title="Қабул қилувчилар ва ҳуқуқлар" hint="Огоҳлантириш ва ҳисобот фақат шу ерда белгиланганларга юборилади. Ҳар бир ходим «Суҳбатлар» саҳифасида ўз Telegram'ини боғлайди.">
        <ul className="divide-y divide-border">
          {staff.map((s) => {
            const m = members.find((x) => x.userId === s.id);
            return (
              <MemberRow
                key={s.id}
                companyId={companyId}
                name={s.name}
                roleLabel={ROLE_LABELS[s.role]}
                isManagerRole={isManager(s.role)}
                linked={!!m?.telegramChatId}
                channels={channels.map((c) => ({ id: c.id, name: c.name }))}
                initial={{
                  userId: s.id,
                  notifyReminder: m?.notifyReminder ?? false,
                  notifyManager: m?.notifyManager ?? false,
                  notifyAdmin: m?.notifyAdmin ?? false,
                  receiveReport: m?.receiveReport ?? false,
                  allChannels: m?.allChannels ?? true,
                  channelIds: access.filter((a) => a.userId === s.id).map((a) => a.channelId),
                }}
              />
            );
          })}
        </ul>
      </Section>

      <Section title="Сменалар" hint="Смена киритилмаган ходим доим навбатда деб ҳисобланади. Масъул сменада бўлмаса, эслатма сменадаги сотувчиларга боради.">
        <ul className="mb-3 divide-y divide-border text-sm">
          {shifts.map((sh) => (
            <li key={sh.id} className="flex items-center justify-between py-1.5">
              <span>
                {staffName.get(sh.userId) ?? "Ходим"} · {formatHHMM(sh.startMinute)}–{formatHHMM(sh.endMinute)} · {sh.days.split(",").map((d) => DAY_NAMES[Number(d)]).join(", ")}
              </span>
              <DeleteButton companyId={companyId} id={sh.id} kind="shift" />
            </li>
          ))}
        </ul>
        <ShiftForm companyId={companyId} staff={staff.map((s) => ({ id: s.id, name: s.name }))} />
      </Section>

      <Section title="Тасдиқланган нархлар ва мавжуд гуллар" hint="AI нарх ва мавжудликни фақат шу рўйхат билан солиштиради. Рўйхат бўш бўлса «текшириш учун маълумот етарли эмас» деб ёзади.">
        <ul className="mb-3 divide-y divide-border text-sm">
          {catalog.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-1.5">
              <span>
                {c.name} · {c.price === null ? "нарх кўрсатилмаган" : `${c.price.toLocaleString("ru-RU")} сўм`} · {c.available ? "мавжуд" : "йўқ"}
                {c.note ? ` · ${c.note}` : ""}
              </span>
              <DeleteButton companyId={companyId} id={c.id} kind="catalog" />
            </li>
          ))}
        </ul>
        <CatalogForm companyId={companyId} />
      </Section>

      <Section title="Журнал: узилишлар ва етказилмаган огоҳлантиришлар">
        {outages.length === 0 && failedAlerts.length === 0 && <p className="text-sm text-muted-foreground">Ёзув йўқ.</p>}
        <ul className="space-y-1 text-xs">
          {outages.map((o) => (
            <li key={o.id}>
              🔌 {o.channel.name}: {formatLocal(o.startedAt, tz)} — {o.endedAt ? formatLocal(o.endedAt, tz) : "давом этмоқда"} · {o.reason}
            </li>
          ))}
          {failedAlerts.map((a) => (
            <li key={a.id}>
              ✉️ {formatLocal(a.createdAt, tz)} · {a.kind} · {a.recipientUserId ? (staffName.get(a.recipientUserId) ?? "ходим") : "қабул қилувчи йўқ"}: {a.error}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
