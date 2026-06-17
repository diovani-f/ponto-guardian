import { Punch, WorkdaySummary } from '../models/punch.model.js';

export function parseHHMM(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

export function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${h}h${m.toString().padStart(2, '0')}`;
}

export function formatHHMM(minutes: number): string {
  const h = Math.floor(Math.max(0, minutes) / 60) % 24;
  const m = Math.max(0, minutes) % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function calculateWorkedMinutes(punches: Punch[]): number {
  let total = 0;
  const sorted = [...punches].sort((a, b) => a.time.localeCompare(b.time));

  for (let i = 0; i + 1 < sorted.length; i += 2) {
    if (sorted[i].type !== 'ENTRY' || sorted[i + 1].type !== 'EXIT') continue;
    const entry = parseHHMM(sorted[i].time);
    const exit = parseHHMM(sorted[i + 1].time);
    if (entry !== null && exit !== null && exit > entry) {
      total += exit - entry;
    }
  }

  return total;
}

export function calculateWorkedWithCurrent(punches: Punch[]): number {
  const sorted = [...punches].sort((a, b) => a.time.localeCompare(b.time));
  const isOpen = sorted.length % 2 !== 0;

  let total = calculateWorkedMinutes(punches);

  if (isOpen) {
    const lastEntry = parseHHMM(sorted[sorted.length - 1].time);
    if (lastEntry !== null) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      total += nowMin - lastEntry;
    }
  }

  return total;
}

export function calculateRemainingMinutes(workedMinutes: number, dailyMinutes: number): number {
  return dailyMinutes - workedMinutes;
}

const MIN_LUNCH_MINUTES = 60;

export function calculateExpectedExit(punches: Punch[], dailyMinutes: number): string | null {
  const sorted = [...punches].sort((a, b) => a.time.localeCompare(b.time));
  const isOpen = sorted.length % 2 !== 0;

  if (!isOpen || sorted.length === 0) return null;

  const onlyFirstPunch = sorted.length === 1;

  const workedSoFar = calculateWorkedMinutes(punches);
  const remainingAfterClose = dailyMinutes - workedSoFar;

  const lastEntry = parseHHMM(sorted[sorted.length - 1].time);
  if (lastEntry === null) return null;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const workedInCurrentPeriod = nowMin - lastEntry;

  const stillNeeded = remainingAfterClose - workedInCurrentPeriod;

  const lunchOffset = onlyFirstPunch ? MIN_LUNCH_MINUTES : 0;

  const exitMin = nowMin + stillNeeded + lunchOffset;

  return formatHHMM(exitMin);
}

export function buildSummary(
  date: string,
  punches: Punch[],
  dailyMinutes: number,
): WorkdaySummary {
  const sorted = [...punches].sort((a, b) => a.time.localeCompare(b.time));
  const isOpen = sorted.length > 0 && sorted.length % 2 !== 0;
  const workedMinutes = isOpen
    ? calculateWorkedWithCurrent(punches)
    : calculateWorkedMinutes(punches);
  const remainingMinutes = calculateRemainingMinutes(workedMinutes, dailyMinutes);

  return {
    date,
    punches: sorted,
    workedMinutes,
    remainingMinutes,
    expectedExitTime: isOpen ? calculateExpectedExit(punches, dailyMinutes) : null,
    isOpen,
    isComplete: workedMinutes >= dailyMinutes,
  };
}
