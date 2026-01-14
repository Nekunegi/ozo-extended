# ozo:extended

出勤管理ツール「ozo:extended」は、OZO勤怠管理システムの操作を自動化するElectronアプリケーションです。

## プロジェクト構造

```
ozo-extended/
├── assets/                    # アセットファイル
│   ├── icon.png              # アプリアイコン
│   └── icon_red.png          # アプリアイコン（赤）
├── src/
│   ├── main/                      # メインプロセス
│   │   ├── index.js              # エントリーポイント
│   │   ├── config/
│   │   │   └── configManager.js  # 設定管理
│   │   ├── windows/
│   │   │   ├── popupWindow.js    # ポップアップウィンドウ
│   │   │   └── settingsWindow.js # 設定ウィンドウ
│   │   ├── tray/
│   │   │   └── trayManager.js    # トレイアイコン管理
│   │   ├── ipc/
│   │   │   └── ipcHandlers.js    # IPCイベントハンドラ
│   │   ├── services/
│   │   │   ├── clockService.js   # 出勤/退勤ビジネスロジック
│   │   │   ├── workInfoService.js # 勤務情報キャッシュ管理
│   │   │   └── updateService.js  # 自動アップデート
│   │   └── utils/
│   │       ├── networkService.js # ネットワーク関連
│   │       └── playwrightInstaller.js # Playwrightインストール
│   ├── ozo/
│   │   └── ManageOZO3.js         # OZO操作クラス
│   ├── renderer/
│   │   ├── popup/
│   │   │   ├── popup.html
│   │   │   ├── popup.css
│   │   │   └── popup.js
│   │   └── settings/
│   │       ├── settings.html
│   │       ├── settings.css
│   │       └── settings.js
│   ├── preload.js                 # Preloadスクリプト
│   └── shared/
│       └── constants.js          # 共通定数
├── package.json
└── README.md
```

## モジュール説明

### メインプロセス (`src/main/`)

| モジュール | 説明 |
|-----------|------|
| `index.js` | アプリケーションのエントリーポイント。各モジュールを統合して初期化 |
| `config/configManager.js` | 設定の読み込み・保存・状態確認を管理 |
| `windows/popupWindow.js` | メインポップアップウィンドウの作成・表示・非表示を管理 |
| `windows/settingsWindow.js` | 設定ウィンドウの作成・管理 |
| `tray/trayManager.js` | システムトレイアイコンとコンテキストメニューを管理 |
| `ipc/ipcHandlers.js` | レンダラープロセスとの通信（IPC）ハンドラを登録 |
| `services/clockService.js` | 出勤・退勤処理のビジネスロジック |
| `services/workInfoService.js` | 勤務情報のキャッシュと定期更新を管理 |
| `services/updateService.js` | 自動アップデート機能 |
| `utils/networkService.js` | ネットワーク接続チェック |
| `utils/playwrightInstaller.js` | Playwrightブラウザの自動インストール |

### OZO操作 (`src/ozo/`)

| モジュール | 説明 |
|-----------|------|
| `ManageOZO3.js` | Playwrightを使用してOZOシステムを操作するクラス |

### レンダラープロセス (`src/renderer/`)

| ファイル | 説明 |
|---------|------|
| `popup/popup.html` | ポップアップUIのHTML |
| `popup/popup.css` | ポップアップUIのスタイル |
| `popup/popup.js` | ポップアップUIのロジック |
| `settings/settings.html` | 設定画面のHTML |
| `settings/settings.css` | 設定画面のスタイル |
| `settings/settings.js` | 設定画面のロジック |

### 共有 (`src/shared/`)

| モジュール | 説明 |
|-----------|------|
| `constants.js` | URL、デフォルト設定、時間定数などの共通定数 |

## 開発

### 依存関係のインストール

```bash
npm install
```

### 開発モードで実行

```bash
npm start
```

### ビルド

```bash
npm run build
```

## 機能

- 🏢 ワンクリック出勤
- 🏠 ワンクリック退勤
- 📊 工数自動入力（前日のコピー）
- 📅 月次労働時間の表示
- ⏰ 残り時間カウントダウン
- 🔄 自動アップデート
- 🚀 PC起動時の自動起動
- 🤖 アプリ起動時の自動出勤

## ライセンス

MIT
