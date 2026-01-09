const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LOGIN_URL = 'https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer';
const STORAGE_STATE_PATH = path.join(__dirname, 'session.json');

class ManageOZO3 {
    constructor() {
        this.browser = null;
        this.page = null;
        this.context = null;
    }

    // 設定ファイルから認証情報を読み込み
    loadCredentials() {
        const configPath = path.join(__dirname, 'config.json');
        if (!fs.existsSync(configPath)) {
            throw new Error('config.json が見つかりません。');
        }
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return config;
    }

    // ブラウザを起動
    async launch(headless = false) {
        this.browser = await chromium.launch({
            headless: headless,
            slowMo: 100
        });

        // セッション情報があれば読み込む
        let contextOptions = {};
        if (fs.existsSync(STORAGE_STATE_PATH)) {
            // console.log('セッション情報を読み込みます');
            contextOptions.storageState = STORAGE_STATE_PATH;
        }

        this.context = await this.browser.newContext(contextOptions);
        this.page = await this.context.newPage();
    }

    // ブラウザを閉じる
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.context = null;
        }
    }

    // ログイン処理
    async login() {
        const credentials = this.loadCredentials();

        console.log('ログインページを開きます...');
        await this.page.goto(LOGIN_URL);
        await this.page.waitForLoadState('networkidle');

        // URLでログイン済みか判定
        if (!this.page.url().includes('login.microsoftonline.com')) {
            console.log('既にログイン済みです');
            // セッション情報を更新（延長）するために保存
            await this.context.storageState({ path: STORAGE_STATE_PATH });
            return;
        }

        // Step 1: USER_ID入力
        console.log('USER_IDを入力します...');
        await this.page.waitForSelector('#i0116', { timeout: 60000 });
        await this.page.fill('#i0116', credentials.USER_ID);
        await this.page.click('#idSIButton9');

        await this.page.waitForLoadState('networkidle');

        // Step 2: PASSWORD入力
        console.log('PASSWORDを入力します...');
        // パスワード画面か確認
        if (await this.page.isVisible('#i0118')) {
            await this.page.fill('#i0118', credentials.PASSWORD);
            await this.page.click('#idSIButton9');
            await this.page.waitForLoadState('networkidle');
        }

        // Step 3: "サインインの状態を維持しますか?"
        console.log('確認ボタンを押します...');
        // タイミングによっては出ない場合もあるので、少し待機して要素があればクリック
        try {
            const confirmBtn = await this.page.waitForSelector('#idSIButton9', { timeout: 5000 });
            if (confirmBtn) {
                // それがKMSI画面かどうかの厳密なチェックは省略（フロー上、次はこれしかない）
                await confirmBtn.click();
                await this.page.waitForLoadState('networkidle');
            }
        } catch (e) {
            // タイムアウトした＝画面が出なかった、とみなして進む
        }

        console.log('ログイン完了待ち...');
        // OZOの画面に戻ってくるのを待つ
        // await this.page.waitForURL('**/default.cfm**', { timeout: 60000 });

        console.log('ログイン完了！');

        // セッション情報を保存
        await this.context.storageState({ path: STORAGE_STATE_PATH });
    }



    // 打刻テーブルから出勤時刻を取得
    async getClockInTime() {
        // 打刻の行（2行目のデータ行）の出勤セル（3列目）を取得
        const clockInCell = await this.page.$('table.BaseDesign tbody tr:nth-child(3) td:nth-child(3)');
        if (!clockInCell) {
            return null;
        }
        const text = await clockInCell.textContent();
        const trimmed = text.trim().replace(/\s+/g, '');
        // 空、&nbsp;、−などは未出勤と判定
        if (!trimmed || trimmed === '' || trimmed === '−' || trimmed === '-' || trimmed === '&nbsp;') {
            return null;
        }
        return trimmed;
    }

    // 打刻テーブルから退勤時刻を取得
    async getClockOutTime() {
        // 打刻の行（2行目のデータ行）の退出セル（4列目）を取得
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

    // 出勤処理
    async clockIn() {
        console.log('出勤処理を実行します...');

        // 既に出勤済みかチェック
        const clockInTime = await this.getClockInTime();
        if (clockInTime) {
            console.log(`既に出勤済みです（${clockInTime}）`);
            return { success: false, message: `既に出勤済みです（${clockInTime}）` };
        }

        // 出勤ボタンをクリック
        console.log('出勤ボタンをクリックします...');
        try {
            await Promise.all([
                this.page.waitForLoadState('networkidle'),
                this.page.click('#btn03')
            ]);
            await this.page.waitForTimeout(1000); // 念のため安定待ち
        } catch (e) {
            console.error('Click/Navigation error:', e);
            // エラーが出ても、処理自体は進んでいる可能性があるので続行してみる
        }

        // 出勤時刻を確認
        const newClockInTime = await this.getClockInTime();
        if (newClockInTime) {
            console.log(`出勤完了！（${newClockInTime}）`);
            return { success: true, message: `出勤完了！（${newClockInTime}）` };
        } else {
            console.log('出勤処理に失敗した可能性があります');
            return { success: false, message: '出勤処理に失敗した可能性があります' };
        }
    }

    // 退勤処理
    async clockOut(forceManHour = false, autoManHour = false) {
        console.log(`退勤処理を実行します... Force:${forceManHour}, AutoMH:${autoManHour}`);

        // 出勤していないのに退勤しようとしていないかチェック
        const clockInTime = await this.getClockInTime();
        if (!clockInTime) {
            console.log('まだ出勤していません');
            return { success: false, message: 'まだ出勤していません' };
        }

        // 既に退勤済みかチェック
        let newClockOutTime = await this.getClockOutTime();

        // ダイアログハンドラ (退勤済み時のアラートなどを自動OKする)
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

        // 退勤ボタンをクリック
        console.log('退勤ボタンをクリックします...');
        try {
            await this.page.click('#btn04');
            // ダイアログが複数回出る可能性があるので、十分な待機時間を設ける
            await this.page.waitForTimeout(3000);
        } catch (e) {
            console.error('Click error:', e);
            // エラーが出ても続行を試みる
        }

        // ダイアログハンドラを解除
        this.page.off('dialog', dialogHandler);

        // ページのリロード完了を待つ（ナビゲーション後のコンテキスト破棄対策）
        try {
            await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            await this.page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch (e) {
            console.log('Page load wait timeout, continuing...');
        }

        // 退勤時刻を確認（ページ更新後の最新値）
        newClockOutTime = await this.getClockOutTime();

        if (newClockOutTime) {
            console.log(`退勤完了！（${newClockOutTime}）`);

            // 工数自動入力（設定でONの場合のみ）
            if (autoManHour) {
                try {
                    // ページ更新後の最新の出勤・退勤時刻を取得して計算
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

    // 工数入力処理 (自動)
    async submitManHour(clockInTime, clockOutTime) {
        console.log(`工数入力を開始します... ${clockInTime} - ${clockOutTime}`);

        const toMinutes = (s) => {
            const [h, m] = s.split(':').map(Number);
            return h * 60 + m;
        };

        let diff = toMinutes(clockOutTime) - toMinutes(clockInTime);
        // 日跨ぎ対応 (例: 22:00 -> 02:00 = 120 - 1320 = -1200 -> +1440 = 240)
        if (diff < 0) diff += 24 * 60;

        // 休憩1h(60m)を引く（マイナスガード付き）
        if (diff > 60) diff -= 60;
        else if (diff < 0) diff = 0;

        const MAN_HOUR_URL = 'https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer&app_cd=388&fuseaction=kos&today_open=1';
        await this.page.goto(MAN_HOUR_URL);
        await this.page.waitForLoadState('networkidle');

        console.log('前日データをコピー...');
        try {
            await this.page.waitForSelector('#a_sub_copy_select', { timeout: 10000 });
            await this.page.click('#a_sub_copy_select');
            await this.page.waitForTimeout(2000); // 行生成待ち
        } catch (e) {
            console.log('コピーボタン失敗、または存在しません。手動入力を試みます。');
        }

        // 行を特定してフィルタリング
        const potentialRows = await this.page.$$('[id^="div_sub_editlist_WORK_TIME_row"]');
        const validRows = [];
        for (const row of potentialRows) {
            const id = await row.getAttribute('id');
            // "row" + 数字 の形式で、かつ表示されているものだけを対象にする
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
                // 既存の値を上書きするために確実にクリア
                await inputHandle.click();
                await this.page.keyboard.press('Control+A');
                await this.page.keyboard.press('Backspace');

                await inputHandle.fill(timeStr);
                const id = await rowHandle.getAttribute('id');
                console.log(`Filled ${id}: ${timeStr}`);

                // 行のテキストを取得してタスク名とする
                try {
                    // ユーザー指定のセレクタ: #div_project_1 > input:nth-child(4)
                    // rowのインデックス(i+1)と連動していると仮定
                    const projectInputSelector = `#div_project_${i + 1} > input:nth-child(4)`;
                    const projectInput = await this.page.$(projectInputSelector);

                    let rowText = '';
                    if (projectInput) {
                        rowText = await projectInput.getAttribute('value');
                    } else {
                        // フォールバック: 行全体からテキストを取得
                        const trHandle = await rowHandle.evaluateHandle(el => el.closest('tr'));
                        rowText = await trHandle.evaluate(el => el.innerText);
                    }

                    // 改行や余分なスペースを整形
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
        // 登録処理の完了を待つ（データ保存が確実に完了するまで）
        await this.page.waitForTimeout(2000);
        try {
            await this.page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
            console.log('Register wait timeout, but continuing...');
        }
        console.log('工数登録完了');

        return taskList;
    }

    // 月次労働時間情報を取得
    async getMonthlyWorkHours() {
        const MONTHLY_URL = 'https://manage.ozo-cloud.jp/ozo/default.cfm?version=fixer&app_cd=329&fuseaction=knt';

        console.log('月次労働時間情報を取得します...');
        await this.page.goto(MONTHLY_URL);
        await this.page.waitForLoadState('networkidle');

        // 実働時間 (td要素を明示的に指定)
        const workedEl = await this.page.$('td.flex-roudou');
        const workedTime = workedEl ? (await workedEl.textContent()).trim() : '--:--';

        // 必要時間
        const requiredEl = await this.page.$('.flex-prescribed.kinmu-tooltip');
        const requiredTime = requiredEl ? (await requiredEl.textContent()).trim() : '--:--';

        // 差分
        const diffEl = await this.page.$('td.flex-prescribed-overless.kinmu-tooltip');
        const diffTime = diffEl ? (await diffEl.textContent()).trim() : '--:--';

        // 日別過不足
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

    // Cookieを取得
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

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
        }
    }
}

module.exports = ManageOZO3;

