import type { AuditResult } from "./scoring";

/**
 * Qo'shimcha, ixtiyoriy AI tavsiya funksiyasi. Excel manbasidagi asosiy
 * tavsiyalardan mustaqil ravishda ishlaydi. ANTHROPIC_API_KEY muhit
 * o'zgaruvchisi serverda sozlanmagan bo'lsa, bu funksiya chaqirilmaydi va
 * asosiy dastur hech qanday cheklovsiz ishlashda davom etadi.
 */
export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function getAiAuditSummary(companyName: string, result: AuditResult): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY sozlanmagan");

  const blockLines = result.blocks
    .map((b) => `- ${b.title}: ${Math.round(b.percent * 100)}% (${b.statusLabel})`)
    .join("\n");

  const prompt = `Siz KPI tizimlari bo'yicha ekspert maslahatchisiz. "${companyName}" kompaniyasining KPI audit natijalari quyidagicha:

Umumiy natija: ${result.percentDisplay.toFixed(1)}% (${result.maturity?.label})
Bloklar bo'yicha natija:
${blockLines}

Eng zaif blok: ${result.weakestBlock?.title}
Eng kuchli blok: ${result.strongestBlock?.title}

O'zbek tilida, 4-6 jumladan iborat, amaliy va aniq strategik tavsiya yozing: qaysi 2-3 ta harakatni birinchi navbatda bajarish kerak. Excel formulalarini yoki foizlarni qayta aytib bermang, faqat amaliy tavsiya bering.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`AI so'rovida xatolik: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("AI javobi bo'sh keldi");
  return text as string;
}
