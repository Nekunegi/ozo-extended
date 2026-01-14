/**
 * 設定ウィンドウ管理
 */
const { BrowserWindow } = require('electron');
const path = require('path');
const { WINDOW_SIZE } = require('../../shared/constants');

let settingsWindow = null;

/**
 * 設定ウィンドウを作成
 * @param {Electron.Tray} tray - トレイアイコン
 */
function createSettingsWindow(tray) {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: WINDOW_SIZE.SETTINGS.width,
        height: WINDOW_SIZE.SETTINGS.height,
        backgroundColor: '#1a1a2e',
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    settingsWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'settings', 'settings.html'));

    // トレイアイコンの近くに表示
    if (tray) {
        const trayBounds = tray.getBounds();
        const windowBounds = settingsWindow.getBounds();

        const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
        const y = Math.round(trayBounds.y - windowBounds.height - 4);

        settingsWindow.setPosition(x, y);
    }

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

/**
 * 設定ウィンドウを閉じる
 */
function closeSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.close();
    }
}

/**
 * 設定ウィンドウを取得
 * @returns {BrowserWindow|null}
 */
function getSettingsWindow() {
    return settingsWindow;
}

module.exports = {
    createSettingsWindow,
    closeSettingsWindow,
    getSettingsWindow
};
