import { redirect } from "next/navigation";
import { requireUser, canAccessCompany } from "@/lib/access";
import { ensureMember, ensureAllMembers, isManager } from "@/lib/inbox/members";
import { ensureSettings } from "@/lib/inbox/core";

/** Har bir inbox sahifasi boshida: login, do'konga ruxsat, a'zolik yozuvi va sozlamalar. */
export async function inboxPageCtx(companyId: string, need: "any" | "manager" | "admin" = "any") {
  const user = await requireUser();
  if (!(await canAccessCompany(user, companyId))) redirect("/select-company");
  if (need === "manager" && !isManager(user.role)) redirect(`/c/${companyId}/inbox`);
  if (need === "admin" && user.role !== "ADMIN") redirect(`/c/${companyId}/inbox`);
  const settings = await ensureSettings(companyId);
  if (isManager(user.role)) await ensureAllMembers(companyId);
  const member = await ensureMember(companyId, user);
  return { user, settings, member, manager: isManager(user.role), admin: user.role === "ADMIN" };
}
