/**
 * 設定画面のJavaScript
 */

// DOM要素取得
const elements = {
    userId: () => document.getElementById('userId'),
    password: () => document.getElementById('password'),
    headlessMode: () => document.getElementById('headlessMode'),
    autoLaunch: () => document.getElementById('autoLaunch'),
    autoClockIn: () => document.getElementById('autoClockIn'),
    btnTestLogin: () => document.getElementById('btnTestLogin'),
    loginTestMessage: () => document.getElementById('loginTestMessage'),
    btnCheckUpdate: () => document.getElementById('btnCheckUpdate'),
    updateMessage: () => document.getElementById('updateMessage'),
    currentVersion: () => document.getElementById('currentVersion'),
    message: () => document.getElementById('message')
};

/**
 * ログインテスト
 */
async function testLogin() {
    const userId = elements.userId().value.trim();
    const password = elements.password().value;
    const btn = elements.btnTestLogin();
    const msg = elements.loginTestMessage();

    if (!userId || !password) {
        msg.style.display = 'block';
        msg.textContent = 'メールアドレスとパスワードを入力してください';
        msg.style.color = '#ef4444';
        return;
    }

    btn.disabled = true;
    btn.textContent = '🔄 テスト中...';
    btn.style.opacity = '0.7';
    msg.style.display = 'none';

    try {
        const result = await window.electronAPI.testLogin(userId, password);

        msg.style.display = 'block';
        if (result.success) {
            msg.textContent = result.message;
            msg.style.color = '#22c55e';
        } else {
            msg.textContent = result.message;
            msg.style.color = '#ef4444';
        }
    } catch (e) {
        msg.style.display = 'block';
        msg.textContent = 'エラーが発生しました: ' + e.message;
        msg.style.color = '#ef4444';
    } finally {
        btn.disabled = false;
        btn.textContent = '🔐 ログインテスト';
        btn.style.opacity = '1';
    }
}

/**
 * 設定を保存
 */
async function saveSettings() {
    const userId = elements.userId().value.trim();
    const password = elements.password().value;
    const headlessMode = elements.headlessMode().checked;
    const autoLaunch = elements.autoLaunch().checked;
    const autoClockIn = elements.autoClockIn().checked;
    const messageEl = elements.message();

    if (!userId || !password) {
        messageEl.textContent = 'MailとPasswordを入力してください';
        messageEl.className = 'message error';
        return;
    }

    const result = await window.electronAPI.saveConfig({
        USER_ID: userId,
        PASSWORD: password,
        HEADLESS_MODE: headlessMode,
        AUTO_LAUNCH: autoLaunch,
        AUTO_CLOCK_IN: autoClockIn
    });

    if (result.success) {
        messageEl.textContent = '保存しました！';
        messageEl.className = 'message success';
        setTimeout(() => {
            window.electronAPI.closeSettings();
        }, 1000);
    } else {
        messageEl.textContent = 'エラー: ' + result.error;
        messageEl.className = 'message error';
    }
}

/**
 * アップデート確認
 */
async function checkForUpdates() {
    const btn = elements.btnCheckUpdate();
    const msg = elements.updateMessage();

    btn.disabled = true;
    btn.textContent = '確認中...';
    btn.style.opacity = '0.7';
    msg.style.display = 'none';

    try {
        const result = await window.electronAPI.checkForUpdates();

        msg.style.display = 'block';
        if (result.success) {
            msg.textContent = result.message;
            msg.style.color = result.updateAvailable ? '#22c55e' : '#8892b0';
        } else {
            msg.textContent = result.message;
            msg.style.color = '#ef4444';
        }
    } catch (e) {
        msg.style.display = 'block';
        msg.textContent = 'エラーが発生しました';
        msg.style.color = '#ef4444';
    } finally {
        btn.disabled = false;
        btn.textContent = 'アップデートを確認';
        btn.style.opacity = '1';
    }
}

// グローバル関数として公開
window.testLogin = testLogin;
window.saveSettings = saveSettings;
window.checkForUpdates = checkForUpdates;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    // バージョン表示
    const version = await window.electronAPI.getAppVersion();
    elements.currentVersion().textContent = 'v' + version;

    // 設定を読み込んで表示
    const config = await window.electronAPI.getConfig();
    if (config) {
        elements.userId().value = config.USER_ID || '';
        elements.password().value = config.PASSWORD || '';
        elements.headlessMode().checked = config.HEADLESS_MODE !== undefined ? config.HEADLESS_MODE : true;
        elements.autoLaunch().checked = config.AUTO_LAUNCH !== undefined ? config.AUTO_LAUNCH : true;
        elements.autoClockIn().checked = config.AUTO_CLOCK_IN !== undefined ? config.AUTO_CLOCK_IN : false;
    }
});
