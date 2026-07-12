/**
 * app.js
 * ------------------------------------------------------------
 * 「トコトコ駅歩き」フロントエンドのメインコントローラー。
 *
 * 役割:
 *   - localStorage を使った状態(設定・履歴・アカウント)の読み書き
 *   - タブ(記録 / アチーブ / アカウント)の切り替え
 *   - サーバー(Flask API)との通信、結果のUI反映
 *   - 加速度センサー歩数計測・GPS距離計測のON/OFF制御
 *   - カロリー→食べ物換算の表示
 *
 * 依存モジュール:
 *   ruler.js   … 駅間ものさしSVGの描画
 *   sensors.js … 加速度センサー歩数検出 / GPS距離計測
 *   food.js    … カロリー→食べ物換算
 * ------------------------------------------------------------
 */

import { renderRuler } from "./ruler.js";
import { StepSensor, GpsTracker } from "./sensors.js";
import { calorieToFood } from "./food.js";

/* ============================================================
   0. 状態管理(State) — すべてlocalStorageに保存し、次回起動時も復元する
   ============================================================ */

const STORAGE_KEY = "ekihokei_state_v1";

/** アプリの初期状態。既存の保存データがあればこれとマージされる。 */
const DEFAULT_STATE = {
  // --- 今日の記録 ---
  todaySteps: 0,
  todayDistanceOverrideKm: null, // GPSモード時、歩数ではなくGPS実測距離を優先するためのフィールド

  // --- 設定 ---
  lineId: "karasuma",
  originStation: null, // null の場合は路線の先頭駅を使う
  direction: "decrease",
  goalSteps: 8000,
  strideCm: 65,

  // --- アカウント(将来のログインに備え、今はローカル保存のみ) ---
  userName: "ゲスト",
  heightCm: null,
  weightKg: null,

  // --- センサー設定 ---
  sensorEnabled: false,
  gpsEnabled: false,

  // --- 履歴・実績(保存した日ごとの記録) ---
  history: [], // { date, steps, distanceKm, calories, lineName, fromStation, toStation }
  visitedStations: [], // これまでに到達したことがある駅名(路線を問わずユニークに保持)
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (e) {
    console.warn("状態の読み込みに失敗しました。初期状態で開始します。", e);
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ============================================================
   1. DOM要素の取得
   ============================================================ */

const el = {
  // ヘッダー
  todayDate: document.getElementById("todayDate"),
  settingsBtn: document.getElementById("settingsBtn"),

  // 歩数入力
  stepsInput: document.getElementById("stepsInput"),
  stepAdjButtons: document.querySelectorAll(".step-adj-btn"),

  // ヒーロー表示
  stepsDisplay: document.getElementById("stepsDisplay"),
  goalBarFill: document.getElementById("goalBarFill"),
  goalText: document.getElementById("goalText"),

  // 駅間ものさし
  lineName: document.getElementById("lineName"),
  rulerSvgWrap: document.getElementById("rulerSvgWrap"),
  messageText: document.getElementById("messageText"),
  speakBtn: document.getElementById("speakBtn"),

  // 統計
  statDistance: document.getElementById("statDistance"),
  statTime: document.getElementById("statTime"),
  statCalories: document.getElementById("statCalories"),

  // 食べ物換算
  foodEmoji: document.getElementById("foodEmoji"),
  foodText: document.getElementById("foodText"),

  // 累計距離
  totalKm: document.getElementById("totalKm"),
  longDistanceList: document.getElementById("longDistanceList"),

  // 保存
  saveBtn: document.getElementById("saveBtn"),
  toast: document.getElementById("toast"),

  // 設定パネル
  settingsOverlay: document.getElementById("settingsOverlay"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  originSelect: document.getElementById("originSelect"),
  directionSelect: document.getElementById("directionSelect"),
  goalInput: document.getElementById("goalInput"),
  strideInput: document.getElementById("strideInput"),
  applySettingsBtn: document.getElementById("applySettingsBtn"),

  // センサー/GPS
  sensorToggle: document.getElementById("sensorToggle"),
  gpsToggle: document.getElementById("gpsToggle"),

  // 下部タブ
  navButtons: document.querySelectorAll(".nav-btn"),
  tabPanels: document.querySelectorAll(".tab-panel"),

  // アチーブタブ
  historyList: document.getElementById("historyList"),
  stampGrid: document.getElementById("stampGrid"),

  // アカウントタブ
  accountAvatar: document.getElementById("accountAvatar"),
  accountName: document.getElementById("accountName"),
  nameInput: document.getElementById("nameInput"),
  heightInput: document.getElementById("heightInput"),
  weightInput: document.getElementById("weightInput"),
  saveAccountBtn: document.getElementById("saveAccountBtn"),
};

// サーバーから取得した路線・駅データ(起動時に1回だけ取得してキャッシュする)
let stationData = null;

/* ============================================================
   2. 初期化
   ============================================================ */

async function init() {
  renderTodayDate();
  bindTabNavigation();
  bindStepsInput();
  bindSettingsPanel();
  bindSensorToggles();
  bindSpeakButton();
  bindSaveButton();
  bindAccountTab();

  await loadStationData();
  populateOriginSelect();
  restoreSettingsUI();
  restoreAccountUI();

  el.stepsInput.value = state.todaySteps;
  await refreshConversion();
  renderAchievements();
}

function renderTodayDate() {
  const now = new Date();
  const formatted = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  el.todayDate.textContent = formatted;
}

async function loadStationData() {
  const res = await fetch("/api/lines");
  stationData = await res.json();
}

/* ============================================================
   3. タブ切り替え(記録 / アチーブ / アカウント)
   ============================================================ */

function bindTabNavigation() {
  el.navButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabName) {
  el.tabPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== tabName);
  });
  el.navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  if (tabName === "achieve") renderAchievements();
}

/* ============================================================
   4. 歩数入力
   ============================================================ */

function bindStepsInput() {
  el.stepAdjButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = parseInt(btn.dataset.delta, 10);
      const next = Math.max(0, currentSteps() + delta);
      setSteps(next);
    });
  });

  el.stepsInput.addEventListener("change", () => {
    const value = Math.max(0, parseInt(el.stepsInput.value, 10) || 0);
    setSteps(value);
  });
}

function currentSteps() {
  return parseInt(el.stepsInput.value, 10) || 0;
}

/** 歩数を更新し、画面表示とサーバー計算をすべて再実行する */
function setSteps(steps) {
  el.stepsInput.value = steps;
  state.todaySteps = steps;
  saveState();
  refreshConversion();
}

/* ============================================================
   5. 設定パネル(起点駅・方向・目標・歩幅)
   ============================================================ */

function bindSettingsPanel() {
  el.settingsBtn.addEventListener("click", () => el.settingsOverlay.classList.remove("hidden"));
  el.closeSettingsBtn.addEventListener("click", () => el.settingsOverlay.classList.add("hidden"));
  el.settingsOverlay.addEventListener("click", (e) => {
    if (e.target === el.settingsOverlay) el.settingsOverlay.classList.add("hidden");
  });

  el.applySettingsBtn.addEventListener("click", () => {
    state.originStation = el.originSelect.value || null;
    state.direction = el.directionSelect.value;
    state.goalSteps = Math.max(0, parseInt(el.goalInput.value, 10) || 0);
    state.strideCm = Math.max(30, parseInt(el.strideInput.value, 10) || 65);
    saveState();
    el.settingsOverlay.classList.add("hidden");
    refreshConversion();
  });
}

function populateOriginSelect() {
  if (!stationData) return;
  const line = stationData.lines.find((l) => l.id === state.lineId) || stationData.lines[0];
  el.originSelect.innerHTML = "";
  line.stations.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = `${s.name}駅`;
    el.originSelect.appendChild(opt);
  });
}

function restoreSettingsUI() {
  if (state.originStation) el.originSelect.value = state.originStation;
  el.directionSelect.value = state.direction;
  el.goalInput.value = state.goalSteps;
  el.strideInput.value = state.strideCm;
}

/**
 * 歩幅(m)を決定する。
 * 身長が入力済みなら「歩幅 ≈ 身長 × 0.45」という一般的な目安式で自動計算し、
 * 未入力の場合は設定画面で指定した固定値を使う。
 */
function resolveStrideM() {
  if (state.heightCm) {
    return Math.round(state.heightCm * 0.45) / 100;
  }
  return state.strideCm / 100;
}

/* ============================================================
   6. センサー(歩数)・GPS(距離)のON/OFF制御
   ============================================================ */

let stepSensor = null;
let gpsTracker = null;

function bindSensorToggles() {
  el.sensorToggle.addEventListener("change", async (e) => {
    if (e.target.checked) {
      const ok = await enableStepSensor();
      if (!ok) {
        e.target.checked = false;
        showToast("この端末ではセンサーの利用が許可されませんでした");
        return;
      }
    } else {
      disableStepSensor();
    }
    state.sensorEnabled = e.target.checked;
    saveState();
  });

  el.gpsToggle.addEventListener("change", (e) => {
    if (e.target.checked) {
      enableGpsTracking();
    } else {
      disableGpsTracking();
    }
    state.gpsEnabled = e.target.checked;
    saveState();
  });

  // 前回終了時にONだった場合は起動時に再度有効化する
  if (state.sensorEnabled) {
    el.sensorToggle.checked = true;
    enableStepSensor();
  }
  if (state.gpsEnabled) {
    el.gpsToggle.checked = true;
    enableGpsTracking();
  }
}

async function enableStepSensor() {
  const supported = await StepSensor.isSupported();
  if (!supported) return false;

  const granted = await StepSensor.requestPermission();
  if (!granted) return false;

  stepSensor = new StepSensor((delta) => {
    setSteps(currentSteps() + delta);
  });
  stepSensor.start();
  return true;
}

function disableStepSensor() {
  if (stepSensor) {
    stepSensor.stop();
    stepSensor = null;
  }
}

function enableGpsTracking() {
  if (!GpsTracker.isSupported()) {
    showToast("この端末はGPSに対応していません");
    el.gpsToggle.checked = false;
    return;
  }
  gpsTracker = new GpsTracker((totalDistanceM) => {
    state.todayDistanceOverrideKm = Math.round((totalDistanceM / 1000) * 1000) / 1000;
    saveState();
    refreshConversion();
  });
  gpsTracker.start();
}

function disableGpsTracking() {
  if (gpsTracker) {
    gpsTracker.stop();
    gpsTracker = null;
  }
  state.todayDistanceOverrideKm = null;
  saveState();
  refreshConversion();
}

/* ============================================================
   7. サーバーとの通信 — 駅換算 & 累計距離
   ============================================================ */

async function refreshConversion() {
  const body = {
    steps: state.todaySteps,
    stride_m: resolveStrideM(),
    line_id: state.lineId,
    origin_station: state.originStation || undefined,
    direction: state.direction,
    weight_kg: state.weightKg || undefined,
  };
  // GPSモードで実測距離がある場合は、歩数由来の距離より優先する
  if (state.gpsEnabled && state.todayDistanceOverrideKm !== null) {
    body.distance_km = state.todayDistanceOverrideKm;
  }

  const res = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("駅換算APIの呼び出しに失敗しました", await res.text());
    return;
  }

  const result = await res.json();
  applyConversionResult(result);
  await refreshLongDistance(result.distance_km, result.calories);
}

function applyConversionResult(result) {
  // ヒーロー表示
  el.stepsDisplay.textContent = result.steps.toLocaleString("ja-JP");
  const goalPct = state.goalSteps > 0 ? Math.min(100, Math.round((result.steps / state.goalSteps) * 100)) : 0;
  el.goalBarFill.style.width = `${goalPct}%`;
  el.goalText.textContent =
    state.goalSteps > 0 && result.steps < state.goalSteps
      ? `目標まであと ${(state.goalSteps - result.steps).toLocaleString("ja-JP")} 歩`
      : "🎉 今日の目標を達成しました！";

  // 駅間ものさし
  el.lineName.textContent = result.line_name;
  el.lineName.style.background = result.line_color;
  renderRuler(el.rulerSvgWrap, result.route_stations, result.line_color);
  el.messageText.textContent = result.message;

  // 統計
  el.statDistance.innerHTML = `${result.distance_km.toFixed(1)}<small>km</small>`;
  el.statTime.innerHTML = `${result.minutes}<small>分</small>`;
  el.statCalories.innerHTML = `${result.calories}<small>kcal</small>`;

  // 食べ物換算
  const food = calorieToFood(result.calories);
  el.foodEmoji.textContent = food.emoji;
  el.foodText.textContent = food.text;

  // 現在地の駅を「到達済み駅」として記録しておく(スタンプ帳用)
  markStationVisited(result.current_to || result.current_from);

  // 直近の結果を保持(保存ボタン押下時に使う)
  lastResult = result;
}

let lastResult = null;

async function refreshLongDistance(todayDistanceKm, todayCalories) {
  const historyKm = state.history.reduce((sum, h) => sum + (h.distanceKm || 0), 0);
  const totalKm = Math.round((historyKm + todayDistanceKm) * 100) / 100;

  el.totalKm.textContent = totalKm.toFixed(1);

  const res = await fetch("/api/long_distance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ total_km: totalKm }),
  });
  if (!res.ok) return;
  const data = await res.json();

  el.longDistanceList.innerHTML = "";
  data.routes.forEach((route) => {
    const complete = route.progress_pct >= 100;
    const row = document.createElement("div");
    row.className = "long-route";
    row.innerHTML = `
      <div class="long-route-head">
        <span>${route.name}</span>
        <span>${route.progress_pct}%${complete ? " 達成！" : ""}</span>
      </div>
      <div class="long-route-track">
        <div class="long-route-fill ${complete ? "complete" : ""}" style="width:${Math.min(100, route.progress_pct)}%"></div>
      </div>
    `;
    el.longDistanceList.appendChild(row);
  });
}

/* ============================================================
   8. 保存(今日の記録を履歴に追加)
   ============================================================ */

function bindSaveButton() {
  el.saveBtn.addEventListener("click", saveTodayRecord);
}

function saveTodayRecord() {
  if (!lastResult) return;

  const todayKey = new Date().toISOString().slice(0, 10);
  const existingIndex = state.history.findIndex((h) => h.date === todayKey);
  const record = {
    date: todayKey,
    steps: lastResult.steps,
    distanceKm: lastResult.distance_km,
    calories: lastResult.calories,
    lineName: lastResult.line_name,
    fromStation: lastResult.origin_station,
    toStation: lastResult.current_to || lastResult.current_from,
  };

  if (existingIndex >= 0) {
    state.history[existingIndex] = record; // 同じ日はすでにある記録を上書き
  } else {
    state.history.unshift(record);
  }
  saveState();

  el.saveBtn.textContent = "保存しました ✓";
  el.saveBtn.classList.add("saved");
  showToast("今日の記録を保存しました");
  setTimeout(() => {
    el.saveBtn.textContent = "今日の記録を保存する";
    el.saveBtn.classList.remove("saved");
  }, 1800);

  renderAchievements();
}

function markStationVisited(stationName) {
  if (!stationName) return;
  if (!state.visitedStations.includes(stationName)) {
    state.visitedStations.push(stationName);
    saveState();
  }
}

/* ============================================================
   9. アチーブタブ(履歴・駅スタンプ帳)
   ============================================================ */

function renderAchievements() {
  renderHistoryList();
  renderStampGrid();
}

function renderHistoryList() {
  el.historyList.innerHTML = "";
  if (state.history.length === 0) {
    el.historyList.innerHTML = `<p class="empty-text">まだ記録がありません。「記録」タブで保存してみましょう。</p>`;
    return;
  }
  state.history.slice(0, 30).forEach((h) => {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `
      <div>
        <div class="history-date">${formatDateLabel(h.date)}</div>
        <div class="history-detail">${h.lineName}｜${h.fromStation}→${h.toStation}</div>
      </div>
      <div class="history-detail">${h.steps.toLocaleString("ja-JP")}歩 / ${h.distanceKm.toFixed(1)}km</div>
    `;
    el.historyList.appendChild(row);
  });
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" });
}

/** 現在の路線に含まれる全駅を「到達済みか」でスタンプ表示する */
function renderStampGrid() {
  if (!stationData) return;
  const line = stationData.lines.find((l) => l.id === state.lineId) || stationData.lines[0];
  el.stampGrid.innerHTML = "";
  line.stations.forEach((s) => {
    const got = state.visitedStations.includes(s.name);
    const stamp = document.createElement("div");
    stamp.className = `stamp ${got ? "got" : ""}`;
    stamp.textContent = s.name;
    el.stampGrid.appendChild(stamp);
  });
}

/* ============================================================
   10. アカウントタブ
   ============================================================ */

function bindAccountTab() {
  el.saveAccountBtn.addEventListener("click", () => {
    state.userName = el.nameInput.value.trim() || "ゲスト";
    state.heightCm = parseFloat(el.heightInput.value) || null;
    state.weightKg = parseFloat(el.weightInput.value) || null;
    saveState();
    restoreAccountUI();
    showToast("アカウント情報を保存しました");
    refreshConversion(); // 身長から歩幅・体重からカロリーが変わるため再計算
  });
}

function restoreAccountUI() {
  el.accountName.textContent = state.userName;
  el.accountAvatar.textContent = state.userName.charAt(0);
  el.nameInput.value = state.userName === "ゲスト" ? "" : state.userName;
  if (state.heightCm) el.heightInput.value = state.heightCm;
  if (state.weightKg) el.weightInput.value = state.weightKg;
}

/* ============================================================
   11. 音声読み上げ(Web Speech API)
   ============================================================ */

function bindSpeakButton() {
  el.speakBtn.addEventListener("click", () => {
    if (!("speechSynthesis" in window)) {
      showToast("この端末は音声読み上げに対応していません");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(el.messageText.textContent);
    utterance.lang = "ja-JP";
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

/* ============================================================
   12. トースト通知(簡易フィードバック表示)
   ============================================================ */

let toastTimer = null;
function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
}

/* ============================================================
   起動
   ============================================================ */

init();
