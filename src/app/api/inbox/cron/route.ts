import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/inbox/crypto";
import { tickAll } from "@/lib/inbox/scheduler";

export const dynamic = "force-dynamic";

/** Ixtiyoriy tashqi trigger (server ichidagi rejalashtiruvchiga qo'shimcha). INBOX_CRON_SECRET talab qilinadi. */
export async function POST(req: Request) {
  const secret = process.env.INBOX_CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ ok: false }, { status: 401 });
  const companies = await tickAll();
  return NextResponse.json({ ok: true, companies });
}
