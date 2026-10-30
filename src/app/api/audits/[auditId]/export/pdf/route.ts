import { NextResponse } from "next/server";
import { chromium } from "playwright-core";
import { getCurrentUser, canAccessCompany } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getAuditResult } from "@/lib/data";
import { renderAuditReportHtml } from "@/lib/report-html";

export async function GET(_req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Авторизация керак" }, { status: 401 });

  const audit = await prisma.audit.findUnique({ where: { id: auditId }, include: { company: true } });
  if (!audit) return NextResponse.json({ error: "Топилмади" }, { status: 404 });
  if (!(await canAccessCompany(user, audit.companyId))) return NextResponse.json({ error: "Рухсат йўқ" }, { status: 403 });

  const result = await getAuditResult(auditId);
  if (!result || !result.isComplete) {
    return NextResponse.json({ error: "Аудит якунланмаган, PDF ҳисобот мавжуд эмас" }, { status: 400 });
  }

  const html = renderAuditReportHtml({
    companyName: audit.company.name,
    auditTitle: audit.title,
    completedAt: audit.completedAt,
    result,
  });

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "0", right: "0" } });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="KPI_Audit_${audit.company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${audit.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
