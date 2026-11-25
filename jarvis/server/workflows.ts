import { getDb, now, HttpError, log, FOLDERS } from './db.ts';
import { complete } from './ai.ts';
import { leadChunks, search, type Hit } from './docs.ts';
import { personalContext, createNote } from './memory.ts';
import { projectCard, getProject } from './projects.ts';
import { BASE_RULES, SOURCE_RULES, formatSources, citationsFrom } from './chat.ts';
import { ROLES } from './seed.ts';

type Step = { key: string; name: string; status: 'pending' | 'running' | 'done' | 'error' | 'needs_input'; output?: string; error?: string; at?: string; ai?: boolean; meta?: any };
type Def = { name: string; folder: string; needsProject: boolean; needsInput: boolean; steps: { key: string; name: string; ai: boolean; role?: string; ask?: string }[] };

export const BRIEF_FIELDS = [['goal', 'Мақсад'], ['context', 'Контекст'], ['sources', 'Манбалар'], ['constraints', 'Чекловлар'], ['format', 'Натижа формати'], ['deadline', 'Муддат / устуворлик']] as const;

export const WORKFLOWS: Record<string, Def> = {
  business: {
    name: 'Бизнес таҳлили', folder: '03_PROJECTS', needsProject: true, needsInput: false,
    steps: [
      { key: 'sources', name: 'Манбаларни йиғиш', ai: false },
      { key: 'audience', name: 'Аудитория', ai: true, role: 'source_researcher', ask: 'Асосий аудитория ким? Сегментлар, уларнинг хусусиятлари ва эҳтиёжлари.' },
      { key: 'problems', name: 'Муаммолар', ai: true, role: 'source_researcher', ask: 'Мижозларнинг асосий муаммолари ва оғриқли нуқталари қандай?' },
      { key: 'objections', name: 'Эътирозлар', ai: true, role: 'source_researcher', ask: 'Энг кўп учрайдиган эътирозлар ва харид қилишдан тўхтатадиган хавотирлар қандай?' },
      { key: 'difference', name: 'Фарқланиш', ai: true, role: 'source_researcher', ask: 'Бизнеснинг кучли томонлари, рақобатчилар нимани ваъда қилмоқда ва бизнинг фарқланиш нуқталаримиз қандай?' },
      { key: 'opportunities', name: 'Маркетинг имкониятлари', ai: true, role: 'strategist', ask: 'Юқоридаги таҳлил асосида 10 та маркетинг имконияти ва қайси маълумотлар етишмаётганини ёз. Ҳар бирига қисқа "нега?".' },
      { key: 'report', name: 'Ҳисоботни сақлаш', ai: false },
    ],
  },
  content: {
    name: 'Контент', folder: '04_CONTENT', needsProject: false, needsInput: true,
    steps: [
      { key: 'core', name: 'Асосий фикр ва Hook', ai: true, role: 'content_editor', ask: 'Хом ғоядан асосий фикрни топ ва 3 та кучли hook варианти ёз. Энг яхшисини белгила ва нега эканини айт.' },
      { key: 'draft', name: 'Hook → Асосий фикр → Мисол → Хулоса → CTA', ai: true, role: 'content_editor', ask: 'Энг яхши hook билан тўлиқ контентни тайёрла. Формат қатъий: Hook → Асосий фикр → Мисол → Хулоса → CTA. Керакмас гапларни олиб ташла, ҳаётий мисол қўш, фойдани аниқ қил, табиий CTA бер. Мисол ўйлаб топилган бўлса, "(намуна мисол)" деб белгила.' },
      { key: 'report', name: 'Контентни сақлаш', ai: false },
    ],
  },
  marketing: {
    name: 'Маркетинг', folder: '05_MARKETING', needsProject: true, needsInput: false,
    steps: [
      { key: 'sources', name: 'Манбаларни йиғиш', ai: false },
      { key: 'customer', name: 'Идеал мижоз ва асосий таклиф', ai: true, role: 'strategist', ask: '1) Идеал мижоз. 2) Мижознинг муаммоси. 3) Харид қилишга сабаб. 4) Харид қилишдан хавотири. 5) Асосий таклиф. 6) Рақобатчилардан фарқ. Ҳар бир бандда "Факт (манба)" ва "Тахмин"ни ажрат, қисқа "нега?" ёз.' },
      { key: 'offers', name: '10 offer ва 10 hook', ai: true, role: 'ad_creative', ask: '7) 10 та offer. 8) 10 та hook. Ҳар бирига бир қаторда "нега?". Нарх ва чегирмаларни фақат манбадан ол; манбада бўлмаса, "[нархни киритинг]" деб қолдир.' },
      { key: 'ads', name: 'Angle, lead magnet, landing, тест реклама', ai: true, role: 'ad_creative', ask: '9) 5 та реклама angle. 10) 5 та lead magnet. 11) 3 та landing page ғояси. 12) 3 та тест реклама варианти (матни билан). Ҳар бирига қисқа "нега?". Факт ва тахминни ажрат.' },
      { key: 'report', name: 'Ҳисоботни сақлаш', ai: false },
    ],
  },
  brief: {
    name: 'JARVIS BRIEF', folder: '06_KNOWLEDGE', needsProject: false, needsInput: true,
    steps: [
      { key: 'check', name: 'Маълумот етарлилигини текшириш', ai: true, role: 'strategist', ask: 'Брифни ўқи. Вазифани бажариш учун маълумот етарлими? Агар етарли бўлса, биринчи қаторга фақат "ЕТАРЛИ" деб ёз. Етарли бўлмаса, биринчи қаторга "САВОЛЛАР" деб ёз ва кейин фақат энг муҳим 1–5 та саволни рақамлаб бер.' },
      { key: 'execute', name: 'Бажариш', ai: true, role: 'strategist', ask: 'Брифдаги вазифани бажар. Натижани брифда кўрсатилган форматда бер. Охирида "Кейинги қадам" бўлими бўлсин.' },
      { key: 'report', name: 'Натижани сақлаш', ai: false },
    ],
  },
};

const parseRun = (r: any) => r && ({ ...r, brief: JSON.parse(r.brief), steps: JSON.parse(r.steps) as Step[] });
export function getRun(id: number) {
  const r = getDb().prepare('SELECT w.*, p.name project_name FROM workflow_runs w LEFT JOIN projects p ON p.id = w.project_id WHERE w.id = ? AND w.deleted_at IS NULL').get(id);
  if (!r) throw new HttpError(404, 'Жараён топилмади.');
  return parseRun(r);
}
export function listRuns(limit = 50) {
  return (getDb().prepare('SELECT w.*, p.name project_name FROM workflow_runs w LEFT JOIN projects p ON p.id = w.project_id WHERE w.deleted_at IS NULL ORDER BY w.id DESC LIMIT ?').all(limit) as any[]).map(parseRun);
}
function saveRun(id: number, patch: { status?: string; steps?: Step[]; result_note_id?: number }) {
  const sets: string[] = []; const args: any[] = [];
  if (patch.status) { sets.push('status = ?'); args.push(patch.status); }
  if (patch.steps) { sets.push('steps = ?'); args.push(JSON.stringify(patch.steps)); }
  if (patch.result_note_id) { sets.push('result_note_id = ?'); args.push(patch.result_note_id); }
  getDb().prepare(`UPDATE workflow_runs SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...args, now(), id);
}

export function createRun(d: { type: string; project_id?: number | null; input?: string; brief?: Record<string, string>; folder?: string; title?: string }) {
  const def = WORKFLOWS[d.type];
  if (!def) throw new HttpError(400, 'Номаълум жараён.');
  const projectId = d.project_id ? Number(d.project_id) : null;
  if (def.needsProject && !projectId) throw new HttpError(400, 'Бу жараён учун лойиҳани танланг.');
  if (projectId) getProject(projectId);
  const input = String(d.input ?? '').normalize('NFC').trim();
  const brief: any = {};
  if (d.type === 'brief') {
    for (const [k] of BRIEF_FIELDS) brief[k] = String(d.brief?.[k] ?? '').normalize('NFC').trim();
    if (!brief.goal) throw new HttpError(400, 'Брифда камида «Мақсад»ни тўлдиринг.');
  } else if (def.needsInput && !input) throw new HttpError(400, 'Хом ғоя ёки матнни киритинг.');
  if (d.folder && FOLDERS.includes(d.folder as any)) brief.folder = d.folder;
  const steps: Step[] = def.steps.map((s) => ({ key: s.key, name: s.name, status: 'pending', ai: s.ai }));
  const title = (d.title || (d.type === 'brief' ? brief.goal : input) || def.name).slice(0, 80);
  const t = now();
  const r = getDb().prepare('INSERT INTO workflow_runs(type, title, project_id, brief, input, status, steps, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(d.type, `${def.name}: ${title}`, projectId, JSON.stringify(brief), input, 'pending', JSON.stringify(steps), t, t);
  log('workflow_created', 'workflow', Number(r.lastInsertRowid), d.type);
  return getRun(Number(r.lastInsertRowid));
}

function briefText(b: any) { return BRIEF_FIELDS.map(([k, l]) => `${l.toUpperCase()}: ${b[k] || '—'}`).join('\n'); }

function gatherSources(run: any, query: string): Hit[] {
  if (!run.project_id) return [];
  const found = search(query, run.project_id, undefined, 10);
  const seen = new Set(found.map((h) => h.chunkId));
  const lead = leadChunks(run.project_id, 4, 16000).filter((h) => !seen.has(h.chunkId));
  return [...found, ...lead].slice(0, 18);
}

const running = new Set<number>();

/** Жараённи бажариш ёки давом эттириш: фақат бажарилмаган қадамлар ишлайди, тайёр натижалар сақланиб қолади. */
export async function executeRun(id: number, answers?: string) {
  if (running.has(id)) throw new HttpError(409, 'Бу жараён ҳозир бажарилмоқда.');
  running.add(id);
  try {
    let run = getRun(id);
    const def = WORKFLOWS[run.type];
    const steps: Step[] = run.steps;
    if (answers && run.type === 'brief') {
      run.brief.answers = [run.brief.answers, String(answers).trim()].filter(Boolean).join('\n');
      getDb().prepare('UPDATE workflow_runs SET brief = ? WHERE id = ?').run(JSON.stringify(run.brief), id);
      const chk = steps.find((s) => s.key === 'check')!; chk.status = 'pending';
    }
    saveRun(id, { status: 'running' });
    const profile = personalContext(run.project_id);
    const project = projectCard(run.project_id);
    let hits: Hit[] = [];
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i]; const sd = def.steps[i];
      if (st.status === 'done') { if (st.meta?.hits) hits = st.meta.hits; continue; }
      st.status = 'running'; st.error = undefined; saveRun(id, { steps });
      try {
        if (st.key === 'sources') {
          const q = `${project} аудитория мижоз муаммо эътироз рақобатчи нарх таклиф афзаллик`;
          hits = gatherSources(run, q);
          if (!hits.length) throw new HttpError(400, 'Лойиҳада ўқилган манба йўқ. Аввал «Манбалар» бўлимида PDF/TXT/MD ёки URL қўшинг.');
          st.output = `${hits.length} та парча, ${new Set(hits.map((h) => h.docName)).size} та ҳужжатдан:\n` + [...new Set(hits.map((h) => `- ${h.docName}`))].join('\n');
          st.meta = { hits };
        } else if (st.key === 'report') {
          const noteId = saveReport(run, steps, hits);
          st.output = `Сақланди: ёзув #${noteId}`;
          saveRun(id, { result_note_id: noteId });
        } else {
          const role = ROLES.find((r) => r.key === sd.role)!;
          const prev = steps.slice(0, i).filter((s) => s.status === 'done' && s.ai && s.output).map((s) => `### ${s.name}\n${s.output}`).join('\n\n');
          const sys = [BASE_RULES, `## Роль: ${role.name}\n${role.system_prompt}`, profile && `## Фойдаланувчи ҳақида\n${profile}`, project && `## Лойиҳа\n${project}`,
            hits.length ? `${SOURCE_RULES(run.type === 'business')}\n\n## Манбалар\n${formatSources(hits)}` : ''].filter(Boolean).join('\n\n');
          const task = run.type === 'brief' ? `JARVIS BRIEF:\n${briefText(run.brief)}${run.brief.answers ? `\n\nҚўшимча жавоблар:\n${run.brief.answers}` : ''}`
            : run.input ? `Хом ғоя / маълумот:\n${run.input}` : '';
          const user = [task, prev && `Олдинги қадамлар натижаси:\n${prev}`, `ВАЗИФА (${st.name}): ${sd.ask}`].filter(Boolean).join('\n\n');
          const r = await complete({ system: sys, messages: [{ role: 'user', content: user }], kind: `workflow:${run.type}` });
          st.output = r.text + (r.note ? `\n\n_(${r.note})_` : '');
          st.meta = { provider: r.provider, model: r.model, mock: r.mock, costUsd: r.costUsd, citations: hits.length ? citationsFrom(r.text, hits).filter((c) => c.cited) : [] };
          if (st.key === 'check' && /^\s*\**\s*САВОЛЛАР/i.test(r.text)) {
            st.status = 'needs_input'; st.at = now();
            saveRun(id, { status: 'needs_input', steps });
            return getRun(id);
          }
        }
        st.status = 'done'; st.at = now();
        saveRun(id, { steps });
      } catch (e: any) {
        st.status = 'error'; st.error = e.message; st.at = now();
        saveRun(id, { status: 'error', steps });
        log('workflow_error', 'workflow', id, `${st.key}: ${e.message}`);
        return getRun(id);
      }
    }
    saveRun(id, { status: 'done', steps });
    log('workflow_done', 'workflow', id, run.type);
    return getRun(id);
  } finally { running.delete(id); }
}

function saveReport(run: any, steps: Step[], hits: Hit[]) {
  const def = WORKFLOWS[run.type];
  const ai = steps.filter((s) => s.ai && s.status === 'done' && s.key !== 'check');
  const mock = ai.some((s) => s.meta?.mock);
  const cited = new Map<number, any>();
  for (const s of ai) for (const c of s.meta?.citations ?? []) cited.set(c.n, c);
  const srcList = hits.map((h, i) => `- [S${i + 1}] ${h.docName}${h.page ? `, ${h.page}-бет` : ''}${h.url ? ` — ${h.url}` : ''}${cited.has(i + 1) ? '' : ' (ишлатилмаган)'}`).join('\n');
  const body = [
    mock ? '> ⚠️ ТЕСТ (MOCK) НАТИЖАСИ — ҳақиқий AI жавоби эмас.\n' : '> AI натижаси. Ундаги тахминлар тасдиқланмаган — кўриб чиқиб, тўғриларини «Тасдиқланган факт» сифатида сақланг.\n',
    run.type === 'brief' ? `## JARVIS BRIEF\n\n${briefText(run.brief).replace(/\n/g, '\n\n')}\n` : run.input ? `## Хом ғоя\n\n${run.input}\n` : '',
    ...ai.map((s) => `## ${s.name}\n\n${s.output}\n`),
    hits.length ? `## Манбалар\n\n${srcList}\n` : '',
  ].filter(Boolean).join('\n');
  const folder = run.brief?.folder || def.folder;
  const n = createNote({ folder, title: run.title, body, kind: 'assumption', project_id: run.project_id, source: `Жараён #${run.id} (${def.name})`, source_ref: hits.map((h) => `${h.docName}${h.page ? `#${h.page}` : ''}`).join('; ') }, 'ai');
  return n.id;
}

export function deleteRun(id: number) { getDb().prepare('UPDATE workflow_runs SET deleted_at = ? WHERE id = ?').run(now(), id); }
