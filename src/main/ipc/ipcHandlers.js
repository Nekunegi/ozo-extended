/**
 * IPCイベントハンドラ
 */
const { ipcMain, shell, app } = require('electron');
const configManager = require('../config/configManager');
const { checkNetworkConnection } = require('../utils/networkService');
const { checkForUpdates } = require('../services/updateService');
const workInfoService = require('../services/workInfoService');
const clockService = require('../services/clockService');

/**
 * IPCハンドラを登録
 * @param {Object} dependencies - 依存オブジェクト
 * @param {Object} dependencies.ozo3 - ManageOZO3インスタンス
 * @param {Function} dependencies.getTray - トレイ取得関数
 * @param {Function} dependencies.getPopupWindow - ポップアップウィンドウ取得関数
 * @param {Function} dependencies.hidePopupWindow - ポップアップウィンドウ非表示関数
 * @param {Function} dependencies.createSettingsWindow - 設定ウィンドウ作成関数
 * @param {Function} dependencies.closeSettingsWindow - 設定ウィンドウ閉じる関数
 * @param {Function} dependencies.onTrayUpdate - トレイアイコン更新コールバック
 * @param {Function} dependencies.onConfigSaved - 設定保存後のコールバック
 * @param {Function} dependencies.fetchWorkInfo - 勤務情報取得関数
 * @param {Function} dependencies.fetchMonthlyWorkHours - 月次情報取得関数
 */
function registerIpcHandlers(dependencies) {
    const {
        ozo3,
        getTray,
        getPopupWindow,
        hidePopupWindow,
        createSettingsWindow,
        closeSettingsWindow,
        onTrayUpdate,
        onConfigSaved,
        fetchWorkInfo,
        fetchMonthlyWorkHours
    } = dependencies;

    // 出勤処理
    ipcMain.handle('clock-in', async () => {
        return await clockService.handleClockIn(ozo3, onTrayUpdate, getPopupWindow);
    });

    // 退勤処理
    ipcMain.handle('clock-out', async () => {
        return await clockService.handleClockOut(ozo3, false, onTrayUpdate, getPopupWindow);
    });

    // 工数自動入力付き退勤
    ipcMain.handle('clock-out-with-auto-man-hour', async () => {
        return await clockService.handleClockOut(ozo3, true, onTrayUpdate, getPopupWindow);
    });

    // ポップアップを閉じる
    ipcMain.on('close-popup', () => {
        hidePopupWindow();
    });

    // 設定を開く
    ipcMain.on('open-settings', () => {
        hidePopupWindow();
        createSettingsWindow(getTray());
    });

    // 設定を閉じる
    ipcMain.on('close-settings', () => {
        closeSettingsWindow();
    });

    // ManageOZO3を開く
    ipcMain.on('open-manage-ozo3', () => {
        hidePopupWindow();
        shell.openExternal('https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer');
    });

    // 設定の読み込み
    ipcMain.handle('get-config', () => {
        return configManager.load();
    });

    // 設定の保存
    ipcMain.handle('save-config', (event, config) => {
        // 自動起動設定を反映
        const autoLaunch = config.AUTO_LAUNCH !== undefined ? config.AUTO_LAUNCH : true;
        if (app.isPackaged) {
            app.setLoginItemSettings({
                openAtLogin: autoLaunch,
                path: app.getPath('exe')
            });
        }

        const result = configManager.save(config);
        if (result.success && onConfigSaved) {
            onConfigSaved();
        }
        return result;
    });

    // 設定完了確認
    ipcMain.handle('is-configured', () => {
        return configManager.isConfigured();
    });

    // ネットワークチェック
    ipcMain.handle('check-network', async () => {
        return await checkNetworkConnection();
    });

    // ログインテスト
    ipcMain.handle('test-login', async (event, userId, password) => {
        return await testLogin(userId, password);
    });

    // アプリバージョン取得
    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    // アップデート確認
    ipcMain.handle('check-for-updates', async () => {
        return await checkForUpdates();
    });

    // 勤務情報取得
    ipcMain.handle('get-work-info', async () => {
        let info = workInfoService.getWorkInfoCache();

        if (!info) {
            info = await fetchWorkInfo();
        }

        return {
            ...info,
            isProcessing: workInfoService.getIsProcessing()
        };
    });

    // 月次労働時間取得
    ipcMain.handle('get-monthly-work-hours', async () => {
        const cache = workInfoService.getMonthlyWorkHoursCache();
        if (cache) {
            return cache;
        }

        if (workInfoService.getIsProcessing() || workInfoService.getMutex().isLocked()) {
            return null;
        }

        return await fetchMonthlyWorkHours();
    });
}

/**
 * ログインテスト
 * @param {string} userId - ユーザーID
 * @param {string} password - パスワード
 * @returns {Promise<Object>} 結果オブジェクト
 */
async function testLogin(userId, password) {
    if (!userId || !password) {
        return { success: false, message: 'メールアドレスとパスワードを入力してください。' };
    }

    const isOnline = await checkNetworkConnection();
    if (!isOnline) {
        return { success: false, message: 'ネットワークに接続されていません。インターネット接続を確認してください。' };
    }

    const { chromium } = require('playwright');
    let browser = null;

    try {
        const headless = configManager.isHeadless();

        browser = await chromium.launch({
            headless: headless,
            slowMo: 100
        });

        const context = await browser.newContext();
        const page = await context.newPage();

        console.log('ログインテスト: ページを開きます...');
        await page.goto('https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        if (!page.url().includes('login.microsoftonline.com')) {
            await browser.close();
            return { success: false, message: '予期しない画面です。OZOのURLを確認してください。' };
        }

        // USER_ID入力
        console.log('ログインテスト: USER_ID入力...');
        await page.waitForSelector('#i0116', { timeout: 30000 });
        await page.fill('#i0116', userId);
        await page.click('#idSIButton9');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // PASSWORD入力
        console.log('ログインテスト: PASSWORD入力...');
        try {
            await page.waitForSelector('#i0118', { timeout: 10000 });
            await page.fill('#i0118', password);
            await page.click('#idSIButton9');
            await page.waitForLoadState('networkidle');
        } catch (e) {
            await browser.close();
            return { success: false, message: 'パスワード入力画面が表示されませんでした。メールアドレスを確認してください。' };
        }

        await page.waitForTimeout(2000);

        // エラーチェック
        const errorVisible = await page.isVisible('#passwordError');
        if (errorVisible) {
            await browser.close();
            return { success: false, message: 'パスワードが正しくありません。' };
        }

        const accountError = await page.isVisible('#usernameError');
        if (accountError) {
            await browser.close();
            return { success: false, message: 'アカウントが見つかりません。' };
        }

        // 確認ボタン
        try {
            const confirmBtn = await page.waitForSelector('#idSIButton9', { timeout: 5000 });
            if (confirmBtn) {
                await confirmBtn.click();
                await page.waitForLoadState('networkidle');
            }
        } catch (e) {
            // 画面が出なかった場合は続行
        }

        await page.waitForTimeout(2000);
        const currentUrl = page.url();

        await browser.close();

        if (currentUrl.includes('manage.ozo-cloud.jp') && !currentUrl.includes('login.microsoftonline.com')) {
            return { success: true, message: 'ログイン成功！認証情報は正しいです。' };
        } else {
            return { success: false, message: 'ログインに失敗しました。認証情報を確認してください。' };
        }
    } catch (error) {
        console.error('Login test error:', error);
        if (browser) await browser.close();

        if (error.message.includes("Executable doesn't exist") || error.message.includes('browserType.launch')) {
            return {
                success: false,
                message: 'ブラウザがインストールされていません。\n\nコマンドプロンプトで以下を実行してください：\nnpx playwright install chromium\n\n実行後、アプリを再起動してください。'
            };
        }

        return { success: false, message: 'ログインテストエラー: ' + error.message };
    }
}

module.exports = {
    registerIpcHandlers
};
