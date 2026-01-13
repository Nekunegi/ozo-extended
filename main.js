const { app, Tray, Menu, nativeImage, Notification, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, execFileSync } = require('child_process');
const ManageOZO3 = require('./manageOZO3');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// 詳細なログを出力
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Windows コンソールでUTF-8を使用するための設定
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 失敗しても続行
  }
}

// Playwrightのブラウザがインストールされているか確認し、なければインストール
async function ensurePlaywrightBrowsers() {
  try {
    // Playwrightのchromiumパスを取得
    const { chromium } = require('playwright');
    const executablePath = chromium.executablePath();

    // ブラウザが存在するか確認
    if (fs.existsSync(executablePath)) {
      log.info('Playwright browser already installed at:', executablePath);
      return true;
    }

    log.info('Playwright browser not found at:', executablePath);
    log.info('Installing Playwright Chromium browser...');

    // Playwright の内部API を使用してブラウザをインストール
    // playwright/lib/server/registry を使用
    try {
      const { Registry } = require('playwright-core/lib/server/registry');
      const registry = new Registry(require('playwright-core').devices);

      // Chromiumのみをインストール
      await registry.install(['chromium'], false);

      log.info('Playwright browser installed successfully');
      return true;
    } catch (registryError) {
      log.warn('Registry API failed, trying CLI approach:', registryError.message);

      // フォールバック: playwright-core の cli を使う
      try {
        const playwrightCli = require.resolve('playwright-core/cli');

        // Node.jsの実行パスを取得
        const nodeExe = process.execPath;

        log.info('Using Node.js at:', nodeExe);
        log.info('Using Playwright CLI at:', playwrightCli);

        execFileSync(nodeExe, [playwrightCli, 'install', 'chromium'], {
          stdio: 'inherit',
          env: { ...process.env }
        });

        log.info('Playwright browser installed successfully via CLI');
        return true;
      } catch (cliError) {
        log.error('CLI install also failed:', cliError.message);
        return false;
      }
    }
  } catch (error) {
    log.error('Error checking/installing Playwright browser:', error);
    return false;
  }
}

let tray = null;
let popupWindow = null;
let settingsWindow = null;
let ozo3 = null;
let isProcessing = false;

// 勤務情報のキャッシュ
let workInfoCache = null;
let monthlyWorkHoursCache = null;
let fetchInterval = null;

const FETCH_INTERVAL_MS = 30 * 60 * 1000; // 30分ごとに更新

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// 多重起動防止
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 2つ目のインスタンスが起動された時、ポップアップを表示
    if (popupWindow) {
      showPopupWindow();
    } else {
      createPopupWindow();
      showPopupWindow();
    }

    // 設定画面が開いていればフォーカス
    if (settingsWindow) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.focus();
    }
  });
}

// 設定ファイルを読み込み
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Config load error:', e);
  }
  return { USER_ID: '', PASSWORD: '' };
}

// 設定ファイルを保存
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (e) {
    console.error('Config save error:', e);
    return { success: false, error: e.message };
  }
}

function createPopupWindow() {
  // 既にウィンドウがあれば表示/非表示を切り替え
  if (popupWindow) {
    if (popupWindow.isVisible()) {
      popupWindow.hide();
    } else {
      showPopupWindow();
    }
    return;
  }

  // ポップアップウィンドウを作成
  popupWindow = new BrowserWindow({
    width: 220,
    height: 220,
    frame: false,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  popupWindow.loadFile('popup.html');

  // フォーカスが外れたら非表示
  popupWindow.on('blur', () => {
    popupWindow.hide();
  });

  popupWindow.on('closed', () => {
    popupWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 280,
    height: 550,
    backgroundColor: '#1a1a2e',
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile('settings.html');

  // トレイアイコンの近く（右下・画面右端）に表示
  if (tray) {
    const trayBounds = tray.getBounds();
    const windowBounds = settingsWindow.getBounds();

    // トレイアイコンの中央に合わせて表示（元に戻す）
    const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
    const y = Math.round(trayBounds.y - windowBounds.height - 4);

    settingsWindow.setPosition(x, y);
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function showPopupWindow() {
  if (!popupWindow) return;

  // 設定状態を更新するためにリロード
  popupWindow.webContents.reload();

  // トレイアイコンの位置を取得してその近くに表示
  const trayBounds = tray.getBounds();
  const windowBounds = popupWindow.getBounds();

  // Windowsではトレイは右下にあるので、ウィンドウをその上に配置
  const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
  const y = Math.round(trayBounds.y - windowBounds.height - 4);

  popupWindow.setPosition(x, y);
  popupWindow.show();
  popupWindow.focus();
}

function showNotification(title, body) {
  if (popupWindow && popupWindow.isVisible() && !popupWindow.isMinimized()) {
    return;
  }
  new Notification({ title, body }).show();
}

app.whenReady().then(async () => {
  // Playwrightのブラウザがインストールされているか確認し、なければインストール
  await ensurePlaywrightBrowsers();

  setupAutoUpdater();
  autoUpdater.checkForUpdatesAndNotify();

  // 自動起動設定の同期
  const config = loadConfig();
  const autoLaunch = config.AUTO_LAUNCH !== undefined ? config.AUTO_LAUNCH : true;
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: autoLaunch,
      path: app.getPath('exe')
    });
  }

  // アイコンを読み込み（32x32で高品質に）
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });

  tray = new Tray(icon);
  tray.setToolTip('ozo:extended - 出勤管理');

  // ManageOZO3インスタンス作成
  ozo3 = new ManageOZO3();

  // 右クリックメニュー
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '⚙️ 設定',
      click: () => {
        createSettingsWindow();
      }
    },
    {
      type: 'separator'
    },
    {
      label: '❌ 終了',
      click: () => {
        if (ozo3) ozo3.close();
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);

  // 左クリックでポップアップを表示
  tray.on('click', () => {
    createPopupWindow();
    showPopupWindow();
  });

  // IPC イベントハンドラ
  ipcMain.handle('clock-in', async () => {
    // 処理中は閉じない
    return await handleClockIn();
  });

  ipcMain.handle('clock-out', async () => {
    // 処理中は閉じない
    return await handleClockOut(false);
  });

  ipcMain.handle('clock-out-with-auto-man-hour', async () => {
    // 工数自動入力付き退勤
    return await handleClockOut(true);
  });

  ipcMain.on('close-popup', () => {
    if (popupWindow) popupWindow.hide();
  });

  ipcMain.on('open-settings', () => {
    if (popupWindow) popupWindow.hide();
    createSettingsWindow();
  });

  ipcMain.on('close-settings', () => {
    if (settingsWindow) settingsWindow.close();
  });

  ipcMain.on('open-manage-ozo3', () => {
    if (popupWindow) popupWindow.hide();
    shell.openExternal('https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer');
  });

  // 設定の読み込み・保存
  ipcMain.handle('get-config', () => {
    return loadConfig();
  });

  ipcMain.handle('save-config', (event, config) => {
    // 自動起動設定を反映
    const autoLaunch = config.AUTO_LAUNCH !== undefined ? config.AUTO_LAUNCH : true;
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: autoLaunch,
        path: app.getPath('exe')
      });
    }

    const result = saveConfig(config);
    if (result.success) {
      // 設定保存後に定期実行を再スケジュール
      startBackgroundFetch();
    }
    return result;
  });

  ipcMain.handle('is-configured', () => {
    const config = loadConfig();
    return config.USER_ID && config.PASSWORD &&
      config.USER_ID.trim() !== '' &&
      config.PASSWORD.trim() !== '';
  });

  ipcMain.handle('test-login', async (event, userId, password) => {
    if (!userId || !password) {
      return { success: false, message: 'メールアドレスとパスワードを入力してください。' };
    }

    const { chromium } = require('playwright');
    let browser = null;

    try {
      const config = loadConfig();
      const headless = config.HEADLESS_MODE !== undefined ? config.HEADLESS_MODE : true;

      // 新しいブラウザを起動（Cookieなし）
      browser = await chromium.launch({
        headless: headless,
        slowMo: 100
      });

      // 新しいコンテキストを作成（storageStateなし = Cookieなし）
      const context = await browser.newContext();
      const page = await context.newPage();

      console.log('ログインテスト: ページを開きます...');
      await page.goto('https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer');
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(2000);

      // ログイン画面かどうか確認
      if (!page.url().includes('login.microsoftonline.com')) {
        await browser.close();
        return { success: false, message: '予期しない画面です。OZOのURLを確認してください。' };
      }

      // Step 1: USER_ID入力
      console.log('ログインテスト: USER_ID入力...');
      await page.waitForSelector('#i0116', { timeout: 30000 });
      await page.fill('#i0116', userId);
      await page.click('#idSIButton9');
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(2000);

      // Step 2: PASSWORD入力
      console.log('ログインテスト: PASSWORD入力...');
      try {
        await page.waitForSelector('#i0118', { timeout: 10000 });
        await page.fill('#i0118', password);
        await page.click('#idSIButton9');
        await page.waitForLoadState('networkidle');
      } catch (e) {
        await browser.close();
        return { success: false, message: 'パスワード入力画面が表示されませんでした。メールアドレスを確認してください。' };
      }

      // エラーメッセージがあるかチェック
      await page.waitForTimeout(2000);

      // パスワードエラーの確認
      const errorVisible = await page.isVisible('#passwordError');
      if (errorVisible) {
        const errorText = await page.textContent('#passwordError');
        await browser.close();
        return { success: false, message: 'パスワードが正しくありません。' };
      }

      // アカウントエラーの確認
      const accountError = await page.isVisible('#usernameError');
      if (accountError) {
        await browser.close();
        return { success: false, message: 'アカウントが見つかりません。' };
      }

      // Step 3: "サインインの状態を維持しますか?"
      try {
        const confirmBtn = await page.waitForSelector('#idSIButton9', { timeout: 5000 });
        if (confirmBtn) {
          await confirmBtn.click();
          await page.waitForLoadState('networkidle');
        }
      } catch (e) {
        // 画面が出なかった場合は続行
      }

      // OZO画面に到達したか確認
      await page.waitForTimeout(2000);
      const currentUrl = page.url();

      await browser.close();

      if (currentUrl.includes('manage.ozo-cloud.jp') && !currentUrl.includes('login.microsoftonline.com')) {
        return { success: true, message: 'ログイン成功！認証情報は正しいです。' };
      } else {
        return { success: false, message: 'ログインに失敗しました。認証情報を確認してください。' };
      }
    } catch (error) {
      console.error('Login test error:', error);
      if (browser) await browser.close();
      return { success: false, message: 'ログインテストエラー: ' + error.message };
    }
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
      return { success: false, message: '開発環境ではアップデート確認できません。' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo.version !== app.getVersion()) {
        return { success: true, updateAvailable: true, version: result.updateInfo.version, message: `新しいバージョン (v${result.updateInfo.version}) が利用可能です。` };
      } else {
        return { success: true, updateAvailable: false, message: '最新バージョンです。' };
      }
    } catch (e) {
      return { success: false, message: '確認エラー: ' + e.message };
    }
  });

  ipcMain.handle('get-work-info', async () => {
    let info = workInfoCache;

    // キャッシュがない、またはキャッシュが古くて再取得中の場合はfetch待ちたいところだが、
    // 即レスポンスするためにキャッシュがあれば返しつつ処理中フラグを立てる

    if (!info) {
      // キャッシュすらない場合は取得トライ（awaitする）
      info = await fetchWorkInfo();
    }

    return {
      ...info,
      isProcessing: isProcessing // 現在バックグラウンドで処理中かどうか
    };
  });

  // 月次労働時間情報を取得
  ipcMain.handle('get-monthly-work-hours', async () => {
    // キャッシュがあれば返す
    if (monthlyWorkHoursCache) {
      return monthlyWorkHoursCache;
    }

    if (isProcessing || mutex.isLocked()) {
      return null; // 処理中なら実行しない
    }

    return await fetchMonthlyWorkHours();
  });

  // 初回起動時の背景取得開始
  startBackgroundFetch();
  // 初回即時実行（設定済みなら）
  const startupConfig = loadConfig();
  if (startupConfig.USER_ID && startupConfig.PASSWORD) {
    if (startupConfig.AUTO_CLOCK_IN) {
      // 自動出勤がONなら出勤処理を実行（月次情報も取得）
      handleClockIn().then(() => fetchMonthlyWorkHours());
    } else {
      // OFFなら情報取得のみ（月次情報も取得）
      fetchWorkInfo().then(() => fetchMonthlyWorkHours());
    }
  }
});

// 月次労働時間を取得してキャッシュする
async function fetchMonthlyWorkHours() {
  if (isProcessing || mutex.isLocked()) {
    return monthlyWorkHoursCache;
  }

  const release = await mutex.acquire();
  try {
    isProcessing = true;
    const config = loadConfig();
    if (!config.USER_ID || !config.PASSWORD) return null;

    const headless = config.HEADLESS_MODE !== undefined ? config.HEADLESS_MODE : true;
    await ozo3.launch(headless);
    await ozo3.login();
    const result = await ozo3.getMonthlyWorkHours();
    await ozo3.close();
    monthlyWorkHoursCache = result;
    return result;
  } catch (error) {
    console.error('月次情報取得エラー:', error);
    if (ozo3) await ozo3.close();
    return null;
  } finally {
    isProcessing = false;
    release();
  }
}

// バックグラウンドで勤務情報を取得
const { Mutex } = require('async-mutex');
const mutex = new Mutex();

function updateWorkInfoCache(clockInTime, clockOutTime) {
  if (!clockInTime) {
    workInfoCache = { clockedIn: false };
  } else {
    // 最低退勤時刻を計算
    const [hours, minutes] = clockInTime.split(':').map(Number);
    const clockInDate = new Date();
    clockInDate.setHours(hours, minutes, 0, 0);
    const minClockOutDate = new Date(clockInDate.getTime() + 9 * 60 * 60 * 1000);
    const minClockOutTime = `${String(minClockOutDate.getHours()).padStart(2, '0')}:${String(minClockOutDate.getMinutes()).padStart(2, '0')}`;

    workInfoCache = {
      clockedIn: true,
      clockInTime,
      clockOutTime,
      minClockOutTime,
      lastUpdated: new Date()
    };
  }
  updateTrayIcon(clockInTime, clockOutTime);
}

function updateTrayIcon(clockInTime, clockOutTime) {
  if (!tray) return;

  // 赤色にする条件: 未出勤 (!clockInTime) OR 退勤済み (clockOutTime)
  const useRedIcon = !clockInTime || !!clockOutTime;

  const iconName = useRedIcon ? 'icon_red.png' : 'icon.png';
  const iconPath = path.join(__dirname, iconName);

  // サイズ統一のためにリサイズ
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
  tray.setImage(icon);
}

async function fetchWorkInfo() {
  if (isProcessing) return workInfoCache; // 処理中なら既存キャッシュまたはnull

  // ロックを取得できた場合のみ実行、できなければスキップ
  if (mutex.isLocked()) return workInfoCache;

  const release = await mutex.acquire();
  isProcessing = true;

  try {
    const config = loadConfig();
    if (!config.USER_ID || !config.PASSWORD) return null;

    // console.log('Fetching work info in background...');
    const headless = config.HEADLESS_MODE !== undefined ? config.HEADLESS_MODE : true;
    await ozo3.launch(headless);
    await ozo3.login();
    const clockInTime = await ozo3.getClockInTime();
    const clockOutTime = await ozo3.getClockOutTime();

    await ozo3.close();

    updateWorkInfoCache(clockInTime, clockOutTime);
    return workInfoCache;
  } catch (error) {
    console.error('Background fetch error:', error);
    if (ozo3) await ozo3.close();
    return { error: error.message };
  } finally {
    isProcessing = false;
    release();
  }
}

function startBackgroundFetch() {
  if (fetchInterval) clearInterval(fetchInterval);
  fetchInterval = setInterval(() => {
    fetchWorkInfo();
  }, FETCH_INTERVAL_MS);
}

async function handleClockIn() {
  if (isProcessing || mutex.isLocked()) {
    showNotification('ozo:extended', '他の処理が実行中です。しばらくお待ちください。');
    return;
  }

  const release = await mutex.acquire();
  try {
    isProcessing = true;
    showNotification('ozo:extended', '出勤処理を開始します...');

    const config = loadConfig();
    const headless = config.HEADLESS_MODE !== undefined ? config.HEADLESS_MODE : true;
    await ozo3.launch(headless);
    await ozo3.login();
    const result = await ozo3.clockIn();

    // 最新情報を取得してキャッシュ更新
    try {
      const clockInTime = await ozo3.getClockInTime();
      const clockOutTime = await ozo3.getClockOutTime();
      updateWorkInfoCache(clockInTime, clockOutTime);
    } catch (e) {
      console.error('Info update failed:', e);
    }

    if (result.success) {
      showNotification('ozo:extended', result.message);
    } else {
      showNotification('ozo:extended', result.message);
    }
    return result;
  } catch (error) {
    console.error('出勤処理エラー:', error);
    showNotification('ozo:extended', '出勤処理に失敗しました: ' + error.message);
    return { success: false, message: 'エラー: ' + error.message };
  } finally {
    if (ozo3) await ozo3.close();
    isProcessing = false;
    release();
  }
}

async function handleClockOut(autoManHour = false) {
  if (isProcessing || mutex.isLocked()) {
    showNotification('ozo:extended', '他の処理が実行中です。しばらくお待ちください。');
    return;
  }

  const release = await mutex.acquire();
  try {
    isProcessing = true;
    const modeText = autoManHour ? '退勤・工数自動入力処理' : '退勤・工数入力処理';
    showNotification('ozo:extended', `${modeText}を開始します...`);

    const config = loadConfig();
    const headless = config.HEADLESS_MODE !== undefined ? config.HEADLESS_MODE : true; // Default True
    await ozo3.launch(headless);
    await ozo3.login();
    // 強制工数入力モードは常にON
    const forceManHour = true;

    const result = await ozo3.clockOut(forceManHour, autoManHour);

    // 最新情報を取得してキャッシュ更新
    try {
      const clockInTime = await ozo3.getClockInTime();
      const clockOutTime = await ozo3.getClockOutTime();
      updateWorkInfoCache(clockInTime, clockOutTime);
    } catch (e) {
      console.error('Info update failed:', e);
    }

    if (result.success) {
      showNotification('ozo:extended', result.message);
    } else {
      showNotification('ozo:extended', result.message);
    }
    return result;
  } catch (error) {
    console.error('退勤処理エラー:', error);
    showNotification('ozo:extended', '退勤処理に失敗しました: ' + error.message);
    return { success: false, message: 'エラー: ' + error.message };
  } finally {
    if (ozo3) await ozo3.close();
    isProcessing = false;
    release();
  }
}

// ウィンドウがすべて閉じてもアプリを終了しない
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

function setupAutoUpdater() {
  const { dialog } = require('electron');

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
    // showNotification('ozo:extended', 'アップデートエラー: ' + err); // エラー通知はうるさいかもしれないのでログのみ
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
