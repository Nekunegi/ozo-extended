/**
 * 勤務情報キャッシュ管理サービス
 */
const { Mutex } = require('async-mutex');
const { TIME_CONSTANTS } = require('../../shared/constants');

// 状態管理
let workInfoCache = null;
let monthlyWorkHoursCache = null;
let fetchInterval = null;
let isProcessing = false;

const mutex = new Mutex();

/**
 * 処理中フラグを取得
 * @returns {boolean}
 */
function getIsProcessing() {
    return isProcessing;
}

/**
 * 処理中フラグを設定
 * @param {boolean} value
 */
function setIsProcessing(value) {
    isProcessing = value;
}

/**
 * Mutexを取得
 * @returns {Mutex}
 */
function getMutex() {
    return mutex;
}

/**
 * 勤務情報キャッシュを取得
 * @returns {Object|null}
 */
function getWorkInfoCache() {
    return workInfoCache;
}

/**
 * 勤務情報キャッシュを更新
 * @param {string|null} clockInTime - 出勤時刻
 * @param {string|null} clockOutTime - 退勤時刻
 * @param {Function} onUpdate - 更新後のコールバック（トレイアイコン更新用）
 */
function updateWorkInfoCache(clockInTime, clockOutTime, onUpdate = null) {
    if (!clockInTime) {
        workInfoCache = { clockedIn: false };
    } else {
        // 最低退勤時刻を計算
        const [hours, minutes] = clockInTime.split(':').map(Number);
        const clockInDate = new Date();
        clockInDate.setHours(hours, minutes, 0, 0);
        const minClockOutDate = new Date(clockInDate.getTime() + TIME_CONSTANTS.WORK_HOURS_PER_DAY);
        const minClockOutTime = `${String(minClockOutDate.getHours()).padStart(2, '0')}:${String(minClockOutDate.getMinutes()).padStart(2, '0')}`;

        workInfoCache = {
            clockedIn: true,
            clockInTime,
            clockOutTime,
            minClockOutTime,
            lastUpdated: new Date()
        };
    }

    if (onUpdate) {
        onUpdate(clockInTime, clockOutTime);
    }
}

/**
 * 月次労働時間キャッシュを取得
 * @returns {Object|null}
 */
function getMonthlyWorkHoursCache() {
    return monthlyWorkHoursCache;
}

/**
 * 月次労働時間キャッシュを設定
 * @param {Object|null} data
 */
function setMonthlyWorkHoursCache(data) {
    monthlyWorkHoursCache = data;
}

/**
 * バックグラウンドフェッチを開始
 * @param {Function} fetchFunction - 実行する関数
 */
function startBackgroundFetch(fetchFunction) {
    if (fetchInterval) clearInterval(fetchInterval);
    fetchInterval = setInterval(() => {
        fetchFunction();
    }, TIME_CONSTANTS.FETCH_INTERVAL_MS);
}

/**
 * バックグラウンドフェッチを停止
 */
function stopBackgroundFetch() {
    if (fetchInterval) {
        clearInterval(fetchInterval);
        fetchInterval = null;
    }
}

module.exports = {
    getIsProcessing,
    setIsProcessing,
    getMutex,
    getWorkInfoCache,
    updateWorkInfoCache,
    getMonthlyWorkHoursCache,
    setMonthlyWorkHoursCache,
    startBackgroundFetch,
    stopBackgroundFetch,
    clearWorkInfoCache
};

/**
 * 勤務情報キャッシュをクリア
 */
function clearWorkInfoCache() {
    workInfoCache = null;
    monthlyWorkHoursCache = null;
}
