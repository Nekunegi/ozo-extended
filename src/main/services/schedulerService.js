/**
 * スケジューラーサービス
 * 日付変更時の処理などを管理
 */
const { powerMonitor } = require('electron');
const configManager = require('../config/configManager');
const workInfoService = require('./workInfoService');
const clockService = require('./clockService');
const JapaneseHolidays = require('japanese-holidays');

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
 * 自動出勤を実行すべきか判定
 * @returns {boolean}
 */
function shouldAutoClockIn() {
    const now = new Date();
    const day = now.getDay(); // 0: Sunday, 6: Saturday
    const hour = now.getHours();

    // 1. 土日のチェック
    if (day === 0 || day === 6) {
        console.log('Skipping auto clock-in: It is weekend.');
        return false;
    }

    // 2. 祝日のチェック
    const isHoliday = JapaneseHolidays.isHoliday(now);
    if (isHoliday) {
        console.log(`Skipping auto clock-in: It is holiday (${isHoliday}).`);
        return false;
    }

    // 3. 深夜・早朝のチェック (00:00 - 05:59)
    if (hour < 6) {
        console.log(`Skipping auto clock-in: It is too early (${hour}:00).`);
        return false;
    }

    return true;
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

    // 自動出勤設定の確認と条件チェック
    if (configManager.isAutoClockIn()) {
        if (shouldAutoClockIn()) {
            console.log('Auto clock-in triggered by daily reset.');
            clockService.handleClockIn(ozo3, onTrayUpdate, getPopupWindow)
                .then(() => {
                    if (fetchMonthlyWorkHours) fetchMonthlyWorkHours();
                });
        } else {
            console.log('Auto clock-in was restricted by schedule condition.');
        }
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
