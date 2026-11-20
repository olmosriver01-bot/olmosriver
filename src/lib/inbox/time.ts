/** Vaqt zonasi bo'yicha hisob-kitoblar (tashqi kutubxonasiz, Intl orqali). */

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(date: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAYS[p.weekday] ?? 1,
  };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseHHMM(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Zonadagi mahalliy vaqtni UTC lahzasiga aylantiradi. */
export function zonedToUtc(year: number, month: number, day: number, minutes: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  let result = guess;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(result), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    result += guess - asUtc;
  }
  return new Date(result);
}

/** `now` dan oldingi (yoki unga teng) eng so'nggi rejalashtirilgan hisobot lahzasi. */
export function lastScheduledMoment(now: Date, reportTime: string, timeZone: string): { at: Date; key: string } {
  const minutes = parseHHMM(reportTime) ?? 23 * 60;
  const p = localParts(now, timeZone);
  let at = zonedToUtc(p.year, p.month, p.day, minutes, timeZone);
  if (at.getTime() > now.getTime()) {
    const prev = localParts(new Date(at.getTime() - 24 * 3600_000), timeZone);
    at = zonedToUtc(prev.year, prev.month, prev.day, minutes, timeZone);
  }
  const k = localParts(at, timeZone);
  return { at, key: `${k.year}-${String(k.month).padStart(2, "0")}-${String(k.day).padStart(2, "0")}@${reportTime}` };
}

export function formatLocal(date: Date | null | undefined, timeZone: string): string {
  if (!date) return "—";
  const p = localParts(date, timeZone);
  const dd = String(p.day).padStart(2, "0");
  const mm = String(p.month).padStart(2, "0");
  return `${dd}.${mm}.${p.year} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  if (totalMin < 1) return "1 дақиқадан кам";
  if (totalMin < 60) return `${totalMin} дақиқа`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m ? `${h} соат ${m} дақиқа` : `${h} соат`;
  const d = Math.floor(h / 24);
  return `${d} кун ${h % 24} соат`;
}

/** Smena: days = "1,2,..,7" (1 = душанба); endMinute <= startMinute bo'lsa tun orqali o'tadi. */
export function isOnShift(shifts: { days: string; startMinute: number; endMinute: number }[], now: Date, timeZone: string): boolean {
  if (shifts.length === 0) return true; // smena kiritilmagan xodim doim navbatda deb olinadi
  const p = localParts(now, timeZone);
  const minute = p.hour * 60 + p.minute;
  const prevDay = p.weekday === 1 ? 7 : p.weekday - 1;
  for (const s of shifts) {
    const days = s.days.split(",").map(Number);
    if (s.endMinute > s.startMinute) {
      if (days.includes(p.weekday) && minute >= s.startMinute && minute < s.endMinute) return true;
    } else {
      if (days.includes(p.weekday) && minute >= s.startMinute) return true;
      if (days.includes(prevDay) && minute < s.endMinute) return true;
    }
  }
  return false;
}

export function msSince(date: Date): number {
  return Date.now() - date.getTime();
}
