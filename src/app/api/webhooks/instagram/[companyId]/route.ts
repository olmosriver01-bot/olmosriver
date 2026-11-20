import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { alreadyProcessed, markProcessed } from "@/lib/inbox/core";
import { handleInstagramItem, splitInstagramPayload, verifyInstagramSignature, type IgWebhookBody } from "@/lib/inbox/instagram";
import { redact, safeEqual } from "@/lib/inbox/crypto";

export const dynamic = "force-dynamic";

/** Meta webhook manzilini tasdiqlash (hub.challenge). */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const url = new URL(req.url);
  const settings = await prisma.inboxSettings.findUnique({ where: { companyId }, select: { igVerifyToken: true } });
  const token = url.searchParams.get("hub.verify_token") ?? "";
  if (url.searchParams.get("hub.mode") === "subscribe" && settings?.igVerifyToken && safeEqual(settings.igVerifyToken, token)) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const raw = await req.text();
  // Haqiqiylik: tana ilova maxfiy kaliti bilan imzolangan (X-Hub-Signature-256).
  if (!(await verifyInstagramSignature(companyId, raw, req.headers.get("x-hub-signature-256")))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let body: IgWebhookBody;
  try {
    body = JSON.parse(raw) as IgWebhookBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  let failed = false;
  for (const work of splitInstagramPayload(companyId, body)) {
    if (await alreadyProcessed(work.dedupeKey)) continue;
    try {
      await handleInstagramItem(companyId, work);
      await markProcessed(companyId, work.dedupeKey);
    } catch (e) {
      failed = true;
      console.error("[inbox] instagram webhook хатоси:", redact(e instanceof Error ? e.message : String(e)));
    }
  }
  return NextResponse.json({ ok: !failed }, { status: failed ? 500 : 200 });
}
