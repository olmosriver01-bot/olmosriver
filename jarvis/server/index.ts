import './env.ts';
import { createApp } from './app.ts';
import { schedulerTick } from './tasks.ts';
import { createBackup, listBackups } from './backup.ts';
import { tashkentParts, log } from './db.ts';
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
    const today = tashkentParts(new Date()).date.replace(/-/g, '');
    if (!listBackups().some((b) => b.name.includes('-auto') && b.name.slice(7, 17).replace(/-/g, '') === today))
      createBackup('auto').catch((e) => log('backup_error', 'backup', '', e.message));
  } catch (e: any) { console.error('[scheduler] error:', e.message); }
}
setTimeout(tick, 3000);
resumeOcr().catch((e) => console.error('[ocr] resume:', e.message));
setInterval(tick, 30000);
