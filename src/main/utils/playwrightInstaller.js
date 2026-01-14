/**
 * Playwrightブラウザのインストール管理
 */
const fs = require('fs');
const log = require('electron-log');

/**
 * Playwrightブラウザがインストールされているか確認し、なければインストール
 * @returns {Promise<boolean>} インストール成功かどうか
 */
async function ensurePlaywrightBrowsers() {
    try {
        const { chromium } = require('playwright');
        const executablePath = chromium.executablePath();

        if (fs.existsSync(executablePath)) {
            log.info('Playwright browser already installed at:', executablePath);
            return true;
        }

        log.info('Playwright browser not found at:', executablePath);
        log.info('Installing Playwright Chromium browser...');

        const installed = await installPlaywrightBrowser();

        if (!installed) {
            const { dialog } = require('electron');
            await dialog.showMessageBox({
                type: 'error',
                title: 'ブラウザのインストールが必要です',
                message: 'Playwrightブラウザのインストールに失敗しました。\n\n以下のコマンドを手動で実行してください：\n\nnpx playwright install chromium\n\n実行後、アプリを再起動してください。',
                buttons: ['OK'],
                defaultId: 0
            });
            return false;
        }

        return true;
    } catch (error) {
        log.error('Error checking/installing Playwright browser:', error);
        return false;
    }
}

/**
 * Playwrightブラウザをインストール
 * @returns {Promise<boolean>} インストール成功かどうか
 */
async function installPlaywrightBrowser() {
    // 方法1: Playwrightの内部レジストリAPIを使用
    try {
        log.info('Trying Playwright internal registry API...');
        const { registry } = require('playwright-core/lib/server');
        const executable = registry.findExecutable('chromium');

        if (executable) {
            log.info('Found chromium executable descriptor, installing...');
            await registry.install([executable], false);
            log.info('Playwright browser installed successfully via registry API');
            return true;
        } else {
            log.warn('Could not find chromium executable in registry');
        }
    } catch (registryError) {
        log.warn('Registry API failed:', registryError.message);
    }

    // 方法2: 別の内部APIを試す
    try {
        log.info('Trying alternative Playwright API...');
        const { installBrowsersForNpmInstall } = require('playwright-core/lib/server');
        await installBrowsersForNpmInstall(['chromium']);
        log.info('Playwright browser installed successfully via installBrowsersForNpmInstall');
        return true;
    } catch (altError) {
        log.warn('Alternative API failed:', altError.message);
    }

    // 方法3: CLI を直接実行
    try {
        log.info('Trying CLI fallback...');
        const playwrightCli = require.resolve('playwright-core/cli');
        const nodeExe = process.execPath;

        log.info('Using Electron/Node.js at:', nodeExe);
        log.info('Using Playwright CLI at:', playwrightCli);

        const { spawn } = require('child_process');

        return new Promise((resolve) => {
            const child = spawn(nodeExe, [playwrightCli, 'install', 'chromium'], {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
                stdio: ['ignore', 'pipe', 'pipe']
            });

            child.stdout.on('data', (data) => {
                log.info('Install output:', data.toString());
            });

            child.stderr.on('data', (data) => {
                log.info('Install stderr:', data.toString());
            });

            child.on('close', (code) => {
                if (code === 0) {
                    log.info('Playwright browser installed successfully via CLI');
                    resolve(true);
                } else {
                    log.warn('CLI install failed with code:', code);
                    resolve(false);
                }
            });

            child.on('error', (err) => {
                log.warn('CLI spawn error:', err.message);
                resolve(false);
            });

            // 5分タイムアウト
            setTimeout(() => {
                if (!child.killed) {
                    child.kill();
                    log.warn('CLI install timed out');
                    resolve(false);
                }
            }, 300000);
        });
    } catch (cliError) {
        log.warn('CLI fallback failed:', cliError.message);
    }

    log.error('All installation methods failed');
    return false;
}

module.exports = {
    ensurePlaywrightBrowsers,
    installPlaywrightBrowser
};
