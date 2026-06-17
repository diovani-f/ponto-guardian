import { SecullumSession, fetchPunchesForDate } from './secullum.service.js';
import { upsertPunch, logSync } from '../db/database.js';
import { Punch } from '../models/punch.model.js';

export type SyncEventHandler = (newPunches: Punch[]) => void;

export class SyncService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private handlers: SyncEventHandler[] = [];

  constructor(
    private session: SecullumSession,
    private intervalMinutes: number,
  ) {}

  onNewPunch(handler: SyncEventHandler): void {
    this.handlers.push(handler);
  }

  async syncNow(): Promise<Punch[]> {
    const date = new Date().toISOString().split('T')[0];
    const punches = await fetchPunchesForDate(this.session, date);

    const newPunches: Punch[] = [];
    for (const punch of punches) {
      const isNew = upsertPunch(punch);
      if (isNew) newPunches.push(punch);
    }

    logSync(date, newPunches.length);

    if (newPunches.length > 0) {
      this.handlers.forEach((h) => h(newPunches));
    }

    return newPunches;
  }

  start(): void {
    if (this.timer) return;
    const ms = this.intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => {
      this.syncNow().catch((err) =>
        console.error('[sync] Erro ao sincronizar:', err.message),
      );
    }, ms);
    console.log(`[sync] Sincronização iniciada (a cada ${this.intervalMinutes} min)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
