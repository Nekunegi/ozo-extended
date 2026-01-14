/**
 * トレイアイコン管理
 */
const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;

/**
 * トレイアイコンを作成
 * @param {Object} callbacks - コールバック関数オブジェクト
 * @param {Function} callbacks.onClick - 左クリック時のコールバック
 * @param {Function} callbacks.onSettingsClick - 設定クリック時のコールバック
 * @param {Function} callbacks.onQuitClick - 終了クリック時のコールバック
 * @returns {Electron.Tray}
 */
function createTray(callbacks) {
    // assetsディレクトリからアイコンを参照 (src/main/tray -> assets)
    const iconPath = path.join(__dirname, '..', '..', '..', 'assets', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });

    tray = new Tray(icon);
    tray.setToolTip('ozo:extended - 出勤管理');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '⚙️ 設定',
            click: callbacks.onSettingsClick
        },
        {
            type: 'separator'
        },
        {
            label: '❌ 終了',
            click: callbacks.onQuitClick
        }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', callbacks.onClick);

    return tray;
}

/**
 * トレイアイコンを更新
 * @param {string|null} clockInTime - 出勤時刻
 * @param {string|null} clockOutTime - 退勤時刻
 */
function updateTrayIcon(clockInTime, clockOutTime) {
    if (!tray) return;

    // 赤色にする条件: 未出勤 (!clockInTime) OR 退勤済み (clockOutTime)
    const useRedIcon = !clockInTime || !!clockOutTime;

    const iconName = useRedIcon ? 'icon_red.png' : 'icon.png';
    const iconPath = path.join(__dirname, '..', '..', '..', 'assets', iconName);

    const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
    tray.setImage(icon);
}

/**
 * トレイアイコンを取得
 * @returns {Electron.Tray|null}
 */
function getTray() {
    return tray;
}

module.exports = {
    createTray,
    updateTrayIcon,
    getTray
};
