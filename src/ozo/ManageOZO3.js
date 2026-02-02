/**
 * OZO ManageOZO3 操作クラス
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { OZO_URLS, TIME_CONSTANTS } = require('../shared/constants');

const STORAGE_STATE_PATH = path.join(app.getPath('userData'), 'session.json');

class ManageOZO3 {
    constructor() {
        this.context = null;
        this.page = null;
    }

    /**
     * 設定ファイルから認証情報を読み込み
     * @returns {Object} 認証情報
     */
    loadCredentials() {
        const configPath = path.join(app.getPath('userData'), 'config.json');
        if (!fs.existsSync(configPath)) {
            throw new Error('config.json が見つかりません。');
        }
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return config;
    }

    /**
     * ブラウザを起動 (Edge + Persistent Context)
     * @param {boolean} headless - ヘッドレスモード
     */
    async launch(headless = false) {
        const userDataDir = path.join(app.getPath('userData'), 'ozo_edge_session');

        // EdgeのUser Agent
        const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

        console.log(`Launching Edge with user data: ${userDataDir}`);

        this.context = await chromium.launchPersistentContext(userDataDir, {
            channel: 'msedge', // システムのEdgeを使用
            headless: headless,
            viewport: { width: 1280, height: 800 },
            userAgent: USER_AGENT,
            locale: 'ja-JP',
            slowMo: 100
        });

        // ページ取得（Persistent Contextはデフォルトで1ページ開くことが多い）
        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    }

    /**
     * ブラウザを閉じる
     */
    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
            this.page = null;
        }
    }

    /**
     * ログイン処理
     */
    async login() {
        const credentials = this.loadCredentials();

        console.log('ログインページを開きます...');
        await this.page.goto(OZO_URLS.LOGIN);
        await this.page.waitForLoadState('networkidle');

        // URLでログイン済みか判定
        // Edge SSOなどが効いている場合、リダイレクトですぐにログイン完了画面(OZOトップ)に行く可能性がある
        // OZOのURLドメイン内にいるかどうかで判断
        if (this.page.url().includes('manage.ozo-cloud.jp')) {
            // ログイン画面要素がないか確認する念押し
            const isLoginInputVisible = await this.page.isVisible('#i0116'); // setup selector
            if (!isLoginInputVisible) {
                console.log('既にログイン済みです (URL check passed)');
                return;
            }
        }

        // Microsoftログイン画面か確認
        if (!this.page.url().includes('login.microsoftonline.com')) {
            // 別ドメインだがOZOでもない場合...とりあえず続行してみるが、基本はOZOかMSのどちらか
            console.log('Current URL:', this.page.url());
        }

        // Step 1: USER_ID入力
        // セレクタが存在するか確認（SSOでスキップされている可能性）
        if (await this.page.isVisible('#i0116')) {
            console.log('USER_IDを入力します...');
            await this.page.fill('#i0116', credentials.USER_ID);
            await this.page.click('#idSIButton9');
            await this.page.waitForLoadState('networkidle');
        }

        // Step 2: PASSWORD入力
        if (await this.page.isVisible('#i0118')) {
            console.log('PASSWORDを入力します...');
            await this.page.fill('#i0118', credentials.PASSWORD);
            await this.page.click('#idSIButton9');
            await this.page.waitForLoadState('networkidle');
        }

        // Step 3: MFA / "サインインの状態を維持しますか?"
        // ここでMFAが来る場合、ユーザー操作が必要。
        // ヘッドレスでない場合、ユーザーが入力を完了するのを待つロジックが必要かもしれないが、
        // 現状は自動処理なので、MFAが来ないことを祈るか、MFA画面で止まる。

        // "サインインの状態を維持しますか?" が出た場合
        try {
            const confirmBtn = await this.page.waitForSelector('#idSIButton9', { state: 'visible', timeout: 5000 });
            if (confirmBtn) {
                console.log('維持確認ボタンを押します...');
                await confirmBtn.click();
                await this.page.waitForLoadState('networkidle');
            }
        } catch (e) {
            // タイムアウトは無視（画面が出なかった）
        }

        console.log('ログインシーケンス完了');
        // Persistent Contextなので保存処理は自動
    }

    /**
     * 打刻テーブルから出勤時刻を取得
     * @returns {string|null} 出勤時刻
     */
    async getClockInTime() {
        const clockInCell = await this.page.$('table.BaseDesign tbody tr:nth-child(3) td:nth-child(3)');
        if (!clockInCell) {
            return null;
        }
        const text = await clockInCell.textContent();
        const trimmed = text.trim().replace(/\s+/g, '');
        if (!trimmed || trimmed === '' || trimmed === '−' || trimmed === '-' || trimmed === '&nbsp;') {
            return null;
        }
        return trimmed;
    }

    /**
     * 打刻テーブルから退勤時刻を取得
     * @returns {string|null} 退勤時刻
     */
    async getClockOutTime() {
        const clockOutCell = await this.page.$('table.BaseDesign tbody tr:nth-child(3) td:nth-child(4)');
        if (!clockOutCell) {
            return null;
        }
        const text = await clockOutCell.textContent();
        const trimmed = text.trim().replace(/\s+/g, '');
        if (!trimmed || trimmed === '' || trimmed === '−' || trimmed === '-' || trimmed === '&nbsp;') {
            return null;
        }
        return trimmed;
    }

    /**
     * 出勤処理
     * @returns {Object} 結果オブジェクト
     */
    async clockIn() {
        console.log('出勤処理を実行します...');

        const clockInTime = await this.getClockInTime();
        if (clockInTime) {
            console.log(`既に出勤済みです（${clockInTime}）`);
            return { success: false, message: `既に出勤済みです（${clockInTime}）` };
        }

        console.log('出勤ボタンをクリックします...');
        try {
            await Promise.all([
                this.page.waitForLoadState('networkidle'),
                this.page.click('#btn03')
            ]);
            await this.page.waitForTimeout(1000);
        } catch (e) {
            console.error('Click/Navigation error:', e);
        }

        const newClockInTime = await this.getClockInTime();
        if (newClockInTime) {
            console.log(`出勤完了！（${newClockInTime}）`);
            return { success: true, message: `出勤完了！（${newClockInTime}）` };
        } else {
            console.log('出勤処理に失敗した可能性があります');
            return { success: false, message: '出勤処理に失敗した可能性があります' };
        }
    }

    /**
     * 退勤処理
     * @param {boolean} forceManHour - 強制工数入力モード
     * @param {boolean} autoManHour - 工数自動入力モード
     * @returns {Object} 結果オブジェクト
     */
    async clockOut(forceManHour = false, autoManHour = false) {
        console.log(`退勤処理を実行します... Force:${forceManHour}, AutoMH:${autoManHour}`);

        const clockInTime = await this.getClockInTime();
        if (!clockInTime) {
            console.log('まだ出勤していません');
            return { success: false, message: 'まだ出勤していません' };
        }

        let newClockOutTime = await this.getClockOutTime();

        // ダイアログハンドラ
        const dialogHandler = async (dialog) => {
            try {
                console.log(`Dialog detected: ${dialog.message()}`);
                await dialog.accept();
            } catch (e) {
                console.error('Dialog accept error:', e);
            }
        };
        this.page.on('dialog', dialogHandler);

        if (newClockOutTime) {
            console.log(`既に退勤済みです（${newClockOutTime}）`);
            if (!forceManHour) {
                this.page.off('dialog', dialogHandler);
                return { success: false, message: `既に退勤済みです（${newClockOutTime}）` };
            }
            console.log('設定により、退勤ボタンを強制クリックします。');
        }

        console.log('退勤ボタンをクリックします...');
        try {
            await this.page.click('#btn04');
            await this.page.waitForTimeout(3000);
        } catch (e) {
            console.error('Click error:', e);
        }

        this.page.off('dialog', dialogHandler);

        try {
            await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            await this.page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch (e) {
            console.log('Page load wait timeout, continuing...');
        }

        newClockOutTime = await this.getClockOutTime();

        if (newClockOutTime) {
            console.log(`退勤完了！（${newClockOutTime}）`);

            if (autoManHour) {
                try {
                    const updatedClockInTime = await this.getClockInTime();
                    const updatedClockOutTime = await this.getClockOutTime();
                    console.log(`工数計算用時刻: ${updatedClockInTime} - ${updatedClockOutTime}`);

                    const taskList = await this.submitManHour(updatedClockInTime, updatedClockOutTime);
                    const taskMsg = taskList && taskList.length > 0 ? `\n内訳: ${taskList.join(', ')}` : '';
                    return { success: true, message: `退勤完了＆工数入力済 (${newClockOutTime})${taskMsg}` };
                } catch (e) {
                    console.error(e);
                    return { success: true, message: `退勤完了 (${newClockOutTime}) ※工数入力失敗: ${e.message}` };
                }
            } else {
                return { success: true, message: `退勤完了 (${newClockOutTime})` };
            }
        } else {
            console.log('退勤処理に失敗した可能性があります');
            return { success: false, message: '退勤処理に失敗した可能性があります' };
        }
    }

    /**
     * 工数入力処理
     * @param {string} clockInTime - 出勤時刻
     * @param {string} clockOutTime - 退勤時刻
     * @returns {string[]} タスクリスト
     */
    async submitManHour(clockInTime, clockOutTime) {
        console.log(`工数入力を開始します... ${clockInTime} - ${clockOutTime}`);

        const toMinutes = (s) => {
            const [h, m] = s.split(':').map(Number);
            return h * 60 + m;
        };

        let diff = toMinutes(clockOutTime) - toMinutes(clockInTime);
        if (diff < 0) diff += 24 * 60;
        if (diff > TIME_CONSTANTS.BREAK_MINUTES) diff -= TIME_CONSTANTS.BREAK_MINUTES;
        else if (diff < 0) diff = 0;

        await this.page.goto(OZO_URLS.MAN_HOUR);
        await this.page.waitForLoadState('networkidle');

        console.log('前日データをコピー...');
        try {
            await this.page.waitForSelector('#a_sub_copy_select', { timeout: 10000 });
            await this.page.click('#a_sub_copy_select');
            await this.page.waitForTimeout(2000);
        } catch (e) {
            console.log('コピーボタン失敗、または存在しません。手動入力を試みます。');
        }

        const potentialRows = await this.page.$$('[id^="div_sub_editlist_WORK_TIME_row"]');
        const validRows = [];
        for (const row of potentialRows) {
            const id = await row.getAttribute('id');
            if (/^div_sub_editlist_WORK_TIME_row\d+$/.test(id)) {
                if (await row.isVisible()) {
                    validRows.push(row);
                }
            }
        }

        const count = validRows.length;
        console.log(`入力対象行数: ${count}`);

        if (count === 0) {
            console.log('入力行がありません。');
            return [];
        }

        const baseMinutes = Math.floor(diff / count);
        const remainder = diff % count;

        const taskList = [];

        for (let i = 0; i < count; i++) {
            let m = baseMinutes;
            if (i === 0) m += remainder;

            const hh = Math.floor(m / 60);
            const mm = m % 60;
            const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

            const rowHandle = validRows[i];
            const inputHandle = await rowHandle.$('input');

            if (inputHandle) {
                await inputHandle.click();
                await this.page.keyboard.press('Control+A');
                await this.page.keyboard.press('Backspace');
                await inputHandle.fill(timeStr);
                const id = await rowHandle.getAttribute('id');
                console.log(`Filled ${id}: ${timeStr}`);

                try {
                    const projectInputSelector = `#div_project_${i + 1} > input:nth-child(4)`;
                    const projectInput = await this.page.$(projectInputSelector);

                    let rowText = '';
                    if (projectInput) {
                        rowText = await projectInput.getAttribute('value');
                    } else {
                        const trHandle = await rowHandle.evaluateHandle(el => el.closest('tr'));
                        rowText = await trHandle.evaluate(el => el.innerText);
                    }

                    if (rowText) {
                        rowText = rowText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
                        if (rowText.length > 50) rowText = rowText.substring(0, 50) + '...';
                        taskList.push(rowText);
                    }
                } catch (e) {
                    console.error('タスク名取得失敗', e);
                }
            } else {
                console.log(`Input not found in row ${i + 1}`);
            }
        }

        console.log('登録ボタンをクリック...');
        await this.page.click('#div_sub_buttons_regist');
        await this.page.waitForTimeout(2000);
        try {
            await this.page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
            console.log('Register wait timeout, but continuing...');
        }
        console.log('工数登録完了');

        return taskList;
    }

    /**
     * 月次労働時間情報を取得
     * @returns {Object} 月次情報
     */
    async getMonthlyWorkHours() {
        console.log('月次労働時間情報を取得します...');
        await this.page.goto(OZO_URLS.MONTHLY);
        await this.page.waitForLoadState('networkidle');

        const workedEl = await this.page.$('td.flex-roudou');
        const workedTime = workedEl ? (await workedEl.textContent()).trim() : '--:--';

        const requiredEl = await this.page.$('.flex-prescribed.kinmu-tooltip');
        const requiredTime = requiredEl ? (await requiredEl.textContent()).trim() : '--:--';

        const diffEl = await this.page.$('td.flex-prescribed-overless.kinmu-tooltip');
        const diffTime = diffEl ? (await diffEl.textContent()).trim() : '--:--';

        const dailyDiffEl = await this.page.$('#frmSearch > table:nth-child(36) > tbody > tr:nth-child(2) > td > table:nth-child(1) > tbody > tr:nth-child(3) > td:nth-child(22)');
        const dailyDiffTime = dailyDiffEl ? (await dailyDiffEl.textContent()).trim() : '--:--';

        console.log(`月次: 実働=${workedTime}, 必要=${requiredTime}, 差分=${diffTime}, 日別過不足=${dailyDiffTime}`);

        return {
            workedTime,
            requiredTime,
            diffTime,
            dailyDiffTime
        };
    }

    /**
     * Cookieを取得
     * @returns {Array} Cookie配列
     */
    async getCookies() {
        if (!this.context) {
            if (this.page) {
                this.context = this.page.context();
            } else {
                return [];
            }
        }
        return await this.context.cookies();
    }
}

module.exports = ManageOZO3;
