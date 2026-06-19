import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, session as electronSession, shell } from 'electron';
import { join } from 'path';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { createServer } from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ClockInPayload, SecullumSession, createClockIn, getClockInMetadata, login } from '../src/services/secullum.service.js';
import { SyncService } from '../src/services/sync.service.js';
import { getPunchesForDate } from '../src/db/database.js';
import { buildSummary, formatMinutes, parseHHMM } from '../src/services/workday.service.js';
import { getSettings, saveSettings, getDailyMinutes, settingsExist } from '../src/config/settings.js';
import { Punch } from '../src/models/punch.model.js';

// userData = ~/.config/ponto-guardian (gravável tanto no dev quanto no AppImage)
const userDataPath = app.getPath('userData');
process.env.PONTO_ROOT = userDataPath;

const execFileAsync = promisify(execFile);

function linuxAutostartPath(): string {
  return join(app.getPath('home'), '.config', 'autostart', 'ponto-guardian.desktop');
}

function desktopExecArg(value: string): string {
  return `"${value.replace(/["\\`$]/g, '\\$&')}"`;
}

function setLinuxAutostart(enabled: boolean): void {
  const desktopPath = linuxAutostartPath();
  if (enabled) {
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
    return;
  }

  if (existsSync(desktopPath)) unlinkSync(desktopPath);
}

function setWindowsAutostart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe'),
    args: [],
  });
}

function setAutostart(enabled: boolean): void {
  if (process.platform === 'win32') {
    setWindowsAutostart(enabled);
    return;
  }

  if (process.platform === 'linux') {
    setLinuxAutostart(enabled);
    return;
  }

  console.warn('[autostart] Plataforma não suportada:', process.platform);
}

let widget: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let syncService: SyncService | null = null;
let currentSession: SecullumSession | null = null;

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

interface ApproximatePosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface CapturedPosition extends ApproximatePosition {
  address: string;
}

interface IpLocationProvider {
  url: string;
  parse: (data: unknown) => ApproximatePosition | null;
}

const BROWSER_HEADERS = {
  Accept: 'application/json,text/plain,*/*',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
};

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getApproximatePositionByIp(): Promise<ApproximatePosition> {
  const providers: IpLocationProvider[] = [
    {
      url: 'https://ipwho.is/',
      parse: (data) => {
        const payload = data as { success?: boolean; latitude?: unknown; longitude?: unknown };
        if (payload.success === false) return null;
        const latitude = parseNumber(payload.latitude);
        const longitude = parseNumber(payload.longitude);
        return latitude !== null && longitude !== null ? { latitude, longitude, accuracy: 20000 } : null;
      },
    },
    {
      url: 'https://ipapi.co/json/',
      parse: (data) => {
        const payload = data as { latitude?: unknown; longitude?: unknown };
        const latitude = parseNumber(payload.latitude);
        const longitude = parseNumber(payload.longitude);
        return latitude !== null && longitude !== null ? { latitude, longitude, accuracy: 20000 } : null;
      },
    },
    {
      url: 'http://ip-api.com/json/?fields=status,lat,lon',
      parse: (data) => {
        const payload = data as { status?: string; lat?: unknown; lon?: unknown };
        if (payload.status !== 'success') return null;
        const latitude = parseNumber(payload.lat);
        const longitude = parseNumber(payload.lon);
        return latitude !== null && longitude !== null ? { latitude, longitude, accuracy: 20000 } : null;
      },
    },
  ];

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const res = await fetch(provider.url, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        errors.push(`${provider.url}: HTTP ${res.status}`);
        continue;
      }

      const position = provider.parse(await res.json());
      if (position) return position;

      errors.push(`${provider.url}: resposta sem coordenadas`);
    } catch (error) {
      errors.push(`${provider.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Busca de localização aproximada falhou (${errors.join('; ')})`);
}

async function getApproximateCapturedPositionByIp(): Promise<CapturedPosition> {
  const position = await getApproximatePositionByIp();
  const address = await reverseGeocode(position.latitude, position.longitude);
  return { ...position, address };
}

async function capturePositionFromBrowser(): Promise<CapturedPosition> {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      server.close();
      reject(error);
    };
    const server = createServer((req, res) => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Ponto Guardian</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #111827; color: #f9fafb; display: grid; min-height: 100vh; place-items: center; margin: 0; }
    main { max-width: 430px; padding: 28px; border-radius: 16px; background: #1f2937; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
    button { border: 0; border-radius: 10px; padding: 12px 18px; background: #6366f1; color: white; font-weight: 700; cursor: pointer; }
    p { color: #cbd5e1; line-height: 1.5; }
    #status { margin-top: 16px; color: #a5b4fc; }
  </style>
</head>
<body>
  <main>
    <h1>Ponto Guardian</h1>
    <p>Clique para autorizar a localização no navegador. Depois disso ela ficará salva no aplicativo.</p>
    <button id="btn">capturar localização</button>
    <div id="status"></div>
  </main>
  <script>
    const status = document.getElementById('status');
    const attempts = [
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
      { enableHighAccuracy: true, timeout: 45000, maximumAge: 0 },
    ];

    function errorCodeName(code) {
      if (code === 1) return 'PERMISSION_DENIED';
      if (code === 2) return 'POSITION_UNAVAILABLE';
      if (code === 3) return 'TIMEOUT';
      return 'UNKNOWN';
    }

    async function sendError(error) {
      const message = error?.message || 'não foi possível obter localização';
      await fetch('/position-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: errorCodeName(error?.code), message }),
      }).catch(() => {});
    }

    function requestPosition(options) {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });
    }

    document.getElementById('btn').addEventListener('click', async () => {
      if (!navigator.geolocation) {
        const error = new Error('Este navegador não suporta localização.');
        status.textContent = error.message;
        await sendError(error);
        return;
      }

      let lastError = null;
      for (const [index, options] of attempts.entries()) {
        status.textContent = index === 0 ? 'solicitando localização...' : 'tentando novamente com alta precisão...';
        try {
          const position = await requestPosition(options);
          await fetch('/position', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }),
          });
          status.textContent = 'localização salva no Ponto Guardian. Pode fechar esta janela.';
          return;
        } catch (error) {
          lastError = error;
        }
      }

      status.textContent = lastError?.message || 'não foi possível obter localização';
      await sendError(lastError);
    });
  </script>
</body>
</html>`);
        return;
      }

      if (req.method === 'POST' && req.url === '/position') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { latitude?: unknown; longitude?: unknown; accuracy?: unknown };
            const latitude = parseNumber(data.latitude);
            const longitude = parseNumber(data.longitude);
            const accuracy = parseNumber(data.accuracy) ?? 100;

            if (latitude === null || longitude === null) {
              throw new Error('Navegador não retornou coordenadas válidas');
            }

            const address = await reverseGeocode(latitude, longitude);
            settled = true;
            res.writeHead(204);
            res.end();
            server.close();
            resolve({ latitude, longitude, accuracy, address });
          } catch (error) {
            res.writeHead(400);
            res.end();
            fail(error instanceof Error ? error : new Error(String(error)));
          }
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/position-error') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { code?: unknown; message?: unknown };
          const code = typeof data.code === 'string' ? data.code : 'UNKNOWN';
          const message = typeof data.message === 'string' && data.message.trim() ? data.message.trim() : 'não foi possível obter localização';
          res.writeHead(204);
          res.end();
          fail(new Error(`Navegador não retornou localização (${code}): ${message}`));
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    const timeout = setTimeout(() => {
      fail(new Error('Tempo esgotado aguardando localização do navegador. Verifique se a localização está ativada no Windows e se o navegador tem permissão.'));
    }, 90000);

    server.on('close', () => clearTimeout(timeout));
    server.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        clearTimeout(timeout);
        fail(new Error('Não foi possível abrir o servidor local de localização'));
        return;
      }

      shell.openExternal(`http://127.0.0.1:${address.port}/`).catch((error) => {
        clearTimeout(timeout);
        fail(error);
      });
    });
  });
}

async function getSystemPositionByGeoClue(): Promise<ApproximatePosition> {
  if (process.platform !== 'linux') {
    throw new Error('Localização do sistema via GeoClue só está disponível no Linux.');
  }

  await execFileAsync('gsettings', ['set', 'org.gnome.system.location', 'enabled', 'true']);

  const script = `
import dbus, json, time
bus = dbus.SystemBus()
manager = bus.get_object('org.freedesktop.GeoClue2', '/org/freedesktop/GeoClue2/Manager')
manager_iface = dbus.Interface(manager, 'org.freedesktop.GeoClue2.Manager')
client_path = manager_iface.CreateClient()
client = bus.get_object('org.freedesktop.GeoClue2', client_path)
props = dbus.Interface(client, 'org.freedesktop.DBus.Properties')
props.Set('org.freedesktop.GeoClue2.Client', 'DesktopId', 'ponto-guardian')
props.Set('org.freedesktop.GeoClue2.Client', 'RequestedAccuracyLevel', dbus.UInt32(8))
dbus.Interface(client, 'org.freedesktop.GeoClue2.Client').Start()
for _ in range(5):
    loc_path = props.Get('org.freedesktop.GeoClue2.Client', 'Location')
    if str(loc_path) != '/':
        loc = bus.get_object('org.freedesktop.GeoClue2', loc_path)
        loc_props = dbus.Interface(loc, 'org.freedesktop.DBus.Properties').GetAll('org.freedesktop.GeoClue2.Location')
        print(json.dumps({
            'latitude': float(loc_props['Latitude']),
            'longitude': float(loc_props['Longitude']),
            'accuracy': float(loc_props['Accuracy']),
        }))
        break
    time.sleep(1)
else:
    raise RuntimeError('GeoClue não retornou localização em 5 segundos')
`;

  const { stdout } = await execFileAsync('python3', ['-c', script], { timeout: 7000 });
  const data = JSON.parse(stdout.trim()) as { latitude?: unknown; longitude?: unknown; accuracy?: unknown };
  const latitude = parseNumber(data.latitude);
  const longitude = parseNumber(data.longitude);
  const accuracy = parseNumber(data.accuracy) ?? 100;

  if (latitude === null || longitude === null) {
    throw new Error('GeoClue não retornou coordenadas válidas');
  }

  return { latitude, longitude, accuracy };
}

async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const res = await fetch(`https://geolocalizacao.secullum.com.br/Reverse?latitude=${latitude}&longitude=${longitude}`);

  if (!res.ok) {
    throw new Error(`Busca de endereço falhou: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { endereco?: string };
  if (!data.endereco) {
    throw new Error('Busca de endereço não retornou endereço');
  }

  return data.endereco;
}

function hasSavedLocation(settings: ReturnType<typeof getSettings>): boolean {
  return settings.useFixedLocation === true &&
    typeof settings.fixedLatitude === 'number' &&
    typeof settings.fixedLongitude === 'number' &&
    typeof settings.fixedAccuracy === 'number' &&
    Boolean(settings.fixedAddress?.trim());
}

function assertClockInAllowed(): string {
  const settings = getSettings();
  if (!settings.enableWidgetClockIn) {
    throw new Error('Habilite a batida de ponto pelo widget nas configurações.');
  }

  const identificacaoDispositivo = settings.identificacaoDispositivo?.trim();
  if (!identificacaoDispositivo) {
    throw new Error('Configure o identificador do dispositivo antes de bater o ponto.');
  }

  if (!hasSavedLocation(settings)) {
    throw new Error('Busque e salve a localização nas configurações antes de bater o ponto.');
  }

  return identificacaoDispositivo;
}

function assertSupportedClockIn(metadata: Awaited<ReturnType<typeof getClockInMetadata>>): void {
  if (metadata.exigirCapturaFotoPonto || metadata.reconhecerFace) {
    throw new Error('O Secullum exige foto ou reconhecimento facial para esta batida.');
  }

  if (metadata.somentePerimetrosAutorizados) {
    throw new Error('O Secullum exige validação de perímetro para esta batida.');
  }

  if (metadata.qualidadeVidaTrabalho?.habilitado) {
    throw new Error('O Secullum exige resposta de qualidade de vida para esta batida.');
  }
}

async function buildClockInPayload(position: { latitude: number; longitude: number; accuracy: number }): Promise<ClockInPayload> {
  const identificacaoDispositivo = assertClockInAllowed();
  const settings = getSettings();
  const latitude = settings.fixedLatitude;
  const longitude = settings.fixedLongitude;
  const precisao = settings.fixedAccuracy;
  const endereco = settings.fixedAddress?.trim();

  if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof precisao !== 'number' || !endereco) {
    throw new Error('Busque e salve a localização nas configurações antes de bater o ponto.');
  }

  return {
    justificativa: null,
    latitude,
    longitude,
    precisao,
    endereco,
    foraDoPerimetro: false,
    foto: null,
    fusoFoiModificado: false,
    horaFoiModificada: false,
    identificacaoDispositivo,
    marcacaoOffline: false,
    utilizaLocalizacaoFicticia: false,
    viaCentralWeb: true,
    atividadeId: null,
  };
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
    height: 220,
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
    width: 460,
    height: 760,
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

ipcMain.handle('get-system-position', async () => {
  try {
    return await getSystemPositionByGeoClue();
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n').at(-2) ?? error.message : String(error);
    console.warn('[location] Localização do sistema indisponível:', message.trim());
    return null;
  }
});

ipcMain.handle('capture-browser-position', () => capturePositionFromBrowser());

ipcMain.handle('get-approximate-position', () => getApproximateCapturedPositionByIp());

ipcMain.handle('clock-in', async (_e, position: { latitude: number; longitude: number; accuracy: number }) => {
  if (!currentSession) {
    throw new Error('Sessão Secullum não está ativa.');
  }

  assertClockInAllowed();
  const metadata = await getClockInMetadata(currentSession);
  assertSupportedClockIn(metadata);
  const payload = await buildClockInPayload(position);
  const result = await createClockIn(currentSession, payload, { dryRun: false });
  pushUpdate();

  return result;
});

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
    currentSession = session;
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
  electronSession.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = permission === 'geolocation' && webContents.getURL().startsWith('file://');
    console.log('[location] Pedido de permissão:', permission, webContents.getURL(), allowed ? 'permitido' : 'negado');
    callback(allowed);
  });

  electronSession.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const url = webContents?.getURL() ?? '';
    const allowed = permission === 'geolocation' && url.startsWith('file://');
    if (permission === 'geolocation') {
      console.log('[location] Verificação de permissão:', url, allowed ? 'permitido' : 'negado');
    }
    return allowed;
  });

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
  currentSession = session;

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
