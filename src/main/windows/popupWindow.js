/**
 * ポップアップウィンドウ管理
 */
const { BrowserWindow } = require('electron');
const path = require('path');
const { WINDOW_SIZE } = require('../../shared/constants');

let popupWindow = null;

/**
 * ポップアップウィンドウを作成
 * @param {Electron.Tray} tray - トレイアイコン
 */
function createPopupWindow(tray) {
    if (popupWindow) {
        if (popupWindow.isVisible()) {
            popupWindow.hide();
        } else {
            showPopupWindow(tray);
        }
        return;
    }

    popupWindow = new BrowserWindow({
        width: WINDOW_SIZE.POPUP.width,
        height: WINDOW_SIZE.POPUP.height,
        frame: false,
        resizable: false,
        show: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    popupWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'popup', 'popup.html'));

    popupWindow.on('blur', () => {
        popupWindow.hide();
    });

    popupWindow.on('closed', () => {
        popupWindow = null;
    });
}

/**
 * ポップアップウィンドウを表示
 * @param {Electron.Tray} tray - トレイアイコン
 */
function showPopupWindow(tray) {
    if (!popupWindow) return;

    popupWindow.webContents.reload();

    const trayBounds = tray.getBounds();
    const windowBounds = popupWindow.getBounds();

    const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
    const y = Math.round(trayBounds.y - windowBounds.height - 4);

    popupWindow.setPosition(x, y);
    popupWindow.show();
    popupWindow.focus();
}

/**
 * ポップアップウィンドウを非表示
 */
function hidePopupWindow() {
    if (popupWindow) {
        popupWindow.hide();
    }
}

/**
 * ポップアップウィンドウを取得
 * @returns {BrowserWindow|null}
 */
function getPopupWindow() {
    return popupWindow;
}

module.exports = {
    createPopupWindow,
    showPopupWindow,
    hidePopupWindow,
    getPopupWindow
};
