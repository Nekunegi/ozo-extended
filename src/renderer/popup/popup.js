/**
 * ポップアップ画面のJavaScript
 */

// 状態管理
let isConfiguredState = null;
let countdownInterval = null;
let monthlyDataLoaded = false;

// DOM要素取得
const elements = {
    currentTime: () => document.getElementById('currentTime'),
    workInfo: () => document.getElementById('workInfo'),
    workInfoLoading: () => document.getElementById('workInfoLoading'),
    mainButtons: () => document.getElementById('mainButtons'),
    setupPrompt: () => document.getElementById('setupPrompt'),
    btnClockIn: () => document.getElementById('btnClockIn'),
    clockOutContainer: () => document.getElementById('clockOutContainer'),
    clockInTime: () => document.getElementById('clockInTime'),
    clockOutTime: () => document.getElementById('clockOutTime'),
    minClockOutTime: () => document.getElementById('minClockOutTime'),
    countdown: () => document.getElementById('countdown'),
    progressBar: () => document.getElementById('progressBar'),
    slideContainer: () => document.getElementById('slideContainer'),
    arrowRight: () => document.getElementById('arrowRight'),
    arrowLeft: () => document.getElementById('arrowLeft'),
    monthlyLoading: () => document.getElementById('monthlyLoading'),
    monthlyData: () => document.getElementById('monthlyData'),
    workedTime: () => document.getElementById('workedTime'),
    requiredTime: () => document.getElementById('requiredTime'),
    diffTime: () => document.getElementById('diffTime'),
    dailyDiffTime: () => document.getElementById('dailyDiffTime'),
    networkErrorOverlay: () => document.getElementById('networkErrorOverlay'),
    processingOverlay: () => document.getElementById('processingOverlay'),
    versionDisplay: () => document.getElementById('versionDisplay')
};

/**
 * 時刻を更新
 */
function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    elements.currentTime().textContent = `${hours}:${minutes}:${seconds}`;
}

/**
 * ネットワーク接続チェック
 */
async function checkNetworkAndShowOverlay() {
    const isOnline = await window.electronAPI.checkNetwork();
    const overlay = elements.networkErrorOverlay();
    if (!isOnline) {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
    return isOnline;
}

/**
 * ネットワーク再試行
 */
async function retryNetworkCheck() {
    const btn = event.target;
    btn.textContent = '確認中...';
    btn.disabled = true;

    const isOnline = await checkNetworkAndShowOverlay();

    if (isOnline) {
        await checkConfig();
    }

    btn.textContent = '🔄 再試行';
    btn.disabled = false;
}

/**
 * 設定状態をチェック
 */
async function checkConfig() {
    const configured = await window.electronAPI.isConfigured();

    if (isConfiguredState === configured) return;
    isConfiguredState = configured;

    if (configured) {
        elements.mainButtons().style.display = 'flex';
        elements.setupPrompt().style.display = 'none';
        elements.workInfo().style.display = 'block';
        await updateWorkInfoDisplay();
    } else {
        elements.mainButtons().style.display = 'none';
        elements.setupPrompt().style.display = 'flex';
        elements.workInfo().style.display = 'none';
    }
}

/**
 * 勤務情報表示を更新
 */
async function updateWorkInfoDisplay() {
    setLoading(true);
    const info = await window.electronAPI.getWorkInfo();

    if (info && info.isProcessing) {
        disableButtons();
        setTimeout(updateWorkInfoDisplay, 1000);
        return;
    } else {
        enableButtons();
    }

    setLoading(false);

    const btnClockIn = elements.btnClockIn();
    const clockOutContainer = elements.clockOutContainer();

    if (info && info.clockedIn) {
        if (btnClockIn) btnClockIn.style.display = 'none';
        if (clockOutContainer) clockOutContainer.style.display = 'flex';

        elements.clockInTime().textContent = info.clockInTime;
        elements.clockOutTime().textContent = info.clockOutTime ? info.clockOutTime : '--:--';
        elements.minClockOutTime().textContent = info.minClockOutTime;

        startCountdown(info.minClockOutTime);
    } else {
        if (btnClockIn) {
            btnClockIn.style.display = 'flex';
            btnClockIn.classList.remove('disabled-look');
        }
        if (clockOutContainer) clockOutContainer.style.display = 'none';
        resetWorkInfo();
    }
}

/**
 * ローディング表示を設定
 */
function setLoading(isLoading) {
    elements.workInfoLoading().style.display = isLoading ? 'flex' : 'none';
}

/**
 * 勤務情報をリセット
 */
function resetWorkInfo() {
    elements.clockInTime().textContent = '--:--';
    elements.clockOutTime().textContent = '--:--';
    elements.minClockOutTime().textContent = '--:--';
    elements.countdown().textContent = '--:--';
    elements.progressBar().style.width = '0%';
    if (countdownInterval) cancelAnimationFrame(countdownInterval);
}

/**
 * カウントダウンを開始
 */
function startCountdown(targetTimeStr) {
    if (countdownInterval) cancelAnimationFrame(countdownInterval);

    const [hours, minutes] = targetTimeStr.split(':').map(Number);
    const targetTime = new Date();
    targetTime.setHours(hours, minutes, 0, 0);

    const startTime = new Date(targetTime.getTime() - 9 * 60 * 60 * 1000);
    const totalDuration = targetTime - startTime;

    function update() {
        const now = new Date();
        const diff = targetTime - now;

        const elapsed = now - startTime;
        let progress = (elapsed / totalDuration) * 100;
        progress = Math.max(0, Math.min(100, progress));
        elements.progressBar().style.width = `${progress}%`;

        if (diff <= 0) {
            elements.countdown().textContent = "00:00";
            return;
        }

        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        elements.countdown().textContent = `${h}:${String(m).padStart(2, '0')}`;

        countdownInterval = requestAnimationFrame(update);
    }

    update();
}

/**
 * ボタンを無効化
 */
function disableButtons() {
    const btns = document.querySelectorAll('.btn');
    btns.forEach(btn => {
        btn.classList.add('disabled-look');
        btn.classList.add('loading');
    });
}

/**
 * ボタンを有効化
 */
function enableButtons() {
    const btns = document.querySelectorAll('.btn');
    btns.forEach(btn => {
        btn.classList.remove('disabled-look');
        btn.classList.remove('loading');
    });
}

/**
 * 処理アクションを実行
 */
async function processClockAction(action) {
    showProcessingOverlay();
    const overlay = elements.processingOverlay();
    const msgEl = overlay.querySelector('.processing-message');
    const warnEl = overlay.querySelector('.processing-warning');
    const spinner = overlay.querySelector('.spinner');

    // 状態をリセット
    overlay.style.display = 'flex';
    spinner.style.display = 'block';
    warnEl.style.display = 'block';
    msgEl.textContent = '処理を実行中です...';
    overlay.onclick = null;
    overlay.style.cursor = 'default';
    overlay.title = '';

    try {
        const result = await action();

        spinner.style.display = 'none';
        warnEl.style.display = 'none';

        // クリックで閉じる
        overlay.onclick = () => {
            overlay.style.display = 'none';
            window.electronAPI.closeWindow();
        };
        overlay.style.cursor = 'pointer';
        overlay.title = 'クリックして閉じる';

        if (result && result.success) {
            msgEl.innerHTML = `
        <div class="result-container">
          <div style="font-size: 32px; margin-bottom: 4px;">🎉</div>
          <div style="font-size: 16px; font-weight:bold; color: #00cec9; margin-bottom: 8px; text-shadow: 0 2px 10px rgba(0,206,201,0.4);">完了</div>
          <div style="font-size: 11px; color: #e2e8f0; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 6px; width: 100%; text-align: left; line-height: 1.4; white-space: pre-wrap;">${result.message || ''}</div>
          <div style="font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 4px;">(クリックして閉じる)</div>
        </div>
      `;
            setTimeout(() => {
                overlay.style.display = 'none';
                window.electronAPI.closeWindow();
            }, 4000);

            // 月次労働時間情報を再取得
            loadMonthlyData();
        } else {
            const msg = result ? result.message : '不明なエラー';
            msgEl.innerHTML = `
        <div class="result-container">
          <div style="font-size: 32px; margin-bottom: 4px;">⚠️</div>
          <div style="font-size: 16px; font-weight:bold; color: #ff6b6b; margin-bottom: 8px; text-shadow: 0 2px 10px rgba(255,50,50,0.4);">失敗</div>
          <div style="font-size: 11px; color: #fecaca; background: rgba(255,50,50,0.15); padding: 8px; border-radius: 6px; width: 100%; text-align: left; line-height: 1.4; white-space: pre-wrap; border: 1px solid rgba(255,50,50,0.3);">${msg}</div>
          <div style="font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 4px;">(クリックして閉じる)</div>
        </div>
      `;
            setTimeout(() => {
                overlay.style.display = 'none';
                window.electronAPI.closeWindow();
            }, 6000);
        }
    } catch (e) {
        spinner.style.display = 'none';
        warnEl.style.display = 'none';

        overlay.onclick = () => {
            overlay.style.display = 'none';
            window.electronAPI.closeWindow();
        };
        overlay.style.cursor = 'pointer';

        msgEl.innerHTML = `
      <div class="result-container">
        <div style="font-size: 32px; margin-bottom: 4px;">❌</div>
        <div style="font-size: 16px; font-weight:bold; color: #ff6b6b; margin-bottom: 8px; text-shadow: 0 2px 10px rgba(255,50,50,0.4);">エラー</div>
        <div style="font-size: 11px; color: #fecaca; background: rgba(255,50,50,0.15); padding: 8px; border-radius: 6px; width: 100%; text-align: left; line-height: 1.4; white-space: pre-wrap; border: 1px solid rgba(255,50,50,0.3);">${e.message || e}</div>
        <div style="font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 4px;">(クリックして閉じる)</div>
      </div>
    `;
    }
}

/**
 * 処理オーバーレイを表示
 */
function showProcessingOverlay() {
    elements.processingOverlay().style.display = 'flex';
}

/**
 * 月次情報パネルにスライド
 */
function slideToMonthly() {
    elements.slideContainer().classList.add('slide-right');
    elements.arrowRight().style.display = 'none';
    elements.arrowLeft().style.display = 'flex';

    if (!monthlyDataLoaded) {
        loadMonthlyData();
    }
}

/**
 * メインパネルにスライド
 */
function slideToMain() {
    elements.slideContainer().classList.remove('slide-right');
    elements.arrowRight().style.display = 'flex';
    elements.arrowLeft().style.display = 'none';
}

/**
 * 月次データを読み込み
 */
async function loadMonthlyData() {
    const isConfigured = await window.electronAPI.isConfigured();
    if (!isConfigured) {
        elements.monthlyLoading().innerHTML = '<div style="color: #ff6b6b; font-size: 12px; text-align: center;">表示できません<br>(設定が必要です)</div>';
        elements.monthlyLoading().style.display = 'block';
        elements.monthlyData().style.display = 'none';
        return;
    }

    elements.monthlyLoading().innerHTML = '<div class="spinner" style="margin: 0 auto;"></div><div style="margin-top: 8px;">取得中...</div>';
    elements.monthlyLoading().style.display = 'block';
    elements.monthlyData().style.display = 'none';

    const data = await window.electronAPI.getMonthlyWorkHours();

    if (data) {
        elements.workedTime().textContent = data.workedTime;
        elements.requiredTime().textContent = data.requiredTime;

        const diffEl = elements.diffTime();
        diffEl.textContent = data.diffTime;

        if (data.diffTime.startsWith('-')) {
            diffEl.classList.add('negative');
            diffEl.classList.remove('positive');
        } else {
            diffEl.classList.add('positive');
            diffEl.classList.remove('negative');
        }

        const dailyDiffEl = elements.dailyDiffTime();
        dailyDiffEl.textContent = data.dailyDiffTime;
        if (data.dailyDiffTime.startsWith('-')) {
            dailyDiffEl.classList.add('negative');
            dailyDiffEl.classList.remove('positive');
        } else {
            dailyDiffEl.classList.add('positive');
            dailyDiffEl.classList.remove('negative');
        }

        elements.monthlyLoading().style.display = 'none';
        elements.monthlyData().style.display = 'block';
        monthlyDataLoaded = true;
    }
}

// グローバル関数として公開
window.handleClockInWrapper = () => processClockAction(() => window.electronAPI.clockIn());
window.handleClockOutWrapper = () => processClockAction(() => window.electronAPI.clockOut());
window.handleClockOutAutoWrapper = () => processClockAction(() => window.electronAPI.clockOutWithAutoManHour());
window.slideToMonthly = slideToMonthly;
window.slideToMain = slideToMain;
window.retryNetworkCheck = retryNetworkCheck;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    // 時刻更新開始
    updateTime();
    setInterval(updateTime, 1000);

    // ネットワークチェック
    checkNetworkAndShowOverlay();

    // 設定状態チェック
    checkConfig();

    // 定期チェック
    setInterval(async () => {
        await checkConfig();
        if (isConfiguredState) {
            const info = await window.electronAPI.getWorkInfo();
            if (info && !info.isProcessing) {
                enableButtons();
            }
        }
    }, 2000);

    // バージョン表示
    const ver = await window.electronAPI.getAppVersion();
    elements.versionDisplay().textContent = `v${ver}`;
});
