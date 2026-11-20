/**
 * Mijoz xabari javob talab qiladimi — deterministik, AI'siz qoida.
 * "Rahmat", "ok", emoji va reaksiyalar javobsiz savol hisoblanmaydi.
 * Shubhali holatda xabar javob talab qiladi deb olinadi (mijozni yo'qotmaslik uchun).
 */
const ACK_PHRASES = [
  "rahmat", "raxmat", "rahmat katta", "katta rahmat", "kattakon rahmat", "tashakkur", "sog boling", "sog bo ling",
  "раҳмат", "рахмат", "катта раҳмат", "катта рахмат", "раҳмат катта", "рахмат катта", "ташаккур", "соғ бўлинг",
  "спасибо", "спасибо большое", "большое спасибо", "благодарю", "спс", "пасиб",
  "ok", "okay", "oke", "ок", "окей", "хорошо", "ладно", "понятно", "поняла", "понял", "ясно", "договорились",
  "xop", "hop", "ho p", "xo p", "хоп", "хўп", "хуп", "mayli", "майли", "tushunarli", "тушунарли",
  "yaxshi", "яхши", "zor", "zo r", "зўр", "зур", "ha", "ҳа", "ха", "да", "ага", "угу", "thanks", "thank you",
  "kelishdik", "келишдик", "boldi", "bo ldi", "бўлди", "булди",
];
const ACK_SET = new Set(ACK_PHRASES);
const ACK_WORDS = new Set(ACK_PHRASES.flatMap((p) => p.split(" ")));

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ʻʼ’'`‘]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function messageNeedsReply(input: { kind: string; text: string }): boolean {
  if (input.kind === "REACTION") return false;
  const raw = input.text ?? "";
  if (!raw.trim()) return input.kind !== "TEXT"; // rasm/ovozli xabar — javob kutadi
  if (raw.includes("?")) return true;
  const norm = normalizeText(raw);
  if (!norm) return false; // faqat emoji yoki tinish belgisi
  if (ACK_SET.has(norm)) return false;
  const words = norm.split(" ");
  if (words.length <= 4 && words.every((w) => ACK_WORDS.has(w))) return false;
  return true;
}

/** Sozlamalardagi avtomatik salomlashuv/yo'qligi matnlariga mos keladimi. */
export function matchesAutoReply(text: string, patterns: string): boolean {
  const norm = normalizeText(text);
  if (!norm) return false;
  for (const line of patterns.split("\n")) {
    const p = normalizeText(line);
    if (!p) continue;
    if (norm === p) return true;
    if (p.length >= 15 && norm.includes(p)) return true;
  }
  return false;
}
