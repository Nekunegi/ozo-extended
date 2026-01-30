/**
 * スケジューラーサービス
 * 日付変更時の処理などを管理
 */
const { powerMonitor } = require('electron');
const configManager = require('../config/configManager');
const workInfoService = require('./workInfoService');
const clockService = require('./clockService');

let dailyResetTimeout = null;
let lastCheckedDate = null; // YYYY-MM-DD

/**
 * 今日の日付を YYYY-MM-DD 形式で取得
 * @returns {string}
 */
function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 次の0時0分0秒までのミリ秒を取得
 * @returns {number}
 */
function getMillisecondsUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}

/**
 * 日次リセットを実行するか確認して実行
 */
async function checkDailyReset(ozo3, onTrayUpdate, getPopupWindow, fetchMonthlyWorkHours) {
    const today = getTodayDateString();

    // 日付が変わっていなければ何もしない
    if (lastCheckedDate === today) {
        return;
    }

    console.log(`Date changed detected: ${lastCheckedDate} -> ${today}`);
    lastCheckedDate = today;

    console.log('Executing daily reset...');

    // キャッシュクリア
    workInfoService.clearWorkInfoCache();

    // 勤務情報再取得（これにより「未出勤」状態になるはず）
    await clockService.fetchWorkInfo(ozo3, onTrayUpdate);

    // 月次情報も更新
    if (fetchMonthlyWorkHours) {
        await fetchMonthlyWorkHours();
    }

    // 自動出勤設定の確認
    if (configManager.isAutoClockIn()) {
        console.log('Auto clock-in triggered by daily reset.');
        clockService.handleClockIn(ozo3, onTrayUpdate, getPopupWindow)
            .then(() => {
                if (fetchMonthlyWorkHours) fetchMonthlyWorkHours();
            });
    }

    // 次の日次リセットをスケジュール
    scheduleNextReset(ozo3, onTrayUpdate, getPopupWindow, fetchMonthlyWorkHours);
}

/**
 * 次回のリセットをスケジュール
 */
function scheduleNextReset(ozo3, onTrayUpdate, getPopupWindow, fetchMonthlyWorkHours) {
    if (dailyResetTimeout) {
        clearTimeout(dailyResetTimeout);
    }

    const msUntilMidnight = getMillisecondsUntilMidnight();
    console.log(`Next daily reset scheduled in ${Math.floor(msUntilMidnight / 1000 / 60)} minutes.`);

    dailyResetTimeout = setTimeout(() => {
        checkDailyReset(ozo3, onTrayUpdate, getPopupWindow, fetchMonthlyWorkHours);
    }, msUntilMidnight + 1000);
}

/**
 * 日次リセット処理を開始
 * @param {Object} ozo3 - ManageOZO3インスタンス
 * @param {Function} onTrayUpdate - トレイアイコン更新コールバック
 * @param {Function} getPopupWindow - ポップアップウィンドウ取得関数
 * @param {Function} fetchMonthlyWorkHours - 月次情報取得関数
 */
function startDailyReset(ozo3, onTrayUpdate, getPopupWindow, fetchMonthlyWorkHours) {
    // 初期日付設定
    lastCheckedDate = getTodayDateString();

    // スリープ復帰時のイベントリスナー
    powerMonitor.on('resume', () => {
        console.log('System resumed. Checking for daily reset...');
        // 復帰直後はネットワークなどが安定しないことがあるので少し待つ
        setTimeout(() => {
            checkDailyReset(ozo3, onTrayUpdate, getPopupWindow, fetchMonthlyWorkHours);
        }, 5000);
    });

    // 初回のスケジュール
    scheduleNextReset(ozo3, onTrayUpdate, getPopupWindow, fetchMonthlyWorkHours);
}

module.exports = {
    startDailyReset
};
