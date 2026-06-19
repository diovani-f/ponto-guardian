import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ponto', {
  getSummary: () => ipcRenderer.invoke('get-summary'),
  onUpdate: (cb: (data: unknown) => void) => ipcRenderer.on('update', (_e, data) => cb(data)),
  hide: () => ipcRenderer.send('hide-widget'),
  openSettings: () => ipcRenderer.send('open-settings'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  captureBrowserPosition: () => ipcRenderer.invoke('capture-browser-position'),
  getSystemPosition: () => ipcRenderer.invoke('get-system-position'),
  getApproximatePosition: () => ipcRenderer.invoke('get-approximate-position'),
  clockIn: (position: unknown) => ipcRenderer.invoke('clock-in', position),
  saveSettings: (s: unknown) => ipcRenderer.invoke('save-settings', s),
  closeSettings: () => ipcRenderer.send('close-settings'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),
  onFlash: (cb: (msg: string) => void) => ipcRenderer.on('flash', (_e, msg) => cb(msg)),
  testNotif: (type: string) => ipcRenderer.send('test-notification', type),
});
