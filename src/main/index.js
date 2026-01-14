/**
 * ozo:extended メインエントリーポイント
 * リファクタリング済みの新しいエントリーポイント
 */
const { app } = require('electron');
const { execSync } = require('child_process');

// Windows コンソールでUTF-8を使用するための設定
if (process.platform === 'win32') {
    try {
        execSync('chcp 65001', { stdio: 'ignore' });
    } catch (e) {
        // 失敗しても続行
    }
}

// モジュールのインポート
const configManager = require('./config/configManager');
const { ensurePlaywrightBrowsers } = require('./utils/playwrightInstaller');
const { createTray, updateTrayIcon, getTray } = require('./tray/trayManager');
const { createPopupWindow, showPopupWindow, hidePopupWindow, getPopupWindow } = require('./windows/popupWindow');
const { createSettingsWindow, closeSettingsWindow } = require('./windows/settingsWindow');
const { setupAutoUpdater, checkForUpdatesAndNotify } = require('./services/updateService');
const { registerIpcHandlers } = require('./ipc/ipcHandlers');
const workInfoService = require('./services/workInfoService');
const clockService = require('./services/clockService');
const ManageOZO3 = require('../ozo/ManageOZO3');

// OZO3インスタンス
let ozo3 = null;

// 多重起動防止
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        const popup = getPopupWindow();
        if (popup) {
            showPopupWindow(getTray());
        } else {
            createPopupWindow(getTray());
            showPopupWindow(getTray());
        }
    });
}

// メイン初期化
app.whenReady().then(async () => {
    // Playwrightブラウザの確認/インストール
    await ensurePlaywrightBrowsers();

    // 通知表示関数
    const showNotification = (title, body) => {
        clockService.showNotification(title, body, getPopupWindow);
    };

    // 自動アップデーターセットアップ
    setupAutoUpdater(showNotification);
    checkForUpdatesAndNotify();

    // 自動起動設定の同期
    const autoLaunch = configManager.isAutoLaunch();
    if (app.isPackaged) {
        app.setLoginItemSettings({
            openAtLogin: autoLaunch,
            path: app.getPath('exe')
        });
    }

    // ManageOZO3インスタンス作成
    ozo3 = new ManageOZO3();

    // トレイアイコン作成
    const tray = createTray({
        onClick: () => {
            createPopupWindow(getTray());
            showPopupWindow(getTray());
        },
        onSettingsClick: () => {
            createSettingsWindow(getTray());
        },
        onQuitClick: () => {
            if (ozo3) ozo3.close();
            app.quit();
        }
    });

    // 勤務情報取得関数
    const fetchWorkInfo = async () => {
        return await clockService.fetchWorkInfo(ozo3, updateTrayIcon);
    };

    // 月次情報取得関数
    const fetchMonthlyWorkHours = async () => {
        return await clockService.fetchMonthlyWorkHours(ozo3);
    };

    // IPCハンドラ登録
    registerIpcHandlers({
        ozo3,
        getTray: () => tray,
        getPopupWindow,
        hidePopupWindow,
        createSettingsWindow: (t) => createSettingsWindow(t || tray),
        closeSettingsWindow,
        onTrayUpdate: updateTrayIcon,
        onConfigSaved: () => {
            workInfoService.startBackgroundFetch(fetchWorkInfo);
        },
        fetchWorkInfo,
        fetchMonthlyWorkHours
    });

    // バックグラウンドフェッチ開始
    workInfoService.startBackgroundFetch(fetchWorkInfo);

    // 初回起動時の処理
    if (configManager.isConfigured()) {
        if (configManager.isAutoClockIn()) {
            // 自動出勤がONなら出勤処理を実行
            clockService.handleClockIn(ozo3, updateTrayIcon, getPopupWindow)
                .then(() => fetchMonthlyWorkHours());
        } else {
            // OFFなら情報取得のみ
            fetchWorkInfo().then(() => fetchMonthlyWorkHours());
        }
    }
});

// ウィンドウがすべて閉じてもアプリを終了しない
app.on('window-all-closed', (e) => {
    e.preventDefault();
});
