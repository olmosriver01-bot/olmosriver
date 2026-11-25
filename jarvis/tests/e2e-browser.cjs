const { chromium, devices } = require('playwright');
// Фойдаланиш: JARVIS_ENABLE_MOCK=1 билан бўш базада серверни ишга туширинг, кейин: node tests/e2e-browser.cjs <скриншот-папка> [http://127.0.0.1:3333]
const SP = process.argv[2] || '.'; const base = process.argv[3] || 'http://127.0.0.1:3410';
require('node:fs').mkdirSync(SP + '/shots', { recursive: true });
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('pageerror', (e) => errors.push('PAGEERR ' + e.message));
  await p.goto(base);
  await p.fill('input[type=password] >> nth=0', 'parol12345');
  await p.fill('input[type=password] >> nth=1', 'parol12345');
  await p.click('button:has-text("Паролни сақлаш")');
  await p.waitForSelector('text=Салом! JARVIS тайёр.');
  await p.screenshot({ path: SP + '/shots/1-home.png' });
  // лойиҳа очиш + ҳужжат юклаш
  await p.click('.nav:has-text("Лойиҳалар")');
  await p.click('text=INNA FLOWERS');
  await p.waitForSelector('text=Лойиҳа картаси');
  await p.fill('textarea >> nth=0', 'Синов мақсади — кирилл ва lotin o‘g‘il');
  await p.click('button:has-text("Сақлаш")');
  await p.waitForSelector('text=Сақланган');
  await p.setInputFiles('.drop input[type=file]', require('node:path').join(__dirname, 'fixtures', 'text.pdf'));
  await p.waitForSelector('text=ўқилди', { timeout: 15000 });
  await p.screenshot({ path: SP + '/shots/2-project.png', fullPage: true });
  // чат
  await p.click('.nav:has-text("JARVIS билан суҳбат")');
  await p.click('button:has-text("+ Янги суҳбат")');
  await p.waitForSelector('.chat-cfg select');
  await p.selectOption('.chat-cfg select >> nth=0', { label: 'INNA FLOWERS' });
  await p.waitForTimeout(400);
  await p.fill('.composer textarea', 'Гулдаста нархи қанча?');
  await p.keyboard.press('Enter');
  await p.waitForSelector('text=MOCK ЖАВОБ', { timeout: 15000 });
  await p.screenshot({ path: SP + '/shots/3-chat.png' });
  await p.click('button:has-text("Сақлаш") >> nth=0');
  await p.click('.modal button:has-text("Сақлаш")');
  await p.waitForSelector('text=Сақланди');
  // хотира
  await p.click('.nav:has-text("Хотира ва билимлар")');
  await p.waitForSelector('.item');
  await p.screenshot({ path: SP + '/shots/4-memory.png' });
  await p.click('button.tab:has-text("Менинг иш профилим")');
  await p.fill('textarea', 'Мен гул бизнеси эгасиман');
  await p.click('button:has-text("Кейингиси")');
  await p.waitForTimeout(300);
  await p.click('button:has-text("Профил ва Operating manual")');
  await p.waitForSelector('h2:has-text("Jarvis operating manual")');
  await p.screenshot({ path: SP + '/shots/5-profile.png' });
  // жараён
  await p.click('.nav:has-text("Контент ва маркетинг")');
  await p.click('h2:has-text("Контент")');
  await p.fill('textarea', 'Гулни узоқ сақлаш');
  await p.click('button:has-text("Бошлаш")');
  await p.click('button:has-text("Розиман")');
  await p.click('button:has-text("Ишга тушириш")');
  await p.waitForSelector('text=Сақланган натижа', { timeout: 20000 });
  await p.screenshot({ path: SP + '/shots/6-workflow.png', fullPage: true });
  for (const [nav, name] of [['Вазифалар', '7-tasks'], ['Промптлар', '8-prompts'], ['SOP', '9-sop'], ['Қарорлар', '10-decisions'], ['AI роллар', '11-roles'], ['Созламалар', '12-settings'], ['Манбалар', '13-sources']]) {
    await p.click(`.nav:has-text("${nav}")`); await p.waitForTimeout(500); await p.screenshot({ path: `${SP}/shots/${name}.png` });
  }
  // лотин режими
  await p.click('button:has-text("Lotin") >> nth=0'); await p.waitForTimeout(300);
  await p.screenshot({ path: SP + '/shots/14-latin.png' });
  await p.click('button:has-text("Кирилл") >> nth=0');
  // iPhone
  const m = await b.newContext({ ...devices['iPhone 14'] });
  await m.addCookies((await ctx.cookies()).map((c) => ({ ...c })));
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('M PAGEERR ' + e.message));
  await mp.goto(base); await mp.waitForSelector('text=Салом! JARVIS тайёр.');
  await mp.screenshot({ path: SP + '/shots/m1-home.png' });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await mp.click('.topbar button >> nth=0'); await mp.waitForTimeout(300);
  await mp.screenshot({ path: SP + '/shots/m2-menu.png' });
  await mp.click('.nav:has-text("JARVIS билан суҳбат")'); await mp.waitForTimeout(500);
  await mp.screenshot({ path: SP + '/shots/m3-chat.png' });
  await mp.goto(base + '/#/projects/1'); await mp.waitForTimeout(800);
  const overflow2 = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || document.querySelector('.main').scrollWidth > window.innerWidth);
  await mp.screenshot({ path: SP + '/shots/m4-project.png' });
  await mp.goto(base + '/#/settings'); await mp.waitForTimeout(800);
  await mp.screenshot({ path: SP + '/shots/m5-settings.png' });
  console.log(JSON.stringify({ errors, overflow, overflow2 }));
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
