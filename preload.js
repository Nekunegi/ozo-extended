const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    clockIn: () => ipcRenderer.invoke('clock-in'),
    clockOut: () => ipcRenderer.invoke('clock-out'),
    clockOutWithAutoManHour: () => ipcRenderer.invoke('clock-out-with-auto-man-hour'),
    closeWindow: () => ipcRenderer.send('close-popup'),
    openSettings: () => ipcRenderer.send('open-settings'),
    closeSettings: () => ipcRenderer.send('close-settings'),
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    isConfigured: () => ipcRenderer.invoke('is-configured'),
    openManageOZO3: () => ipcRenderer.send('open-manage-ozo3'),
    getWorkInfo: () => ipcRenderer.invoke('get-work-info'),
    getMonthlyWorkHours: () => ipcRenderer.invoke('get-monthly-work-hours'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    testLogin: (userId, password) => ipcRenderer.invoke('test-login', userId, password),
    checkNetwork: () => ipcRenderer.invoke('check-network')
});
