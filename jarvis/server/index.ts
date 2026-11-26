import './env.ts';
import { createApp } from './app.ts';
import { schedulerTick } from './tasks.ts';
import { maybeAutoBackup } from './backup.ts';
import { resumeOcr } from './docs.ts';

const app = createApp();
const port = Number(process.env.PORT || 3333);
const host = process.env.HOST || '127.0.0.1';

app.listen(port, host, () => {
  console.log(`\n  JARVIS ишга тушди: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}\n  Маълумотлар: ${process.env.JARVIS_DATA_DIR || 'jarvis/data'}\n`);
});

function tick() {
  try {
    const r = schedulerTick();
    if (r.length) console.log('[scheduler]', r.map((x) => `${x.slot} ${x.status}`).join(', '));
    // Кунлик автоматик backup (Тошкент вақти бўйича кунига бир марта)
    maybeAutoBackup().catch(() => {});
  } catch (e: any) { console.error('[scheduler] error:', e.message); }
}
setTimeout(tick, 3000);
resumeOcr().catch((e) => console.error('[ocr] resume:', e.message));
setInterval(tick, 30000);
