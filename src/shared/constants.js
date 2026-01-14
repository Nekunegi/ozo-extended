/**
 * 共通定数
 */

// OZO関連URL
const OZO_URLS = {
    LOGIN: 'https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer',
    MAN_HOUR: 'https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer&app_cd=388&fuseaction=kos&today_open=1',
    MONTHLY: 'https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer&app_cd=329&fuseaction=knt'
};

// アプリ設定のデフォルト値
const DEFAULT_CONFIG = {
    USER_ID: '',
    PASSWORD: '',
    HEADLESS_MODE: true,
    AUTO_LAUNCH: true,
    AUTO_CLOCK_IN: false
};

// 時間関連定数
const TIME_CONSTANTS = {
    FETCH_INTERVAL_MS: 30 * 60 * 1000, // 30分
    NETWORK_TIMEOUT_MS: 5000,
    WORK_HOURS_PER_DAY: 9 * 60 * 60 * 1000, // 9時間（ミリ秒）
    BREAK_MINUTES: 60 // 休憩時間（分）
};

// ウィンドウサイズ
const WINDOW_SIZE = {
    POPUP: { width: 220, height: 220 },
    SETTINGS: { width: 280, height: 550 }
};

module.exports = {
    OZO_URLS,
    DEFAULT_CONFIG,
    TIME_CONSTANTS,
    WINDOW_SIZE
};
