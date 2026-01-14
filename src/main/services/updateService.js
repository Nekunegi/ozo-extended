/**
 * 自動アップデートサービス
 */
const { autoUpdater } = require('electron-updater');
const { app } = require('electron');
const log = require('electron-log');

// ログ設定
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

/**
 * 自動アップデーターをセットアップ
 * @param {Function} showNotification - 通知表示関数
 */
function setupAutoUpdater(showNotification) {
    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Update available.');
        showNotification('ozo:extended', '新しいバージョンが見つかりました。ダウンロード中です...');
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('Update not available.');
    });

    autoUpdater.on('error', (err) => {
        log.error('Error in auto-updater. ' + err);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        let log_message = "Download speed: " + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
        log.info(log_message);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded');
        showNotification('ozo:extended', '新しいバージョンをインストールするため、3秒後に再起動します。');

        setTimeout(() => {
            autoUpdater.quitAndInstall();
        }, 3000);
    });
}

/**
 * アップデートを確認
 * @returns {Promise<Object>} 結果オブジェクト
 */
async function checkForUpdates() {
    if (!app.isPackaged) {
        return { success: false, message: '開発環境ではアップデート確認できません。' };
    }

    try {
        const result = await autoUpdater.checkForUpdates();
        if (result && result.updateInfo.version !== app.getVersion()) {
            return {
                success: true,
                updateAvailable: true,
                version: result.updateInfo.version,
                message: `新しいバージョン (v${result.updateInfo.version}) が利用可能です。`
            };
        } else {
            return { success: true, updateAvailable: false, message: '最新バージョンです。' };
        }
    } catch (e) {
        return { success: false, message: '確認エラー: ' + e.message };
    }
}

/**
 * アップデートを確認してインストール（通知付き）
 */
function checkForUpdatesAndNotify() {
    autoUpdater.checkForUpdatesAndNotify();
}

module.exports = {
    setupAutoUpdater,
    checkForUpdates,
    checkForUpdatesAndNotify
};
