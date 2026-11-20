export const FINDING_TYPE_LABELS: Record<string, string> = {
  UNANSWERED_PART: "Саволнинг бир қисми жавобсиз қолган",
  RUDE_REPLY: "Қўпол ёки менсимай ёзилган жавоб",
  MISSING_ORDER_DETAILS: "Буюртмада келишилмаган муҳим маълумот",
  IGNORED_COMPLAINT: "Мижоз норозилиги эътиборсиз қолган",
  BROKEN_CALLBACK_PROMISE: "Ваъда қилинган қайта алоқа бажарилмаган",
  PRICE_MISMATCH: "Нарх/шарт CRMдаги маълумотга мос эмас",
  OTHER: "Бошқа камчилик",
};
export const SEVERITY_LABELS: Record<string, string> = { HIGH: "юқори", MEDIUM: "ўртача", LOW: "паст" };

/** Xabarnomadagi dalil: qisqartirilgan, uzun raqamlar (telefon, karta) yashirilgan. */
export function evidenceQuote(text: string, kind = "TEXT", max = 220): string {
  const masked = text.replace(/\+?\d(?:[\s\-().]*\d){8,}/g, "[рақам]").replace(/\s+/g, " ").trim();
  if (!masked) return `[${kind.toLowerCase()}]`;
  return masked.length > max ? `${masked.slice(0, max)}…` : masked;
}

export function customerLabel(c: { customerName: string | null; customerUsername: string | null }): string {
  return c.customerName || (c.customerUsername ? `@${c.customerUsername}` : "Мижоз");
}
