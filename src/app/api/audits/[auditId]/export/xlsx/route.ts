import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentUser, canAccessCompany } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getAuditResult } from "@/lib/data";
import { BLOCKS } from "@/lib/kpi-data";
import { formatDate } from "@/lib/utils";

export async function GET(_req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Авторизация керак" }, { status: 401 });

  const audit = await prisma.audit.findUnique({ where: { id: auditId }, include: { answers: true, company: true } });
  if (!audit) return NextResponse.json({ error: "Топилмади" }, { status: 404 });
  if (!(await canAccessCompany(user, audit.companyId))) return NextResponse.json({ error: "Рухсат йўқ" }, { status: 403 });

  const result = await getAuditResult(auditId);
  const answersByQuestion = new Map(audit.answers.map((a) => [a.questionId, a]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPI AUDIT PRO";
  workbook.created = new Date();

  const info = workbook.addWorksheet("Кириш");
  info.getColumn(2).width = 28;
  info.getColumn(3).width = 70;
  info.getCell("B2").value = "KPI ТИЗИМИ АУДИТИ";
  info.getCell("B2").font = { bold: true, size: 14 };
  info.getCell("B3").value = `Компания: ${audit.company.name}`;
  info.getCell("B4").value = `Аудит: ${audit.title}`;
  info.getCell("B5").value = `Ҳолат: ${audit.status === "COMPLETED" ? "Якунланган" : "Жараёнда"}`;
  info.getCell("B6").value = `Бошланган сана: ${formatDate(audit.startedAt)}`;
  info.getCell("B7").value = `Якунланган сана: ${formatDate(audit.completedAt)}`;
  info.getCell("B9").value = "БАҲОЛАШ ШКАЛАСИ";
  info.getCell("B9").font = { bold: true };
  info.getCell("B10").value = "0 балл — Йўқ";
  info.getCell("B11").value = "1 балл — Қисман";
  info.getCell("B12").value = "2 балл — Асосан";
  info.getCell("B13").value = "3 балл — Тўлиқ";

  const auditSheet = workbook.addWorksheet("Аудит");
  auditSheet.columns = [
    { header: "№", key: "num", width: 6 },
    { header: "Мезон", key: "text", width: 70 },
    { header: "Балл", key: "score", width: 10 },
    { header: "Изоҳ / далил", key: "comment", width: 40 },
  ];
  auditSheet.getRow(1).font = { bold: true };

  let rowIdx = 2;
  for (const block of BLOCKS) {
    const blockHeaderRow = auditSheet.getRow(rowIdx);
    blockHeaderRow.getCell(1).value = block.title;
    blockHeaderRow.getCell(1).font = { bold: true };
    auditSheet.mergeCells(rowIdx, 1, rowIdx, 4);
    rowIdx++;

    const blockStartRow = rowIdx;
    for (const q of block.questions) {
      const answer = answersByQuestion.get(q.id);
      auditSheet.getRow(rowIdx).values = [q.id, q.text, answer?.score ?? "", answer?.comment ?? ""];
      rowIdx++;
    }
    const sumRow = auditSheet.getRow(rowIdx);
    sumRow.getCell(2).value = "Блок жами (макс. 18)";
    sumRow.getCell(2).font = { italic: true };
    sumRow.getCell(3).value = { formula: `SUM(C${blockStartRow}:C${rowIdx - 1})` };
    rowIdx += 2;
  }

  const resultSheet = workbook.addWorksheet("Натижа");
  resultSheet.getColumn(2).width = 40;
  resultSheet.getColumn(3).width = 12;
  resultSheet.getColumn(4).width = 12;
  resultSheet.getColumn(5).width = 12;
  resultSheet.getColumn(6).width = 55;

  resultSheet.getCell("B1").value = "KPI ТИЗИМИ АУДИТИ — НАТИЖА";
  resultSheet.getCell("B1").font = { bold: true, size: 14 };

  if (result?.isComplete) {
    resultSheet.getCell("B3").value = "Умумий балл";
    resultSheet.getCell("C3").value = `${result.totalScore} / ${result.maxTotalScore}`;
    resultSheet.getCell("B4").value = "Фоиз";
    resultSheet.getCell("C4").value = `${result.percentDisplay.toFixed(1)}%`;
    resultSheet.getCell("B5").value = "Етуклик даражаси";
    resultSheet.getCell("C5").value = result.maturity?.label ?? "";
    resultSheet.getCell("B6").value = result.maturity?.recommendation ?? "";
    resultSheet.mergeCells("B6:F6");

    resultSheet.getRow(8).values = ["", "Блок", "Балл", "Макс.", "Фоиз", "Ҳолат / Тавсия"];
    resultSheet.getRow(8).font = { bold: true };
    let r = 9;
    for (const b of result.blocks) {
      resultSheet.getRow(r).values = [
        "",
        b.title,
        b.score,
        b.maxScore,
        `${Math.round(b.percent * 100)}%`,
        `${b.statusLabel}${b.weakRecommendation ? " — " + b.weakRecommendation : ""}`,
      ];
      r++;
    }
    r += 1;
    resultSheet.getCell(`B${r}`).value = "ЭНГ ЗАИФ СОҲА (BOTTLENECK)";
    resultSheet.getCell(`B${r}`).font = { bold: true };
    resultSheet.getCell(`B${r + 1}`).value = result.bottleneckText ?? "";
    resultSheet.mergeCells(`B${r + 1}:F${r + 1}`);
  } else {
    resultSheet.getCell("B3").value = `Аудит тугалланмаган: ${result?.answeredCount ?? 0} / 42 саволга жавоб берилди.`;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="KPI_Audit_${audit.company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${audit.title.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx"`,
    },
  });
}
