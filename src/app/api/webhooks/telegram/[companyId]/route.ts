import { NextResponse } from "next/server";
import { alreadyProcessed, markProcessed } from "@/lib/inbox/core";
import { handleTelegramUpdate, verifyTelegramSecret, type TgUpdate } from "@/lib/inbox/telegram";
import { redact } from "@/lib/inbox/crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  // Haqiqiylik: Telegram har so'rovda setWebhook'da berilgan maxfiy kalitni yuboradi.
  if (!(await verifyTelegramSecret(companyId, req.headers.get("x-telegram-bot-api-secret-token")))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof update?.update_id !== "number") return NextResponse.json({ ok: false }, { status: 400 });

  const dedupeKey = `tg:${companyId}:${update.update_id}`;
  if (await alreadyProcessed(dedupeKey)) return NextResponse.json({ ok: true, duplicate: true });
  try {
    await handleTelegramUpdate(companyId, update);
    await markProcessed(companyId, dedupeKey);
  } catch (e) {
    // 500 — Telegram keyinroq qayta yuboradi; qayta ishlash idempotent.
    console.error("[inbox] telegram webhook хатоси:", redact(e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
