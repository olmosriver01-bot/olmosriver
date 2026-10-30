import type { AuditResult } from "./scoring";
import { formatDate } from "./utils";

const STATUS_COLOR: Record<string, string> = {
  Қониқарсиз: "#dc2626",
  Заиф: "#d97706",
  Яхши: "#16a34a",
  Кучли: "#2563eb",
};

export function renderAuditReportHtml({
  companyName,
  auditTitle,
  completedAt,
  result,
}: {
  companyName: string;
  auditTitle: string;
  completedAt: Date | null;
  result: AuditResult;
}): string {
  const blockRows = result.blocks
    .map(
      (b) => `
      <tr>
        <td class="title">${b.title}</td>
        <td class="num">${b.score} / ${b.maxScore}</td>
        <td class="num">${Math.round(b.percent * 100)}%</td>
        <td><span class="badge" style="background:${STATUS_COLOR[b.statusLabel]}1a;color:${STATUS_COLOR[b.statusLabel]}">${b.statusLabel}</span></td>
        <td class="rec">${b.weakRecommendation ?? "—"}</td>
      </tr>`
    )
    .join("");

  const zero = result.zeroScoreQuestionIds.length;
  const one = result.oneScoreQuestionIds.length;

  return `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; padding: 36px 44px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
  .summary { display: flex; gap: 18px; margin-bottom: 20px; }
  .summary .box { flex: 1; border: 1px solid #e2e6ee; border-radius: 10px; padding: 14px 16px; }
  .summary .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .03em; margin-bottom: 4px; }
  .summary .value { font-size: 22px; font-weight: 700; }
  .rec-box { background: #eef1f6; border-radius: 10px; padding: 14px 16px; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e6ee; vertical-align: top; }
  th { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  td.num { white-space: nowrap; }
  td.rec { color: #475569; max-width: 260px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 600; font-size: 11px; }
  .section-title { font-size: 14px; font-weight: 700; margin: 20px 0 8px; }
  .bottleneck { border: 1px solid #fecaca; background: #fef2f2; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
  .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; text-align: center; }
  .pill-row { display: flex; gap: 10px; margin-bottom: 20px; }
  .pill { border: 1px solid #e2e6ee; border-radius: 10px; padding: 10px 14px; font-size: 12px; }
</style>
</head>
<body>
  <h1>KPI ТИЗИМИ АУДИТИ — ҲИСОБОТ</h1>
  <div class="sub">${companyName} · ${auditTitle} · Якунланган: ${formatDate(completedAt)}</div>

  <div class="summary">
    <div class="box">
      <div class="label">Умумий балл</div>
      <div class="value">${result.totalScore} / ${result.maxTotalScore}</div>
    </div>
    <div class="box">
      <div class="label">Фоиз</div>
      <div class="value">${result.percentDisplay.toFixed(1)}%</div>
    </div>
    <div class="box">
      <div class="label">Етуклик даражаси</div>
      <div class="value" style="font-size:15px">${result.maturity?.label ?? ""}</div>
    </div>
  </div>

  <div class="rec-box">${result.maturity?.recommendation ?? ""}</div>

  <div class="pill-row">
    <div class="pill"><strong>${result.strongestBlock?.title}</strong> — энг кучли йўналиш (${Math.round((result.strongestBlock?.percent ?? 0) * 100)}%)</div>
    <div class="pill"><strong>0 балл:</strong> ${zero} мезон</div>
    <div class="pill"><strong>1 балл:</strong> ${one} мезон</div>
  </div>

  <div class="section-title">Блоклар бўйича натижа</div>
  <table>
    <thead><tr><th>Блок</th><th>Балл</th><th>Фоиз</th><th>Ҳолат</th><th>Тавсия (блок заиф бўлса)</th></tr></thead>
    <tbody>${blockRows}</tbody>
  </table>

  <div class="section-title">Энг заиф соҳа (bottleneck)</div>
  <div class="bottleneck">${result.bottleneckText ?? ""}</div>

  <div class="footer">KPI AUDIT PRO · Ушбу ҳисобот дастур томонидан автоматик яратилган</div>
</body>
</html>`;
}
