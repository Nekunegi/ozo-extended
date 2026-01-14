/**
 * Preload スクリプト
 * レンダラープロセスとメインプロセスの間の安全な通信を提供
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 出勤・退勤
    clockIn: () => ipcRenderer.invoke('clock-in'),
    clockOut: () => ipcRenderer.invoke('clock-out'),
    clockOutWithAutoManHour: () => ipcRenderer.invoke('clock-out-with-auto-man-hour'),

    // ウィンドウ操作
    closeWindow: () => ipcRenderer.send('close-popup'),
    openSettings: () => ipcRenderer.send('open-settings'),
    closeSettings: () => ipcRenderer.send('close-settings'),
    openManageOZO3: () => ipcRenderer.send('open-manage-ozo3'),

    // 設定
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    isConfigured: () => ipcRenderer.invoke('is-configured'),

    // 勤務情報
    getWorkInfo: () => ipcRenderer.invoke('get-work-info'),
    getMonthlyWorkHours: () => ipcRenderer.invoke('get-monthly-work-hours'),

    // ユーティリティ
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    testLogin: (userId, password) => ipcRenderer.invoke('test-login', userId, password),
    checkNetwork: () => ipcRenderer.invoke('check-network')
});
