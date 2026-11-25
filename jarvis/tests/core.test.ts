// Асосий жараён: лойиҳа → ҳужжат → манба билан AI таҳлили (MOCK) → хотирага сақлаш → Markdown экспорт/импорт.
import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { startApp, fileForm, fixture } from './helpers.ts';

const app = await startApp({ mock: true });
test.after(() => app.close());
const { call } = app;

test('кириш ҳимояланган: паролсиз API ёпиқ, CSRF сарлавҳасиз рад этилади', async () => {
  assert.equal((await call('GET', '/projects')).status, 401);
  await app.login();
  assert.equal((await call('GET', '/projects')).status, 200);
  const res = await fetch((await call('GET', '/auth/status', undefined, true)).url.replace('/auth/status', '/projects'), { method: 'POST', headers: { cookie: app.getCookie(), 'content-type': 'application/json' }, body: '{"name":"x"}' });
  assert.equal(res.status, 403);
});

test('бошланғич лойиҳалар, роллар, промптлар ва SOP мавжуд', async () => {
  const p = (await call('GET', '/projects')).data.map((x: any) => x.name);
  assert.deepEqual(p.sort(), ['GULZOR CRM', 'INNA FLOWERS']);
  const roles = (await call('GET', '/roles')).data;
  assert.equal(roles.length, 7);
  assert.ok((await call('GET', '/notes?folder=07_PROMPTS')).data.length >= 5);
  assert.ok((await call('GET', '/notes?folder=08_SOP')).data.length >= 3);
  // INNA FLOWERS ҳақида ҳеч қандай факт ўйлаб топилмаган
  const inna = (await call('GET', '/projects')).data.find((x: any) => x.name === 'INNA FLOWERS');
  assert.equal(inna.goal + inna.audience + inna.offer + inna.kpi, '');
});

let projectId = 0, otherId = 0;
test('лойиҳа кирилл ва лотин матн билан яратилади ва сақланади', async () => {
  const r = await call('POST', '/projects', { name: 'Тест лойиҳа ўқув', goal: 'Мижозлар сонини ошириш — o‘sish', audience: 'Ёшлар; G‘ulomov ko‘chasi' });
  assert.equal(r.status, 200);
  projectId = r.data.id;
  const g = await call('GET', `/projects/${projectId}`);
  assert.equal(g.data.goal, 'Мижозлар сонини ошириш — o‘sish');
  assert.equal(g.data.audience, 'Ёшлар; G‘ulomov ko‘chasi');
  otherId = (await call('POST', '/projects', { name: 'Бошқа лойиҳа' })).data.id;
});

let docId = 0;
async function waitDoc(id: number) {
  for (let i = 0; i < 120; i++) { const d = (await call('GET', `/documents/${id}`)).data; if (d.status !== 'processing') return d; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('OCR timeout');
}
test('PDF ўқилади, бетлар тўғри, скан PDF «ўқилмади» деб белгиланади, TXT/MD ишлайди', async () => {
  const up = await call('POST', '/documents/upload', fileForm({ project_id: String(projectId) }, [{ name: 'ҳисобот.pdf', content: fixture('text.pdf') }]));
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const d = up.data[0];
  assert.equal(d.name, 'ҳисобот.pdf');
  assert.equal(d.status, 'ready'); assert.equal(d.pages, 3);
  docId = d.id;
  // Скан PDF: фонда маҳаллий OCR (интернетсиз) билан ўқилади ва «OCR» деб белгиланади
  const scan0 = (await call('POST', '/documents/upload', fileForm({ project_id: String(projectId) }, [{ name: 'scan.pdf', content: fixture('scan.pdf') }]))).data[0];
  assert.equal(scan0.status, 'processing');
  const scan = await waitDoc(scan0.id);
  assert.equal(scan.status, 'ready', JSON.stringify(scan)); assert.equal(scan.ocr_pages, 1); assert.match(scan.warning, /OCR/);
  assert.ok(scan.chunks.some((c: any) => /Скан/.test(c.text) && c.page === 1), JSON.stringify(scan.chunks));
  // Бўш скан: OCR ҳам матн топмайди → «ўқилмади», ўқилгандек кўрсатилмайди
  const blank = await waitDoc((await call('POST', '/documents/upload', fileForm({ project_id: String(projectId) }, [{ name: 'blank.pdf', content: fixture('blank.pdf') }]))).data[0].id);
  assert.equal(blank.status, 'unreadable'); assert.match(blank.error, /ўқилмади/);
  const md = (await call('POST', '/documents/upload', fileForm({ project_id: String(otherId) }, [{ name: 'eslatma.md', content: '# Boshqa\nBoshqa loyiha narxi 999 000 so‘m. Мижозлар аудитория.' }]))).data[0];
  assert.equal(md.status, 'ready');
  const bad = await call('POST', '/documents/upload', fileForm({}, [{ name: 'x.exe', content: 'x' }]));
  assert.equal(bad.status, 400);
});

test('қидирув бет рақамини беради, кирилл↔лотин ишлайди ва лойиҳалар аралашмайди', async () => {
  const r = (await call('GET', `/search?q=${encodeURIComponent('гулдаста нархи')}&project=${projectId}`)).data;
  assert.ok(r.length > 0);
  assert.equal(r[0].page, 3);
  assert.equal(r[0].docName, 'ҳисобот.pdf');
  const lat = (await call('GET', `/search?q=${encodeURIComponent('auditoriya mijozlar')}&project=${projectId}`)).data;
  assert.ok(lat.some((h: any) => h.page === 2), 'лотин сўров кирилл матнни топиши керак');
  assert.ok(lat.every((h: any) => h.docName !== 'eslatma.md'));
  const other = (await call('GET', `/search?q=${encodeURIComponent('narxi')}&project=${otherId}`)).data;
  assert.ok(other.length > 0 && other.every((h: any) => h.docName === 'eslatma.md'));
});

let convId = 0;
test('чат: манба билан жавоб, иқтибос (ҳужжат+бет), MOCK деб белгиланади', async () => {
  const roles = (await call('GET', '/roles')).data;
  const researcher = roles.find((r: any) => r.key === 'source_researcher');
  const c = await call('POST', '/conversations', { project_id: projectId, role_id: researcher.id, source_mode: 'strict' });
  convId = c.data.id;
  const pv = (await call('POST', `/conversations/${convId}/preview`, { text: 'Гулдаста нархи қанча?' })).data;
  assert.equal(pv.summary.includesProject, true);
  assert.ok(pv.summary.sourceChunks > 0);
  assert.match(pv.system, /<manba id="S1"/);
  assert.match(pv.system, /БАЖАРМА/); // ҳужжат ичидаги буйруқлар бажарилмаслиги ҳақида
  const r = await call('POST', `/conversations/${convId}/messages`, { text: 'Гулдаста нархи қанча?' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const msg = r.data.conversation.messages.at(-1);
  assert.equal(msg.meta.mock, true);
  assert.match(msg.content, /MOCK/);
  assert.ok(msg.citations.some((c: any) => c.page === 3 && c.docName === 'ҳисобот.pdf'));
});

test('қатъий режимда манбада йўқ савол — «Манбаларда топилмади», AI чақирилмайди', async () => {
  const before = (await call('GET', '/usage')).data.length;
  const r = await call('POST', `/conversations/${convId}/messages`, { text: 'Квант физикаси ва криптовалюта биржаси' });
  const msg = r.data.conversation.messages.at(-1);
  assert.match(msg.content, /Манбаларда топилмади/);
  assert.equal((await call('GET', '/usage')).data.length, before);
});

test('суҳбат ва натижа қайта кирилганда сақланади; натижа тўғри бўлимга сақланади', async () => {
  const conv = (await call('GET', `/conversations/${convId}`)).data;
  assert.ok(conv.messages.length >= 4);
  const ai = conv.messages.find((m: any) => m.role === 'assistant' && m.meta.mock);
  const map: Record<string, string> = { knowledge: '06_KNOWLEDGE', prompt: '07_PROMPTS', content: '04_CONTENT', decision: '09_DECISIONS', sop: '08_SOP' };
  for (const [as, folder] of Object.entries(map)) {
    const s = await call('POST', `/messages/${ai.id}/save`, { as, title: `Тест ${as}` });
    assert.equal(s.data.note.folder, folder);
    assert.equal(s.data.note.project_id, projectId);
    if (as === 'decision') { assert.equal(s.data.note.kind, 'decision'); assert.equal(s.data.note.decision_status, 'draft'); }
    if (as === 'knowledge') assert.equal(s.data.note.kind, 'assumption'); // AI натижаси факт эмас
    assert.match(s.data.note.source, /Суҳбат/);
  }
  const t = await call('POST', `/messages/${ai.id}/save`, { as: 'task', title: 'Тест вазифа' });
  assert.equal(t.data.task.project_id, projectId);
});

test('хотира: факт/тахмин/таклиф/қарор ажратилади, таҳрир версия сақлайди, архив ва сават ишлайди', async () => {
  const f = (await call('POST', '/notes', { folder: '02_BUSINESS', title: 'Иш вақти', body: '09:00–18:00', kind: 'fact', project_id: projectId, source: 'Ўзим' })).data;
  assert.equal(f.kind, 'fact');
  const upd = (await call('PUT', `/notes/${f.id}`, { body: '08:00–20:00' })).data;
  assert.equal(upd.body, '08:00–20:00');
  const full = (await call('GET', `/notes/${f.id}`)).data;
  assert.equal(full.versions.length, 1); assert.equal(full.versions[0].body, '09:00–18:00');
  await call('PUT', `/notes/${f.id}`, { status: 'archived' });
  assert.equal((await call('GET', `/notes?status=archived`)).data.some((n: any) => n.id === f.id), true);
  await call('DELETE', `/notes/${f.id}`);
  assert.equal((await call('GET', '/notes')).data.some((n: any) => n.id === f.id), false);
  assert.equal((await call('GET', '/trash')).data.notes.some((n: any) => n.id === f.id), true);
  await call('POST', `/notes/${f.id}/restore`);
  assert.equal((await call('GET', `/notes/${f.id}`)).data.deleted_at, null);
  const restored = (await call('POST', `/notes/${f.id}/versions/${full.versions[0].id}/restore`)).data;
  assert.equal(restored.body, '09:00–18:00');
  // Қарор: draft → фақат фойдаланувчи қабул қилади
  const d = (await call('POST', '/notes', { folder: '09_DECISIONS', title: 'Нархни ошириш', kind: 'decision' })).data;
  assert.equal(d.decision_status, 'draft');
  const acc = (await call('POST', `/notes/${d.id}/decision`, { status: 'accepted' })).data;
  assert.equal(acc.decision_status, 'accepted');
  // бутунлай ўчириш тасдиқ сўрайди
  await call('DELETE', `/notes/${d.id}`);
  assert.equal((await call('DELETE', `/notes/${d.id}/purge`, {})).status, 400);
  assert.equal((await call('DELETE', `/notes/${d.id}/purge`, { confirm: 'ЎЧИРИШ' })).status, 200);
});

test('бизнес таҳлили жараёни: қадамлар сақланади, хатодан кейин давом эттирилади, ҳисобот 03_PROJECTS’га', async () => {
  // манбасиз лойиҳада 1-қадам хато беради
  const empty = (await call('POST', '/projects', { name: 'Бўш лойиҳа' })).data;
  const bad = (await call('POST', `/workflows/${(await call('POST', '/workflows', { type: 'business', project_id: empty.id })).data.id}/run`)).data;
  assert.equal(bad.status, 'error'); assert.equal(bad.steps[0].status, 'error');
  // хатодан кейин манба қўшиб, давом эттирамиз
  await call('POST', '/documents/upload', fileForm({ project_id: String(empty.id) }, [{ name: 'a.txt', content: 'Аудитория: талабалар. Муаммо: вақт йўқ. Эътироз: қиммат.' }]));
  const ok = (await call('POST', `/workflows/${bad.id}/run`)).data;
  assert.equal(ok.status, 'done', JSON.stringify(ok.steps.map((s: any) => s.status + ':' + (s.error ?? ''))));
  const note = (await call('GET', `/notes/${ok.result_note_id}`)).data;
  assert.equal(note.folder, '03_PROJECTS'); assert.equal(note.project_id, empty.id); assert.equal(note.kind, 'assumption');
  assert.match(note.body, /MOCK/); assert.match(note.body, /## Манбалар/);
});

test('JARVIS BRIEF ва контент жараёнлари', async () => {
  const b = (await call('POST', '/workflows', { type: 'brief', brief: { goal: 'Ҳафталик режа', format: 'Рўйхат' } })).data;
  const done = (await call('POST', `/workflows/${b.id}/run`)).data;
  assert.equal(done.status, 'done');
  const c = (await call('POST', '/workflows', { type: 'content', input: 'Гулларни узоқ сақлаш сирлари' })).data;
  const cd = (await call('POST', `/workflows/${c.id}/run`)).data;
  assert.equal((await call('GET', `/notes/${cd.result_note_id}`)).data.folder, '04_CONTENT');
});

test('Markdown экспорт ва импорт (кирилл сақланади, ўзгаришдан олдин версия)', async () => {
  const res = await call('GET', '/export/markdown', undefined, true);
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
  const names = zip.getEntries().map((e) => e.entryName);
  for (const f of ['00_INBOX', '03_PROJECTS', '09_DECISIONS', '10_ARCHIVE']) assert.ok(names.includes(`JARVIS/${f}/`), f);
  const projFile = zip.getEntries().find((e) => e.entryName.includes('PROJECT — Тест лойиҳа ўқув'))!;
  const projMd = projFile.getData().toString('utf8');
  for (const s of ['## Мақсад', '## Аудитория', '## Таклиф (offer)', '## KPI', '## Материаллар ва манбалар', '## Қарорлар', '## Кейинги қадамлар']) assert.ok(projMd.includes(s), s);
  assert.ok(projMd.includes('o‘sish'));
  const noteEntry = zip.getEntries().find((e) => e.entryName.includes('/Иш вақти'))!;
  const text = noteEntry.getData().toString('utf8');
  assert.match(text, /jarvis_id: \d+/);
  // импорт: битта ўзгартирилган файл + битта янги файл
  const changed = text.replace('09:00–18:00', 'Якшанба дам — ўзгартирилди');
  const fd = new FormData();
  fd.append('files', new Blob([changed]), 'Иш вақти.md');
  fd.append('files', new Blob(['---\ntitle: Янги ғоя\nfolder: 00_INBOX\n---\nОбсидиандан келган ғоя ўқ қ ғ ҳ']), 'yangi.md');
  const imp = (await call('POST', '/import/markdown', fd)).data;
  assert.equal(imp.updated, 1); assert.equal(imp.created, 1); assert.ok(imp.backup);
  const id = Number(text.match(/jarvis_id: (\d+)/)![1]);
  const n = (await call('GET', `/notes/${id}`)).data;
  assert.match(n.body, /Якшанба дам/);
  assert.ok(n.versions.some((v: any) => v.reason === 'Markdown импорт'));
  const inbox = (await call('GET', '/notes?folder=00_INBOX')).data;
  assert.ok(inbox.some((x: any) => x.title === 'Янги ғоя' && x.body.includes('ўқ қ ғ ҳ')));
});
