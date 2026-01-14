/**
 * 出勤・退勤処理サービス
 */
const { Notification } = require('electron');
const configManager = require('../config/configManager');
const { checkNetworkConnection } = require('../utils/networkService');
const workInfoService = require('./workInfoService');

/**
 * 通知を表示（ウィンドウが表示されていない場合のみ）
 * @param {string} title - タイトル
 * @param {string} body - 本文
 * @param {Function} getPopupWindow - ポップアップウィンドウ取得関数
 */
function showNotification(title, body, getPopupWindow = null) {
    if (getPopupWindow) {
        const popupWindow = getPopupWindow();
        if (popupWindow && popupWindow.isVisible() && !popupWindow.isMinimized()) {
            return;
        }
    }
    new Notification({ title, body }).show();
}

/**
 * 出勤処理
 * @param {Object} ozo3 - ManageOZO3インスタンス
 * @param {Function} onTrayUpdate - トレイアイコン更新コールバック
 * @param {Function} getPopupWindow - ポップアップウィンドウ取得関数
 * @returns {Promise<Object>} 結果オブジェクト
 */
async function handleClockIn(ozo3, onTrayUpdate, getPopupWindow = null) {
    const mutex = workInfoService.getMutex();

    if (workInfoService.getIsProcessing() || mutex.isLocked()) {
        showNotification('ozo:extended', '他の処理が実行中です。しばらくお待ちください。', getPopupWindow);
        return { success: false, message: '他の処理が実行中です。' };
    }

    // ネットワーク接続チェック
    const isOnline = await checkNetworkConnection();
    if (!isOnline) {
        showNotification('ozo:extended', 'ネットワークに接続されていません。', getPopupWindow);
        return { success: false, message: 'ネットワークに接続されていません。インターネット接続を確認してください。' };
    }

    const release = await mutex.acquire();
    try {
        workInfoService.setIsProcessing(true);
        showNotification('ozo:extended', '出勤処理を開始します...', getPopupWindow);

        const headless = configManager.isHeadless();
        await ozo3.launch(headless);
        await ozo3.login();
        const result = await ozo3.clockIn();

        // 最新情報を取得してキャッシュ更新
        try {
            const clockInTime = await ozo3.getClockInTime();
            const clockOutTime = await ozo3.getClockOutTime();
            workInfoService.updateWorkInfoCache(clockInTime, clockOutTime, onTrayUpdate);
        } catch (e) {
            console.error('Info update failed:', e);
        }

        showNotification('ozo:extended', result.message, getPopupWindow);
        return result;
    } catch (error) {
        console.error('出勤処理エラー:', error);
        showNotification('ozo:extended', '出勤処理に失敗しました: ' + error.message, getPopupWindow);
        return { success: false, message: 'エラー: ' + error.message };
    } finally {
        if (ozo3) await ozo3.close();
        workInfoService.setIsProcessing(false);
        release();
    }
}

/**
 * 退勤処理
 * @param {Object} ozo3 - ManageOZO3インスタンス
 * @param {boolean} autoManHour - 工数自動入力するか
 * @param {Function} onTrayUpdate - トレイアイコン更新コールバック
 * @param {Function} getPopupWindow - ポップアップウィンドウ取得関数
 * @returns {Promise<Object>} 結果オブジェクト
 */
async function handleClockOut(ozo3, autoManHour = false, onTrayUpdate, getPopupWindow = null) {
    const mutex = workInfoService.getMutex();

    if (workInfoService.getIsProcessing() || mutex.isLocked()) {
        showNotification('ozo:extended', '他の処理が実行中です。しばらくお待ちください。', getPopupWindow);
        return { success: false, message: '他の処理が実行中です。' };
    }

    // ネットワーク接続チェック
    const isOnline = await checkNetworkConnection();
    if (!isOnline) {
        showNotification('ozo:extended', 'ネットワークに接続されていません。', getPopupWindow);
        return { success: false, message: 'ネットワークに接続されていません。インターネット接続を確認してください。' };
    }

    const release = await mutex.acquire();
    try {
        workInfoService.setIsProcessing(true);
        const modeText = autoManHour ? '退勤・工数自動入力処理' : '退勤・工数入力処理';
        showNotification('ozo:extended', `${modeText}を開始します...`, getPopupWindow);

        const headless = configManager.isHeadless();
        await ozo3.launch(headless);
        await ozo3.login();

        // 強制工数入力モードは常にON
        const forceManHour = true;
        const result = await ozo3.clockOut(forceManHour, autoManHour);

        // 最新情報を取得してキャッシュ更新
        try {
            const clockInTime = await ozo3.getClockInTime();
            const clockOutTime = await ozo3.getClockOutTime();
            workInfoService.updateWorkInfoCache(clockInTime, clockOutTime, onTrayUpdate);

            // 月次労働時間キャッシュをクリア
            workInfoService.setMonthlyWorkHoursCache(null);
        } catch (e) {
            console.error('Info update failed:', e);
        }

        showNotification('ozo:extended', result.message, getPopupWindow);
        return result;
    } catch (error) {
        console.error('退勤処理エラー:', error);
        showNotification('ozo:extended', '退勤処理に失敗しました: ' + error.message, getPopupWindow);
        return { success: false, message: 'エラー: ' + error.message };
    } finally {
        if (ozo3) await ozo3.close();
        workInfoService.setIsProcessing(false);
        release();
    }
}

/**
 * 勤務情報を取得
 * @param {Object} ozo3 - ManageOZO3インスタンス
 * @param {Function} onTrayUpdate - トレイアイコン更新コールバック
 * @returns {Promise<Object|null>}
 */
async function fetchWorkInfo(ozo3, onTrayUpdate) {
    const mutex = workInfoService.getMutex();

    if (workInfoService.getIsProcessing()) return workInfoService.getWorkInfoCache();
    if (mutex.isLocked()) return workInfoService.getWorkInfoCache();

    const release = await mutex.acquire();
    workInfoService.setIsProcessing(true);

    try {
        if (!configManager.isConfigured()) return null;

        const headless = configManager.isHeadless();
        await ozo3.launch(headless);
        await ozo3.login();
        const clockInTime = await ozo3.getClockInTime();
        const clockOutTime = await ozo3.getClockOutTime();

        await ozo3.close();

        workInfoService.updateWorkInfoCache(clockInTime, clockOutTime, onTrayUpdate);
        return workInfoService.getWorkInfoCache();
    } catch (error) {
        console.error('Background fetch error:', error);
        if (ozo3) await ozo3.close();
        return { error: error.message };
    } finally {
        workInfoService.setIsProcessing(false);
        release();
    }
}

/**
 * 月次労働時間を取得
 * @param {Object} ozo3 - ManageOZO3インスタンス
 * @returns {Promise<Object|null>}
 */
async function fetchMonthlyWorkHours(ozo3) {
    const mutex = workInfoService.getMutex();

    if (workInfoService.getIsProcessing() || mutex.isLocked()) {
        return workInfoService.getMonthlyWorkHoursCache();
    }

    const release = await mutex.acquire();
    try {
        workInfoService.setIsProcessing(true);

        if (!configManager.isConfigured()) return null;

        const headless = configManager.isHeadless();
        await ozo3.launch(headless);
        await ozo3.login();
        const result = await ozo3.getMonthlyWorkHours();
        await ozo3.close();

        workInfoService.setMonthlyWorkHoursCache(result);
        return result;
    } catch (error) {
        console.error('月次情報取得エラー:', error);
        if (ozo3) await ozo3.close();
        return null;
    } finally {
        workInfoService.setIsProcessing(false);
        release();
    }
}

module.exports = {
    showNotification,
    handleClockIn,
    handleClockOut,
    fetchWorkInfo,
    fetchMonthlyWorkHours
};
