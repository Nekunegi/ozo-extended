/**
 * Playwrightブラウザのインストール管理
 */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
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

        // インストールを試みる
        const installed = await installPlaywrightBrowser();

        if (!installed) {
            // インストール失敗時にダイアログを表示
            const { dialog, shell } = require('electron');
            const result = await dialog.showMessageBox({
                type: 'error',
                title: 'ブラウザのインストールが必要です',
                message: 'Playwrightブラウザの自動インストールに失敗しました。\n\n以下のいずれかの方法でインストールしてください：\n\n1. Node.jsをインストールして、コマンドプロンプトで以下を実行：\n   npx playwright install chromium\n\n2. Node.jsのインストールはこちら：\n   https://nodejs.org/\n\nインストール後、アプリを再起動してください。',
                buttons: ['Node.jsをダウンロード', '閉じる'],
                defaultId: 0
            });

            if (result.response === 0) {
                shell.openExternal('https://nodejs.org/');
            }

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
    // 方法1: Playwrightの内部レジストリAPIを使用（開発環境向け）
    if (await tryRegistryInstall()) {
        return true;
    }

    // 方法2: システムのnpxを使用（最も確実）
    if (await tryNpxInstall()) {
        return true;
    }

    // 方法3: Electronをノードとして使用してCLI実行
    if (await tryElectronNodeInstall()) {
        return true;
    }

    log.error('All installation methods failed');
    return false;
}

/**
 * Playwrightの内部レジストリAPIでインストール
 */
async function tryRegistryInstall() {
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

    // 別の内部APIを試す
    try {
        log.info('Trying alternative Playwright API...');
        const { installBrowsersForNpmInstall } = require('playwright-core/lib/server');
        await installBrowsersForNpmInstall(['chromium']);
        log.info('Playwright browser installed successfully via installBrowsersForNpmInstall');
        return true;
    } catch (altError) {
        log.warn('Alternative API failed:', altError.message);
    }

    return false;
}

/**
 * システムのnpxを使用してインストール（最も確実）
 */
async function tryNpxInstall() {
    log.info('Trying system npx install...');

    // npxが利用可能かチェック
    const npxPath = findNpxPath();
    if (!npxPath) {
        log.warn('npx not found in system PATH');
        return false;
    }

    log.info('Found npx at:', npxPath);

    return new Promise((resolve) => {
        const child = spawn(npxPath, ['playwright', 'install', 'chromium'], {
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env }
        });

        let output = '';

        child.stdout.on('data', (data) => {
            const str = data.toString();
            output += str;
            log.info('npx install output:', str);
        });

        child.stderr.on('data', (data) => {
            const str = data.toString();
            output += str;
            log.info('npx install stderr:', str);
        });

        child.on('close', (code) => {
            if (code === 0) {
                log.info('Playwright browser installed successfully via npx');
                resolve(true);
            } else {
                log.warn('npx install failed with code:', code);
                log.warn('Output:', output);
                resolve(false);
            }
        });

        child.on('error', (err) => {
            log.warn('npx spawn error:', err.message);
            resolve(false);
        });

        // 5分タイムアウト
        setTimeout(() => {
            if (!child.killed) {
                child.kill();
                log.warn('npx install timed out');
                resolve(false);
            }
        }, 300000);
    });
}

/**
 * npxのパスを探す
 */
function findNpxPath() {
    try {
        // Windowsの場合、where コマンドで探す
        if (process.platform === 'win32') {
            const result = execSync('where npx', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
            const paths = result.trim().split('\n');
            if (paths.length > 0) {
                return paths[0].trim();
            }
        } else {
            // Unix系の場合、which コマンドで探す
            const result = execSync('which npx', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
            return result.trim();
        }
    } catch (e) {
        log.warn('Failed to find npx:', e.message);
    }

    // 一般的なパスを試す
    const commonPaths = process.platform === 'win32'
        ? [
            path.join(process.env.APPDATA || '', 'npm', 'npx.cmd'),
            path.join(process.env.ProgramFiles || '', 'nodejs', 'npx.cmd'),
            'C:\\Program Files\\nodejs\\npx.cmd'
        ]
        : ['/usr/local/bin/npx', '/usr/bin/npx'];

    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    return null;
}

/**
 * Electronをノードとして使用してCLI実行
 */
async function tryElectronNodeInstall() {
    try {
        log.info('Trying Electron as Node fallback...');
        const playwrightCli = require.resolve('playwright-core/cli');
        const nodeExe = process.execPath;

        log.info('Using Electron/Node.js at:', nodeExe);
        log.info('Using Playwright CLI at:', playwrightCli);

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
                    log.info('Playwright browser installed successfully via Electron CLI');
                    resolve(true);
                } else {
                    log.warn('Electron CLI install failed with code:', code);
                    resolve(false);
                }
            });

            child.on('error', (err) => {
                log.warn('Electron CLI spawn error:', err.message);
                resolve(false);
            });

            // 5分タイムアウト
            setTimeout(() => {
                if (!child.killed) {
                    child.kill();
                    log.warn('Electron CLI install timed out');
                    resolve(false);
                }
            }, 300000);
        });
    } catch (cliError) {
        log.warn('Electron CLI fallback failed:', cliError.message);
        return false;
    }
}

module.exports = {
    ensurePlaywrightBrowsers,
    installPlaywrightBrowser
};
