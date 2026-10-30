import { NextResponse } from "next/server";
import { getCurrentUser, canAccessCompany } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getAuditResult } from "@/lib/data";
import { isAiConfigured, getAiAuditSummary } from "@/lib/ai";

export async function GET(_req: Request, { params }: { params: Promise<{ companyId: string; auditId: string }> }) {
  const { companyId, auditId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Авторизация керак" }, { status: 401 });
  if (!(await canAccessCompany(user, companyId))) {
    return NextResponse.json({ error: "Рухсат йўқ" }, { status: 403 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json({ available: false });
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const result = await getAuditResult(auditId);
  if (!company || !result || !result.isComplete) {
    return NextResponse.json({ available: false });
  }

  try {
    const text = await getAiAuditSummary(company.name, result);
    return NextResponse.json({ available: true, text });
  } catch {
    return NextResponse.json({ available: false });
  }
}
