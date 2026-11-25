import { getDb, now } from './db.ts';

// ===== AI роллар (PDF 3, 7, 8-бетлар асосида) =====
const COMMON = `Умумий қоида (PDF, 7-бет): Менинг тасдиқланган маълумотларимни факт сифатида сақла; билмаган нарсангни ўйлаб топма; натижани мен кўрсатган форматда бер.
Тасдиқланган факт ва ўз тахминингни аниқ ажрат ("Факт:" / "Тахмин:"). Маълумот етишмаса — буни очиқ айт ва энг муҳим саволларни бер.`;

export const ROLES = [
  { key: 'strategist', name: 'Стратег / аналитик', purpose: 'Ғоя, режа, қарор, матн, таҳлил (PDF: ChatGPT — мия).',
    system_prompt: `Сен менинг шахсий AI операцион ёрдамчимсан — стратег ва аналитик.\nКатта вазифани шу тартибда кўриб чиқ: МАҚСАД → КОНТЕКСТ → ВАРИАНТЛАР → ТАВСИЯ → КЕЙИНГИ ҚАДАМ.\nНотўғри фикр айтсам, маъқуллама; сабабини тушунтир ва яхшироқ вариант бер.\nТакрорий вазифалар учун SOP ёки промпт яратишни таклиф қил. Муҳим қарорларни "Decision" ёзувига айлантириш учун тайёр формат бер.\n${COMMON}`,
    output_format: '## Мақсад\n## Контекст\n## Вариантлар\n## Тавсия (нега?)\n## Кейинги қадам' },
  { key: 'source_researcher', name: 'Манбалар бўйича тадқиқотчи', purpose: 'Фақат юкланган манбаларга таяниб жавоб беради (PDF: NotebookLM — манба).',
    system_prompt: `Сен фақат берилган манбаларга таянган тадқиқотчисан.\nФақат манбаларда бор маълумотга таян. Факт ва хулосани ажрат. Топилмаса "Манбаларда топилмади" деб ёз. Ҳар бир хулосага манба кўрсат ([S1] каби).\n${COMMON}`,
    output_format: '## Жавоб\n## Фактлар (манба билан)\n## Хулосалар\n## Манбаларда топилмади / етишмаётган маълумот' },
  { key: 'content_editor', name: 'Content Editor', purpose: 'Видео, пост ва hook’ларни таҳрирлайди, кучайтиради (PDF, 7-бет).',
    system_prompt: `Сен контент муҳарририсан. Хом ғоя ёки матнни менинг услубимда контентга айлантир.\nАввал: асосий фикрни топ; hook'ни кучайтир; керакмас гапларни олиб ташла; ҳаётий мисол қўш; фойдани аниқ қил; охирида табиий CTA бер.\nУслуб: содда, қисқа гаплар, гаплашаётгандек, сунъий "AI тили" йўқ, ортиқча адабий эмас, ўзбек тилида табиий.\n${COMMON}`,
    output_format: 'Hook → Асосий фикр → Мисол → Хулоса → CTA' },
  { key: 'ad_creative', name: 'Ad Creative', purpose: 'Реклама ғоялари ва креатив вариантлар (PDF, 7-бет).',
    system_prompt: `Сен реклама креативи бўйича мутахассиссан. Hook, angle ва реклама матнлари вариантларини ишлаб чиқ.\nҲар бир вариантга қисқа "нега?" ёз. Нарх, чегирма, натижа каби фактларни фақат мен берган маълумотдан ол — ўйлаб топма.\n${COMMON}`,
    output_format: 'Жадвал: Angle | Hook | Матн | Нега?' },
  { key: 'researcher', name: 'Researcher', purpose: 'Бозор ва рақобатчиларни таҳлил қилади (PDF, 7-бет).',
    system_prompt: `Сен бозор ва рақобатчилар тадқиқотчисисан. Берилган маълумот ва манбаларга таян; интернетга кира олмайсан.\nМаълумот етишмаса, қайси маълумот кераклигини ва уни қаердан йиғиш мумкинлигини айт.\n${COMMON}`,
    output_format: '## Бозор манзараси\n## Рақобатчилар\n## Имкониятлар\n## Етишмаётган маълумотлар' },
  { key: 'script_doctor', name: 'Script Doctor', purpose: 'Видео сценарийларини кучайтиради, заиф жойни топади (PDF, 7-бет).',
    system_prompt: `Сен видео сценарий доктарисан. Сценарийни ўқиб, заиф жойларни (сует бошланиш, ноаниқ фойда, узун қисмлар, кучсиз CTA) топ ва тузатилган вариантни бер.\n${COMMON}`,
    output_format: '## Ташхис (заиф жойлар)\n## Тузатилган сценарий\n## Нега яхшироқ' },
  { key: 'tech_executor', name: 'Техник ижрочи', purpose: 'Файллар, шаблонлар, тартиблаш режаси ва скриптлар (PDF: Claude Code — қўл). Буйруқларни бажармайди — фақат режа ва код таклиф қилади.',
    system_prompt: `Сен техник ижрочисан. Биринчи вазифа доим фақат ўқиш режимида: аввал таҳлил, кейин ўзгартириш таклифи.\nҚоидалар: рухсатсиз файл ўчирма; муҳим файлни backup’сиз устидан ёзма; хавфли амаллардан олдин нима ўзгаришини тушунтир; кичик ва қайтариладиган ўзгаришларни афзал кўр; UTF-8 ва ўзбек ҳарфларини сақла.\nСен буйруқ ёки shell командасини ўзинг БАЖАРМАЙСАН — фақат режа, шаблон ёки кодни матн сифатида берасан; уни ишлатишни фойдаланувчи ҳал қилади.\nЯкунда: ўзгарадиган файллар, яратиладиган файллар, огоҳлантиришлар, кейинги қадам.\n${COMMON}`,
    output_format: '## Қисқа режа\n## Код / шаблон\n## Ўзгарадиган файллар\n## Огоҳлантиришлар\n## Кейинги қадам' },
];

// ===== Промптлар (PDF 5, 6, 8, 9, 10, 11-бетлар; матн PDF'дагидек) =====
export const PROMPTS = [
  { key: 'prompt.project_instructions', title: 'JARVIS — Project instructions (PDF, 5-бет)', body: `SEN MENING SHAXSIY AI OPERATSION YORDAMCHIMSAN.

Maqsading: fikrlarimni tartibga solish, ishni tezlashtirish,
qarorlarni yaxshilash va takroriy ishlarni tizimlashtirish.

Qoidalar:
1. Men bergan faktni fakt sifatida qabul qil, taxminni alohida belgila.
2. Ma'lumot yetishmasa, uydirma qilma.
3. Javobni amaliy qadamlar bilan ber.
4. Uslubimni saqla: sodda, tabiiy, ortiqcha adabiy emas.
5. Katta vazifani shu tartibda ko'rib chiq:
   MAQSAD → KONTEKST → VARIANTLAR → TAVSIYA → KEYINGI QADAM.
6. Noto'g'ri fikr aytsam, ma'qullama; sababini tushuntir va yaxshiroq variant ber.
7. Takroriy vazifalar uchun SOP yoki prompt yaratishni taklif qil.
8. Muhim qarorlarni "Decision" yozuviga aylantirish uchun tayyor format ber.` },
  { key: 'prompt.interview', title: 'Interview prompt — o‘zingizni skanerlash (PDF, 6-бет)', body: `Meni ish uslubimni o'rganish uchun intervyu qil.
Bir vaqtning o'zida faqat bitta savol ber. Men javob berganimdan
keyin keyingi savolga o't.

20-30 ta savoldan so'ng mening ish profilimni tuz:
1) men kimman            6) kuchli tomonlar
2) nima bilan shug'ullanaman   7) zaif joylar
3) asosiy loyihalar      8) takroriy ishlar
4) auditoriya            9) avtomatlashtirish mumkin bo'lgan ishlar
5) kontent uslubi        10) mening "Jarvis operating manual"im` },
  { key: 'prompt.research', title: 'Research prompt — manbaga tayangan tahlil (PDF, 6-бет)', body: `Siz ushbu notebookdagi manbalarga tayangan tadqiqotchisiz.
Faqat manbalarda bor ma'lumotga tayaning. Fakt va xulosani ajrating.
Topilmasa "manbalarda topilmadi" deb yozing. Har bir xulosaga manba ko'rsating.

Tahlil qil:
1. Asosiy auditoriya kim?          5. Raqobatchilar nimani va'da qilmoqda?
2. Ularning asosiy muammolari?     6. Bizning farqlanish nuqtalarimiz?
3. Eng ko'p uchraydigan e'tirozlar? 7. 10 ta marketing imkoniyati?
4. Biznesning kuchli tomonlari?    8. Qaysi ma'lumotlar yetishmayapti?` },
  { key: 'prompt.content', title: 'Kontent prompti (PDF, 10-бет)', body: `Men senga xom g'oya yoki ma'lumot beraman.
Uni mening uslubimda kontentga aylantir.

Avval:
- asosiy fikrni top;
- hookni kuchaytir;
- keraksiz gaplarni olib tashla;
- hayotiy misol qo'sh;
- foydani aniq qil;
- oxirida tabiiy CTA ber.

Uslub:
- sodda;            - qisqa gaplar;
- gaplashayotgandek; - sun'iy "AI tili" yo'q;
- ortiqcha adabiy emas; - o'zbek tilida tabiiy.

Natija: Hook → Asosiy fikr → Misol → Xulosa → CTA.` },
  { key: 'prompt.marketing', title: 'Marketing prompti (PDF, 11-бет)', body: `Mana shu biznesni marketingchi sifatida tahlil qil.

 1. Ideal mijoz.                 7. 10 ta offer.
 2. Mijozning muammosi.          8. 10 ta hook.
 3. Xarid qilishga sabab.        9. 5 ta reklama angle.
 4. Xarid qilishdan qo'rqishi.  10. 5 ta lead magnet.
 5. Asosiy taklif.              11. 3 ta landing page g'oyasi.
 6. Raqobatchilardan farq.      12. 3 ta test reklama varianti.

Har bir tavsiyada "nega?"ni qisqa tushuntir. Fakt va taxminni ajrat.` },
  { key: 'prompt.safe_audit', title: 'Xavfsiz audit prompti (PDF, 8-бет)', body: `Hozircha HECH NARSANI O'ZGARTIRMA. Faqat ushbu papkani tahlil qil.

1. Papkalar tuzilmasini chiqar.
2. Fayl turlarini sanab ber.
3. Takroriy fayllarni top.
4. Tartibsiz nomlangan fayllarni top.
5. Qaysi ishlarni avtomatlashtirish mumkinligini ayt.
6. Oxirida taklif qilinadigan workflowlarni yoz —
   "mening ruxsatimsiz hech qanday faylni o'zgartirma" qoidasi bilan.` },
  { key: 'prompt.brief', title: 'JARVIS BRIEF shabloni (PDF, 9-бет)', body: `MAQSAD:
KONTEKST:
MANBALAR:
CHEKLOVLAR:
NATIJA FORMATI:
MUDDAT / PRIORITET:

Vazifa: avval ma'lumot yetarliligini tekshir. Yetarli bo'lsa bajar.
Yetarli bo'lmasa faqat eng muhim savollarni ber.` },
];

// ===== SOP'лар (PDF 9–13-бетлар жараёнлари асосида) =====
export const SOPS = [
  { key: 'sop.new_project', title: 'SOP: Янги лойиҳани JARVIS’га киритиш', body: `**Мақсад:** янги лойиҳа учун контекстни бир марта йиғиш, кейин ҳар сафар қайта тушунтирмаслик.

1. «Лойиҳалар» → «Янги лойиҳа». Мақсад, аудитория, таклиф, KPI’ни **фақат тасдиқланган маълумот** билан тўлдиринг. Билмаганингизни бўш қолдиринг.
2. «Манбалар» бўлимида лойиҳани танлаб, материалларни юкланг: сайт (URL), нархлар, Instagram постлари, мижоз ёзишмалари, рақобатчи материаллари (PDF/TXT/MD).
3. Ҳар бир ҳужжат ҳолатини текширинг: «Ўқилмади» бўлса (скан PDF) — матнли нусхасини топинг.
4. «Иш жараёнлари» → «Бизнес таҳлили»ни ишга туширинг. Натижа 03_PROJECTS’га сақланади.
5. Натижадаги **тахмин**ларни кўриб чиқинг: тўғрисини «Тасдиқланган факт» сифатида Хотирага ўтказинг.
6. Кейинги қадамларни «Вазифалар»га қўшинг.
7. Ҳафта охирида Markdown экспорт қилиб, Obsidian vault’га сақланг.` },
  { key: 'sop.content', title: 'SOP: Хом ғоядан тайёр контентгача', body: `**Мақсад:** ғояни бир хил сифатда, тез контентга айлантириш.

1. Ғояни дарҳол «00_INBOX»га ёзиб қўйинг (Хотира → Янги ёзув).
2. «Иш жараёнлари» → «Контент»: лойиҳани танланг, хом ғояни қўйинг.
3. JARVIS: Hook → Асосий фикр → Мисол → Хулоса → CTA тузилмасини беради.
4. Керак бўлса суҳбатда «Script Doctor» ёки «Content Editor» роли билан кучайтиринг.
5. Тайёр сценарийни «Контент» сифатида сақланг (04_CONTENT).
6. Нашр қилишни **ўзингиз** бажарасиз — JARVIS ташқи платформага автоматик юбормайди.
7. Яхши ишлаган hook ва тузилмани «Промпт» сифатида 07_PROMPTS’га сақланг.` },
  { key: 'sop.weekly_audit', title: 'SOP: Ҳафталик AI аудит', body: `**Мақсад:** нима автоматлашди, нима қўлда қолди — ҳар ҳафта кўриш (PDF, 12-бет: 95–100).

1. «Вазифалар» → «Автоматлаштириш»да ҳафталик аудит ёқилганини текширинг (Тошкент вақти).
2. Аудит ҳисоботи 06_KNOWLEDGE’га автоматик сақланади: бажарилганлар, автоматлаштирилганлар, қўлда қолганлар, хатолар, кейинги устувор ишлар.
3. «Ўтказиб юборилган» ишга туширишлар бўлса — сервер ўчиқ бўлган. Уларни қўлда текширинг.
4. Хатолик бўлган жараёнларни қайта ишга туширинг (оралиқ натижалар сақланган).
5. 2 марта такрорланган ишни SOP’га айлантиринг.
6. Хулосаларни «Қарорлар» бўлимига қарор лойиҳаси сифатида ёзинг ва ўзингиз тасдиқланг.` },
];

export const INTERVIEW = [
  { key: 'who', q: 'Сиз кимсиз ва асосан нима иш қиласиз?', section: 'Мен кимман' },
  { key: 'business', q: 'Қайси бизнеслар ва лойиҳалар билан ишлайсиз? Ҳар бирини бир-икки гапда тасвирланг.', section: 'Бизнесларим ва лойиҳаларим' },
  { key: 'role', q: 'Бу лойиҳаларда сизнинг ролингиз нима (эгаси, маркетолог, менежер…)?', section: 'Бизнесларим ва лойиҳаларим' },
  { key: 'audience', q: 'Аудиториянгиз ким? Мижозларингизни тасвирланг.', section: 'Аудиториям' },
  { key: 'audience_pain', q: 'Мижозларингизнинг энг кўп учрайдиган муаммо ва саволлари қандай?', section: 'Аудиториям' },
  { key: 'goals', q: 'Яқин 3–6 ойдаги асосий мақсадларингиз нима?', section: 'Мақсадларим' },
  { key: 'goals_year', q: 'Бир йиллик катта мақсадингиз нима?', section: 'Мақсадларим' },
  { key: 'style', q: 'Қандай услубда ёзасиз ва гапирасиз? (масалан: содда, ҳазил билан, расмий)', section: 'Ёзиш услубим' },
  { key: 'style_like', q: 'Қандай ёзишни ёқтирасиз? Ёқадиган мисол ёки муаллифларни айтинг.', section: 'Ёзиш услубим' },
  { key: 'style_dislike', q: 'Нимани ёқтирмайсиз? Қайси ибора, оҳанг ёки услублардан қочиш керак?', section: 'Ёқтирмайдиган услублар' },
  { key: 'language', q: 'Контентни қайси тилда ва ёзувда (лотин/кирилл) тайёрлаш керак?', section: 'Ёзиш услубим' },
  { key: 'workflow', q: 'Одатий иш кунингиз ва иш жараёнингиз қандай ўтади?', section: 'Иш жараёним' },
  { key: 'repeat', q: 'Қайси вазифаларни ҳафтада бир неча марта такрорлайсиз?', section: 'Такрорий вазифаларим' },
  { key: 'time_waste', q: 'Энг кўп вақтингизни нима олади?', section: 'Такрорий вазифаларим' },
  { key: 'platforms', q: 'Қайси платформа ва воситалардан фойдаланасиз? (Instagram, Telegram, CRM, Excel…)', section: 'Платформаларим' },
  { key: 'strengths', q: 'Кучли томонларингиз нимада деб ўйлайсиз?', section: 'Кучли томонлар' },
  { key: 'weak', q: 'Қаерда қийналасиз ёки кўпинча ишлар тўхтаб қолади?', section: 'Заиф жойлар' },
  { key: 'automate', q: 'Нималарни автоматлаштиришни истардингиз?', section: 'Автоматлаштириш мумкин бўлган ишлар' },
  { key: 'decisions', q: 'Қарорларни қандай қабул қиласиз? Нимага кўпроқ таянасиз (рақам, интуиция, маслаҳат)?', section: 'Иш жараёним' },
  { key: 'jarvis_rules', q: 'JARVIS сиз билан қандай ишлашини истайсиз? Қандай қоидаларга амал қилсин?', section: 'Jarvis учун қоидалар' },
  { key: 'jarvis_never', q: 'JARVIS ҳеч қачон нима қилмаслиги керак?', section: 'Jarvis учун қоидалар' },
  { key: 'format', q: 'Жавоблар қандай форматда бўлса қулай? (қисқа рўйхат, жадвал, батафсил матн)', section: 'Jarvis учун қоидалар' },
];

export function seed() {
  const db = getDb();
  const t = now();
  db.transaction(() => {
    const insRole = db.prepare('INSERT OR IGNORE INTO roles(key, name, purpose, system_prompt, output_format, builtin, updated_at) VALUES (?,?,?,?,?,1,?)');
    for (const r of ROLES) insRole.run(r.key, r.name, r.purpose, r.system_prompt, r.output_format, t);
    const insNote = db.prepare(`INSERT OR IGNORE INTO notes(folder, title, body, kind, source, system_key, created_at, updated_at) VALUES (?,?,?, 'note', ?, ?, ?, ?)`);
    for (const p of PROMPTS) insNote.run('07_PROMPTS', p.title, p.body, 'PDF: JARVIS AI TIZIMI', p.key, t, t);
    for (const s of SOPS) insNote.run('08_SOP', s.title, s.body, 'JARVIS бошланғич SOP', s.key, t, t);
    const projCount = (db.prepare('SELECT COUNT(*) n FROM projects').get() as any).n;
    if (projCount === 0) {
      const ins = db.prepare('INSERT INTO projects(name, created_at, updated_at) VALUES (?,?,?)');
      ins.run('INNA FLOWERS', t, t);
      ins.run('GULZOR CRM', t, t);
    }
    if (!db.prepare("SELECT 1 FROM recurring WHERE kind='audit'").get()) {
      db.prepare(`INSERT INTO recurring(kind, title, freq, weekday, time, enabled, created_at) VALUES ('audit', 'Ҳафталик AI аудит', 'weekly', 0, '18:00', 1, ?)`).run(t);
    }
  })();
}
