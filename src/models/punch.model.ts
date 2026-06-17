export interface Punch {
  id?: number;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  name: string;       // "Entrada 1", "Saída 1", etc.
  type: 'ENTRY' | 'EXIT';
  syncedAt: string;   // ISO datetime
}

export interface WorkdaySummary {
  date: string;
  punches: Punch[];
  workedMinutes: number;
  remainingMinutes: number;
  expectedExitTime: string | null;
  isOpen: boolean;
  isComplete: boolean;
}
