// Ўзбек кирилл ↔ лотин ёрдамчи функциялари (қидирув ва интерфейс учун).
const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh',
  щ: 'sh', ъ: 'ʼ', ь: '', ы: 'i', э: 'e', ю: 'yu', я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h',
};
const VOWELS = 'аеёиоуэюяўАЕЁИОУЭЮЯЎ';
const isCyr = (c: string) => /[Ѐ-ӿ]/.test(c);

/** Кирилл матнни ўзбек лотин ёзувига ўтказади (интерфейс учун). Лотин матнга тегмайди. */
export function toLatin(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const low = ch.toLowerCase();
    let r = MAP[low];
    if (r === undefined) { out += ch; continue; }
    const prev = text[i - 1];
    if (low === 'е' && (!prev || !isCyr(prev) || VOWELS.includes(prev))) r = 'ye';
    if (low === 'ц' && prev && VOWELS.includes(prev)) r = 'ts';
    if (ch !== low && r) {
      const next = text[i + 1];
      const allCaps = r.length > 1 && next && isCyr(next) && next === next.toUpperCase() && next !== next.toLowerCase();
      r = allCaps || (r.length > 1 && !next && prev && prev === prev.toUpperCase() && isCyr(prev)) ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1);
    }
    out += r;
  }
  return out;
}

/** Қидирув учун нормаллаштириш: кичик ҳарф, кирилл→лотин, апострофларсиз. */
export function normalize(text: string): string {
  return toLatin(text.toLowerCase()).replace(/[ʻʼ’‘'`´]/g, '').normalize('NFC');
}

export function tokens(text: string): string[] {
  return normalize(text).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
}
