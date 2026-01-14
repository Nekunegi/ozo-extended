/**
 * 設定管理モジュール
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_CONFIG } = require('../../shared/constants');

class ConfigManager {
    constructor() {
        this.configPath = path.join(app.getPath('userData'), 'config.json');
    }

    /**
     * 設定を読み込む
     * @returns {Object} 設定オブジェクト
     */
    load() {
        try {
            if (fs.existsSync(this.configPath)) {
                const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
                return { ...DEFAULT_CONFIG, ...config };
            }
        } catch (e) {
            console.error('Config load error:', e);
        }
        return { ...DEFAULT_CONFIG };
    }

    /**
     * 設定を保存する
     * @param {Object} config - 保存する設定
     * @returns {Object} 結果オブジェクト { success: boolean, error?: string }
     */
    save(config) {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
            return { success: true };
        } catch (e) {
            console.error('Config save error:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * 設定が完了しているか確認
     * @returns {boolean}
     */
    isConfigured() {
        const config = this.load();
        return !!(
            config.USER_ID &&
            config.PASSWORD &&
            config.USER_ID.trim() !== '' &&
            config.PASSWORD.trim() !== ''
        );
    }

    /**
     * ヘッドレスモードが有効か
     * @returns {boolean}
     */
    isHeadless() {
        const config = this.load();
        return config.HEADLESS_MODE !== undefined ? config.HEADLESS_MODE : true;
    }

    /**
     * 自動起動が有効か
     * @returns {boolean}
     */
    isAutoLaunch() {
        const config = this.load();
        return config.AUTO_LAUNCH !== undefined ? config.AUTO_LAUNCH : true;
    }

    /**
     * 自動出勤が有効か
     * @returns {boolean}
     */
    isAutoClockIn() {
        const config = this.load();
        return config.AUTO_CLOCK_IN !== undefined ? config.AUTO_CLOCK_IN : false;
    }
}

// シングルトンインスタンス
const configManager = new ConfigManager();

module.exports = configManager;
