import './env.ts';
import { openDb } from './db.ts';
import { createBackup, restoreBackup, listBackups } from './backup.ts';

const [cmd, arg] = process.argv.slice(2);
openDb();
if (cmd === 'backup') { console.log('Backup яратилди:', (await createBackup('manual')).name); }
else if (cmd === 'restore') {
  if (!arg) { console.log('Фойдаланиш: npm run restore -- <backup-номи.zip>\nМавжуд backup’лар:'); for (const b of listBackups()) console.log(' ', b.name); process.exit(1); }
  const r = await restoreBackup(arg);
  console.log('Тикланди. Олдинги ҳолат сақланди:', r.preRestore);
} else console.log('Буйруқлар: backup | restore <номи>');
