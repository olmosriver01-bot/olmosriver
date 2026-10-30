/**
 * KPI_Tizimi_Auditi.xlsx faylidan olingan asl manba ma'lumotlari.
 * Savollar matni, bloklar tartibi, ballar shkalasi va formulalar
 * Excel fayldagi bilan so'zma-so'z va sonma-son mos keladi
 * (openpyxl orqali formulalar va qiymatlar tekshirilgan holda ko'chirilgan).
 *
 * Diqqat (foydalanuvchiga alohida bildirilgan ichki ziddiyat):
 * 9-savol matni "Ҳар бир лавозимда 3–5 та KPI дан ошмайди" deydi, лекин
 * 2-blok uchun Natija varag'idagi tavsiya matni "Лавозим бошига 3–7 та KPI
 * дан ошманг" deb yozilgan. Asl matnlar o'zgartirilmasdan shu ko'rinishda
 * saqlangan (quyida BLOCKS[1].questions[2].text va
 * BLOCKS[1].weakRecommendation da ko'rinadi).
 */

export type Question = {
  id: number; // 1..42, Excel "№" ustuni
  text: string;
};

export type Block = {
  id: number; // 1..7
  title: string; // Excel "N-БЛОК. ..." sarlavhasi
  questions: Question[]; // har doim 6 ta
  weakRecommendation: string; // Natija!G ustuni, blok foizi < 60% bo'lsa ko'rsatiladi
};

export const MAX_SCORE_PER_QUESTION = 3;
export const QUESTIONS_PER_BLOCK = 6;
export const MAX_SCORE_PER_BLOCK = QUESTIONS_PER_BLOCK * MAX_SCORE_PER_QUESTION; // 18
export const BLOCK_COUNT = 7;
export const TOTAL_QUESTIONS = BLOCK_COUNT * QUESTIONS_PER_BLOCK; // 42
export const MAX_TOTAL_SCORE = BLOCK_COUNT * MAX_SCORE_PER_BLOCK; // 126

export const SCORE_SCALE: { value: 0 | 1 | 2 | 3; label: string; description: string }[] = [
  { value: 0, label: "0 — Йўқ", description: "умуман бажарилмайди ёки мавжуд эмас" },
  { value: 1, label: "1 — Қисман", description: "бошланган, лекин тизимли эмас" },
  { value: 2, label: "2 — Асосан", description: "ишлайди, аммо узилишлар/камчиликлар бор" },
  { value: 3, label: "3 — Тўлиқ", description: "тизимли, барқарор ва ҳужжатлаштирилган" },
];

export const BLOCKS: Block[] = [
  {
    id: 1,
    title: "1-БЛОК. Стратегия билан боғлиқлик",
    weakRecommendation:
      "KPI ларни стратегиядан бошланг: аввал компания мақсадларини ёзма шакллантиринг, сўнг уларни бўлим ва ходим даражасигача каскадланг.",
    questions: [
      { id: 1, text: "Компанияда ёзма стратегия ёки йиллик мақсадлар мавжуд" },
      { id: 2, text: "KPI лар компания стратегик мақсадларидан келиб чиқиб белгиланган" },
      { id: 3, text: "Ҳар бир бўлим KPI си компания мақсадига қандай хизмат қилиши аниқ" },
      { id: 4, text: "Компания KPI лари бўлим ва ходим даражасигача каскадланган (декомпозиция)" },
      { id: 5, text: "KPI лар ўртасида зиддият йўқ (бир бўлим KPI си бошқасига қарши ишламайди)" },
      { id: 6, text: "Йил/давр бошида KPI режалари барча даражада расман тасдиқланади" },
    ],
  },
  {
    id: 2,
    title: "2-БЛОК. KPI дизайни ва сифати",
    weakRecommendation:
      "Ҳар бир KPI ни SMART бўйича қайта кўриб чиқинг: формула, вазн ва асосланган план қўйинг. Лавозим бошига 3–7 та KPI дан ошманг.",
    questions: [
      { id: 7, text: "Ҳар бир KPI SMART мезонларига жавоб беради" },
      { id: 8, text: "Ҳар бир KPI учун аниқ ҳисоблаш формуласи ёзилган" },
      { id: 9, text: "Ҳар бир лавозимда 3–5 та KPI дан ошмайди" },
      { id: 10, text: "KPI лар вазн (%) билан тақсимланган ва вазнлар асосланган" },
      { id: 11, text: "Натижа ва жараён кўрсаткичлари мувозанатлашган" },
      { id: 12, text: "Ҳар бир KPI учун мақсадли қиймат (план) асосланган ҳолда белгиланган" },
    ],
  },
  {
    id: 3,
    title: "3-БЛОК. Маълумот йиғиш ва ўлчаш",
    weakRecommendation:
      "Маълумот йиғишни тизимлаштиринг: манба, масъул ва муддатни белгиланг, қўлда манипуляция имконини чекланг.",
    questions: [
      { id: 13, text: "KPI ҳисоблаш учун ишончли маълумот манбалари мавжуд" },
      { id: 14, text: "Маълумотлар тизимли равишда йиғилади (CRM, 1C, ERP ва ҳ.к.)" },
      { id: 15, text: "Маълумотни ким, қачон киритиши аниқ белгиланган" },
      { id: 16, text: "KPI маълумотларини қўлда ўзгартириш/манипуляция имкони чекланган" },
      { id: 17, text: "Маълумотлар ўз вақтида (ой якунида кечикмасдан) тайёр бўлади" },
      { id: 18, text: "KPI ҳисоб-китобида хатолар кам учрайди" },
    ],
  },
  {
    id: 4,
    title: "4-БЛОК. Мониторинг ва ҳисобот",
    weakRecommendation:
      "Ойлик KPI кўриги (review) йиғилишини жорий қилинг: план/факт таҳлили + оғишлар бўйича аниқ чора-тадбирлар.",
    questions: [
      { id: 19, text: "KPI натижалари белгиланган даврийликда кўриб чиқилади (ойлик/чоракли)" },
      { id: 20, text: "KPI дашборд ёки ҳисобот шакли мавжуд ва тушунарли" },
      { id: 21, text: "Раҳбарлар KPI натижалари асосида қарор қабул қилади" },
      { id: 22, text: "План/факт фарқи таҳлил қилинади ва сабаблари аниқланади" },
      { id: 23, text: "KPI муҳокамаси учун мунтазам йиғилишлар ўтказилади" },
      { id: 24, text: "Оғишлар бўйича аниқ чора-тадбирлар режаси тузилади" },
    ],
  },
  {
    id: 5,
    title: "5-БЛОК. Мотивация тизими билан боғлиқлик",
    weakRecommendation:
      "Бонус тизимини KPI га шаффоф боғланг: ходим ўз бонусини ўзи ҳисоблай оладиган даражада содда формула қўлланг.",
    questions: [
      { id: 25, text: "KPI натижалари бонус/мукофот тизимига боғланган" },
      { id: 26, text: "Иш ҳақининг ўзгарувчан қисми KPI га боғлиқлиги ходимларга тушунарли" },
      { id: 27, text: "Бонус ҳисоблаш шаффоф — ходим ўз бонусини ўзи ҳисоблай олади" },
      { id: 28, text: "Бонуслар ўз вақтида тўланади" },
      { id: 29, text: "Мукофотлаш адолатли деб қабул қилинади (норозилик кам)" },
      { id: 30, text: "Юқори ва паст натижа ўртасида мукофотда сезиларли фарқ бор" },
    ],
  },
  {
    id: 6,
    title: "6-БЛОК. Жамоа қабул қилиши ва маданият",
    weakRecommendation:
      "Ходимлар билан ишланг: KPI ларни муҳокама орқали белгиланг, мунтазам фидбек беринг, тизимни жазо эмас, ўсиш воситаси сифатида тақдим этинг.",
    questions: [
      { id: 31, text: "Ходимлар ўз KPI ларини билади ва тушунади" },
      { id: 32, text: "KPI лар ходим билан муҳокама қилиниб белгиланган" },
      { id: 33, text: "KPI жазо эмас, ривожлантириш воситаси сифатида қабул қилинади" },
      { id: 34, text: "Раҳбарлар KPI натижалари бўйича мунтазам фидбек беради" },
      { id: 35, text: "Янги ходимларга KPI тизими адаптация даврида ўргатилади" },
      { id: 36, text: "KPI тизимига яширин қаршилик/саботаж йўқ" },
    ],
  },
  {
    id: 7,
    title: "7-БЛОК. Такомиллаштириш ва ривожлантириш",
    weakRecommendation:
      "KPI тизимини ҳужжатлаштиринг (низом), масъул шахс тайинланг ва йилда камида бир марта қайта кўриб чиқиш тартибини жорий қилинг.",
    questions: [
      { id: 37, text: "KPI лар камида йилда бир марта қайта кўриб чиқилади" },
      { id: 38, text: "Эскирган/ишламаётган KPI лар алмаштирилади" },
      { id: 39, text: "Ходимлардан KPI тизими бўйича фидбек йиғилади" },
      { id: 40, text: "KPI тизими бизнес ўзгаришларига мослашади" },
      { id: 41, text: "KPI тизими учун масъул шахс/бўлим аниқ белгиланган" },
      { id: 42, text: "KPI тизими ҳужжатлаштирилган (низом/регламент мавжуд)" },
    ],
  },
];

export const ALL_QUESTIONS: (Question & { blockId: number })[] = BLOCKS.flatMap((b) =>
  b.questions.map((q) => ({ ...q, blockId: b.id }))
);

export function getBlockByQuestionId(questionId: number): Block | undefined {
  return BLOCKS.find((b) => b.questions.some((q) => q.id === questionId));
}

export function getQuestionById(questionId: number): Question | undefined {
  return ALL_QUESTIONS.find((q) => q.id === questionId);
}

/** Natija!F4 formulasi: =IF(D4<=0.25,...,IF(D4<=0.45,...,IF(D4<=0.65,...,IF(D4<=0.85,...,"5-даража..")))) */
export const MATURITY_LEVELS = [
  {
    max: 0.25,
    level: 1,
    label: "1-даража: МУАММОЛИ",
    description: "KPI тизими амалда йўқ, бошқарув интуицияга асосланган",
    recommendation:
      "Тавсия: KPI тизимини нолдан қуриш керак. Аввало стратегик мақсадларни аниқланг ва 3–5 та асосий кўрсаткичдан бошланг.",
  },
  {
    max: 0.45,
    level: 2,
    label: "2-даража: БОШЛАНҒИЧ ДАРАЖА",
    description: "айрим кўрсаткичлар бор, лекин тизим шаклланмаган",
    recommendation:
      "Тавсия: Пойдевор бор, лекин тизим ишламаяпти. Қуйидаги муаммоли блоклардан бошлаб, кетма-кет тизимлаштиринг.",
  },
  {
    max: 0.65,
    level: 3,
    label: "3-даража: РИВОЖЛАНМОҚДА",
    description: "тизим ишлайди, аммо жиддий бўшлиқлар мавжуд",
    recommendation:
      "Тавсия: Тизим ишлаяпти, аммо бўшлиқлар натижага салбий таъсир қилмоқда. Қизил ва сариқ блокларга эътибор қаратинг.",
  },
  {
    max: 0.85,
    level: 4,
    label: "4-даража: ТИЗИМЛИ",
    description: "KPI тизими барқарор ишлайди, айрим соҳаларни кучайтириш керак",
    recommendation:
      "Тавсия: Яхши даража! Энди тизимни маданиятга айлантириш ва заиф блокларни кучайтириш вақти.",
  },
  {
    max: Infinity,
    level: 5,
    label: "5-даража: ЕТУК",
    description: "KPI тизими бошқарувнинг таянчи, доимий такомиллашади",
    recommendation:
      "Тавсия: Ажойиб! Тизимни сақлаш учун йиллик қайта кўриб чиқиш ва доимий такомиллаштиришни давом эттиринг.",
  },
] as const;

/** Natija!F8 formulasi: =IF(E8<0.4,"Қониқарсиз",IF(E8<0.6,"Заиф",IF(E8<0.8,"Яхши","Кучли"))) */
export const BLOCK_STATUS_THRESHOLDS = {
  unsatisfactory: 0.4, // < 0.4 -> Қониқарсиз
  weak: 0.6, // < 0.6 -> Заиф
  good: 0.8, // < 0.8 -> Яхши, aks holda -> Кучли
} as const;

export type BlockStatusKey = "UNSATISFACTORY" | "WEAK" | "GOOD" | "STRONG";

export const BLOCK_STATUS_LABELS: Record<BlockStatusKey, string> = {
  UNSATISFACTORY: "Қониқарсиз",
  WEAK: "Заиф",
  GOOD: "Яхши",
  STRONG: "Кучли",
};
