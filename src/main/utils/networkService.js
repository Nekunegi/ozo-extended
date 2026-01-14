/**
 * ネットワーク関連ユーティリティ
 */
const https = require('https');
const { TIME_CONSTANTS, OZO_URLS } = require('../../shared/constants');

/**
 * ネットワーク接続をチェック
 * @returns {Promise<boolean>} 接続可能かどうか
 */
async function checkNetworkConnection() {
    return new Promise((resolve) => {
        const req = https.get(OZO_URLS.LOGIN.replace('/ozo/default.cfm?version=fixer', ''), {
            timeout: TIME_CONSTANTS.NETWORK_TIMEOUT_MS
        }, (res) => {
            resolve(true);
        });

        req.on('error', () => {
            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

module.exports = {
    checkNetworkConnection
};
