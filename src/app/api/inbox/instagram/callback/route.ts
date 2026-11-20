import { NextResponse } from "next/server";
import { getCurrentUser, canAccessCompany } from "@/lib/access";
import { verifyState } from "@/lib/inbox/crypto";
import { completeInstagramConnect } from "@/lib/inbox/instagram";
import { appBaseUrl } from "@/lib/inbox/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = verifyState<{ companyId: string; userId: string; exp: number }>(url.searchParams.get("state") ?? "");
  const user = await getCurrentUser();
  if (!state || !user || user.id !== state.userId || user.role !== "ADMIN" || !(await canAccessCompany(user, state.companyId))) {
    return new Response("Рухсат йўқ ёки сўров муддати ўтган. CRMдан қайта уриниб кўринг.", { status: 403 });
  }
  const back = (q: string) => NextResponse.redirect(`${appBaseUrl() || url.origin}/c/${state.companyId}/inbox/settings?${q}`);
  const code = url.searchParams.get("code");
  if (!code) return back(`ig=error&msg=${encodeURIComponent(url.searchParams.get("error_description") ?? "Рухсат берилмади")}`);
  try {
    await completeInstagramConnect(state.companyId, code.replace(/#_$/, ""));
    return back("ig=ok");
  } catch (e) {
    return back(`ig=error&msg=${encodeURIComponent(e instanceof Error ? e.message : "Уланмади")}`);
  }
}
