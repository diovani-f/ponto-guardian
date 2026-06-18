import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } from 'electron';
import { join } from 'path';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { login } from '../src/services/secullum.service.js';
import { SyncService } from '../src/services/sync.service.js';
import { getPunchesForDate } from '../src/db/database.js';
import { buildSummary, formatMinutes, parseHHMM } from '../src/services/workday.service.js';
import { getSettings, saveSettings, getDailyMinutes, settingsExist } from '../src/config/settings.js';
import { Punch } from '../src/models/punch.model.js';

// userData = ~/.config/ponto-guardian (gravável tanto no dev quanto no AppImage)
const userDataPath = app.getPath('userData');
process.env.PONTO_ROOT = userDataPath;

function autostartPath(): string {
  return join(app.getPath('home'), '.config', 'autostart', 'ponto-guardian.desktop');
}

function desktopExecArg(value: string): string {
  return `"${value.replace(/["\\`$]/g, '\\$&')}"`;
}

function setAutostart(enabled: boolean): void {
  const desktopPath = autostartPath();
  if (enabled) {
    // app.isPackaged = true quando rodando via AppImage
    const execLine = app.isPackaged
      ? `${desktopExecArg(process.env.APPIMAGE ?? app.getPath('exe'))} --no-sandbox`
      : `${desktopExecArg(process.execPath)} ${desktopExecArg(join(__dirname, 'main.js'))} --no-sandbox`;
    const content = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Ponto Guardian',
      `Exec=${execLine}`,
      'Hidden=false',
      'NoDisplay=false',
      'X-GNOME-Autostart-enabled=true',
    ].join('\n') + '\n';
    mkdirSync(join(app.getPath('home'), '.config', 'autostart'), { recursive: true });
    writeFileSync(desktopPath, content, 'utf-8');
  } else {
    if (existsSync(desktopPath)) unlinkSync(desktopPath);
  }
}

let widget: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let syncService: SyncService | null = null;

// Notificações disparadas hoje (reset ao trocar de dia)
let notifDay = '';
const notifiedThresholds = new Set<string>();
let lunchReturnTimer: ReturnType<typeof setTimeout> | null = null;

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function resetNotifIfNewDay(): void {
  const today = getTodayKey();
  if (today !== notifDay) {
    notifDay = today;
    notifiedThresholds.clear();
    if (lunchReturnTimer) {
      clearTimeout(lunchReturnTimer);
      lunchReturnTimer = null;
    }
  }
}

function sendNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send('flash', `${title}: ${body}`);
    if (!widget.isVisible()) {
      widget.show();
    }
  }
}

function getSummaryPayload() {
  const date = getTodayKey();
  const punches = getPunchesForDate(date);
  const summary = buildSummary(date, punches, getDailyMinutes());
  const lastPunch = punches.length > 0
    ? `${punches[punches.length - 1].name} ${punches[punches.length - 1].time}`
    : 'Nenhuma';
  return {
    date,
    workedFormatted: formatMinutes(summary.workedMinutes),
    remainingFormatted: formatMinutes(Math.max(0, summary.remainingMinutes)),
    expectedExit: summary.expectedExitTime ?? '--:--',
    isOpen: summary.isOpen,
    isComplete: summary.isComplete,
    isOvertime: summary.remainingMinutes < 0,
    overtimeFormatted: summary.remainingMinutes < 0
      ? formatMinutes(Math.abs(summary.remainingMinutes))
      : null,
    lastPunch,
    lastSync: new Date().toLocaleTimeString('pt-BR'),
    punches: summary.punches.map((p) => ({ name: p.name, time: p.time, type: p.type })),
  };
}

function pushUpdate(): void {
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send('update', getSummaryPayload());
  }
}

function checkNotifications(newPunches: Punch[]): void {
  resetNotifIfNewDay();

  const date = getTodayKey();
  const allPunches = getPunchesForDate(date);
  const summary = buildSummary(date, allPunches, getDailyMinutes());
  const settings = getSettings();
  const remaining = summary.remainingMinutes;

  if (newPunches.length > 0) {
    const label = newPunches.map((p) => `${p.name} ${p.time}`).join(', ');
    sendNotification('Ponto Guardian', `Nova batida: ${label}`);
  }

  if (remaining <= 0) {
    if (!notifiedThresholds.has('complete')) {
      notifiedThresholds.add('complete');
      sendNotification(
        'Jornada concluída!',
        `Você completou suas ${settings.dailyHours}h. Lembre-se de bater a saída.`,
      );
    }
    if (settings.allowOvertime) {
      const overtime = Math.abs(remaining);
      const key = `overtime_${Math.floor(overtime / 5) * 5}`;
      if (!notifiedThresholds.has(key)) {
        notifiedThresholds.add(key);
        sendNotification(
          'Hora extra',
          `Você está em hora extra há ${formatMinutes(overtime)}.`,
        );
      }
    }
  }

  // Notificação de volta do almoço: 60 min após o horário real da 2ª batida
  if (
    newPunches.length > 0 &&
    allPunches.length === 2 &&
    !notifiedThresholds.has('lunch_return_scheduled')
  ) {
    notifiedThresholds.add('lunch_return_scheduled');
    if (lunchReturnTimer) clearTimeout(lunchReturnTimer);
    // Usa o horário real da 2ª batida para calcular o delay
    const secondPunch = [...allPunches].sort((a, b) => a.time.localeCompare(b.time))[1];
    const punchMin = parseHHMM(secondPunch.time);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const elapsedMs = punchMin !== null ? Math.max(0, nowMin - punchMin) * 60 * 1000 : 0;
    const delayMs = Math.max(0, 60 * 60 * 1000 - elapsedMs);
    lunchReturnTimer = setTimeout(() => {
      sendNotification(
        'Hora de voltar!',
        'Já passou 1 hora de almoço. Não esqueça de bater o ponto.',
      );
    }, delayMs);
  }

  pushUpdate();
}

function appIcon(): ReturnType<typeof nativeImage.createFromPath> {
  const iconPath = join(process.resourcesPath, 'icon.png');
  return existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
}

function createWidget(): void {
  const alwaysOnTop = getSettings().alwaysOnTop ?? true;
  widget = new BrowserWindow({
    width: 260,
    height: 185,
    frame: false,
    transparent: true,
    alwaysOnTop,
    resizable: false,
    skipTaskbar: true,
    icon: appIcon(),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widget.loadFile(join(__dirname, 'renderer', 'index.html'));
  widget.on('closed', () => { widget = null; });
}

function openSettingsWindow(): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    title: 'Configurações - Ponto Guardian',
    icon: appIcon(),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function createTray(): void {
  const iconPath = join(process.resourcesPath, 'icon.png');
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 })
    : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Ponto Guardian');

  const rebuildMenu = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Mostrar widget',
        click: () => { if (!widget) createWidget(); else widget.show(); },
      },
      {
        label: 'Sincronizar agora',
        click: async () => {
          await syncService?.syncNow();
          pushUpdate();
        },
      },
      {
        label: 'Configurações',
        click: openSettingsWindow,
      },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ]);
    tray!.setContextMenu(menu);
  };

  rebuildMenu();

  tray.on('click', () => {
    if (!widget) createWidget();
    else if (widget.isVisible()) widget.hide();
    else widget.show();
  });
}

// IPC handlers
ipcMain.handle('get-summary', () => getSummaryPayload());

ipcMain.handle('get-settings', () => getSettings());

ipcMain.handle('set-autostart', (_e, enabled: boolean) => {
  setAutostart(enabled);
});

ipcMain.handle('save-settings', (_e, next) => {
  saveSettings(next);
  setAutostart(next.autostart ?? false);
  // reiniciar sync com novo intervalo
  syncService?.stop();
  login({
    empresaId: next.empresaId,
    usuario: next.login,
    senha: next.senha,
  }).then((session) => {
    syncService = new SyncService(session, next.syncIntervalMinutes);
    syncService.onNewPunch(checkNotifications);
    syncService.syncNow().then(pushUpdate);
    syncService.start();
  }).catch((err: Error) => console.error('[settings] login falhou:', err.message));
});

ipcMain.on('hide-widget', () => widget?.hide());

ipcMain.on('test-notification', (_e, type: string) => {
  const settings = getSettings();
  const cases: Record<string, [string, string]> = {
    entry_time:   ['Hora de bater o ponto!', `São ${getSettings().entryTime ?? '08:00'}. Não esqueça de registrar sua entrada.`],
    new_punch:    ['Ponto Guardian', 'Nova batida: Entrada 1 08:00'],
    warning:      ['Ponto Guardian', `Faltam ${formatMinutes(settings.warningMinutes)} para completar sua jornada.`],
    '5min':       ['Ponto Guardian', 'Prepare-se para bater o ponto. Faltam menos de 5 minutos!'],
    complete:     ['Jornada concluída!', `Você completou suas ${settings.dailyHours}h. Lembre-se de bater a saída.`],
    overtime:     ['Hora extra', 'Você está em hora extra há 0h05.'],
    lunch_time:   ['Hora do almoço!', 'Lembre-se de bater o ponto antes de sair para o almoço.'],
    lunch_return: ['Hora de voltar!', 'Já passou 1 hora de almoço. Não esqueça de bater o ponto.'],
    exit_reminder:['Bata o ponto de saída!', 'Sua jornada foi concluída. Não esqueça de registrar a saída.'],
  };
  const [title, body] = cases[type] ?? ['Teste', type];
  sendNotification(title, body);
});

ipcMain.on('open-settings', openSettingsWindow);

ipcMain.on('close-settings', () => settingsWin?.close());

ipcMain.handle('toggle-always-on-top', () => {
  if (!widget || widget.isDestroyed()) return false;
  const next = !widget.isAlwaysOnTop();
  widget.setAlwaysOnTop(next);
  const settings = getSettings();
  saveSettings({ ...settings, alwaysOnTop: next });
  return next;
});

ipcMain.handle('get-always-on-top', () => {
  if (!widget || widget.isDestroyed()) return true;
  return widget.isAlwaysOnTop();
});

app.whenReady().then(async () => {
  mkdirSync(join(userDataPath, 'data'), { recursive: true });
  mkdirSync(join(userDataPath, 'config'), { recursive: true });
  const isFirstRun = !settingsExist() || !getSettings().login;
  const settings = getSettings();

  createWidget();
  createTray();

  if (isFirstRun) {
    openSettingsWindow();
    return;
  }

  const session = await login({
    empresaId: settings.empresaId,
    usuario: settings.login,
    senha: settings.senha,
  });

  syncService = new SyncService(session, settings.syncIntervalMinutes);
  syncService.onNewPunch(checkNotifications);

  await syncService.syncNow();
  syncService.start();

  setInterval(() => {
    resetNotifIfNewDay();
    const settings = getSettings();
    const date = getTodayKey();
    const allPunches = getPunchesForDate(date);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowHHMM = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Avisos de fim de jornada (recalculados a cada 30s pois remaining muda com o tempo)
    if (allPunches.length > 0) {
      const summary = buildSummary(date, allPunches, getDailyMinutes());
      const remaining = summary.remainingMinutes;
      if (remaining > 0) {
        if (remaining <= settings.warningMinutes && settings.warningMinutes > 5 && !notifiedThresholds.has('warning')) {
          notifiedThresholds.add('warning');
          sendNotification(
            'Ponto Guardian',
            `Faltam ${formatMinutes(remaining)} para completar sua jornada.`,
          );
        }
        if (remaining <= 5 && !notifiedThresholds.has('5min')) {
          notifiedThresholds.add('5min');
          sendNotification('Ponto Guardian', 'Prepare-se para bater o ponto. Faltam menos de 5 minutos!');
        }
        if (remaining <= settings.warningMinutes && settings.warningMinutes <= 5 && !notifiedThresholds.has('warning')) {
          notifiedThresholds.add('warning');
          sendNotification(
            'Ponto Guardian',
            `Faltam ${formatMinutes(remaining)} para completar sua jornada.`,
          );
        }
      }
    }

    // Notificação de entrada: dispara quando atinge o entryTime e ainda não há batidas
    if (settings.entryTime && allPunches.length === 0 && nowHHMM >= settings.entryTime) {
      if (!notifiedThresholds.has('entry_time')) {
        notifiedThresholds.add('entry_time');
        sendNotification(
          'Hora de bater o ponto!',
          `São ${settings.entryTime}. Não esqueça de registrar sua entrada.`,
        );
      }
    }

    // Notificação de almoço: uma única vez quando atinge o lunchTime configurado
    if (settings.lunchTime && allPunches.length === 1 && nowHHMM >= settings.lunchTime) {
      if (!notifiedThresholds.has('lunch_time')) {
        notifiedThresholds.add('lunch_time');
        sendNotification(
          'Hora do almoço!',
          'Lembre-se de bater o ponto antes de sair para o almoço.',
        );
      }
    }

    // Renotificação de saída a cada 15 min após jornada concluída
    if (allPunches.length >= 3) {
      const summary = buildSummary(date, allPunches, getDailyMinutes());
      if (summary.remainingMinutes <= 0) {
        const overtime = Math.abs(summary.remainingMinutes);
        const slot = Math.floor(overtime / 15);
        const key = `exit_reminder_${slot}`;
        if (!notifiedThresholds.has(key)) {
          notifiedThresholds.add(key);
          sendNotification(
            'Bata o ponto de saída!',
            overtime < 1
              ? 'Sua jornada foi concluída. Não esqueça de registrar a saída.'
              : `Sua jornada acabou há ${formatMinutes(overtime)}. Não esqueça de registrar.`,
          );
        }
      }
    }

    pushUpdate();
  }, 30_000);

  app.on('window-all-closed', () => { /* mantém app vivo no tray */ });
});

app.on('before-quit', () => {
  syncService?.stop();
});
