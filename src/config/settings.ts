import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface Settings {
  empresaId: number;
  login: string;
  senha: string;
  dailyHours: number;
  warningMinutes: number;
  syncIntervalMinutes: number;
  allowOvertime?: boolean;
  entryTime?: string;
  lunchTime?: string;
  alwaysOnTop?: boolean;
  autostart?: boolean;
  enableWidgetClockIn?: boolean;
  identificacaoDispositivo?: string;
  useFixedLocation?: boolean;
  fixedLatitude?: number | null;
  fixedLongitude?: number | null;
  fixedAccuracy?: number | null;
  fixedAddress?: string;
}

let _settings: Settings | null = null;

function settingsPath(): string {
  const root = process.env.PONTO_ROOT ?? process.cwd();
  return join(root, 'config', 'settings.json');
}

const DEFAULTS: Settings = {
  empresaId: 0,
  login: '',
  senha: '',
  dailyHours: 6,
  warningMinutes: 10,
  syncIntervalMinutes: 2,
  allowOvertime: false,
  entryTime: '',
  lunchTime: '',
  alwaysOnTop: true,
  autostart: false,
  enableWidgetClockIn: false,
  identificacaoDispositivo: '',
  useFixedLocation: false,
  fixedLatitude: null,
  fixedLongitude: null,
  fixedAccuracy: null,
  fixedAddress: '',
};

export function settingsExist(): boolean {
  return existsSync(settingsPath());
}

export function getSettings(): Settings {
  if (!_settings) {
    const path = settingsPath();
    if (!existsSync(path)) {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, JSON.stringify(DEFAULTS, null, 2), 'utf-8');
    }
    _settings = JSON.parse(readFileSync(path, 'utf-8')) as Settings;
  }
  return _settings;
}

export function saveSettings(next: Settings): void {
  _settings = next;
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8');
}

export function getDailyMinutes(): number {
  return getSettings().dailyHours * 60;
}
