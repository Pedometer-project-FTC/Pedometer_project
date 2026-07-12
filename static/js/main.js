/**
 * main.js
 * 各モジュールを組み合わせてアプリ全体を動かすエントリーポイント。
 *
 * 方針:
 *   - 歩数・距離の手入力UIは無い。センサー(pedometer.js)とGPS(gps_tracker.js)を
 *     ページ読み込み時に自動で起動し、当日分は自動的にhistoryへ保存される。
 *   - iOSのSafariは「センサーの利用許可」をユーザー操作(タップ等)の直後にしか
 *     リクエストできない仕様のため、読み込み時に一度自動で試み、失敗した場合は
 *     画面への最初のタップを合図にもう一度リクエストする(専用ボタンは置かない)。
 */

import { loadState, saveState, todayKey, formatDateForDisplay } from "./state.js";
import { fetchLines, convertSteps, convertLongDistance } from "./api.js";
import { renderRuler } from "./ruler.js";
import { setMascotState } from "./mascot.js";
import { updateRouteCard } from "./route_card.js";
import { initMap, updateMapRoute } from "./map.js";
import { Pedometer } from "./pedometer.js";
import { GpsTracker } from "./gps_tracker.js";
import { initTabs } from "./tabs.js";

// ---------------------------------------------------------------------------
// 要素参照
// ---------------------------------------------------------------------------
const els = {
  dateLabel: document.getElementById("dateLabel"),
  refreshBtn: document.getElementById("refreshBtn"),

  stepsDisplay: document.getElementById("stepsDisplay"),
  mascotImg: document.getElementById("mascotImg"),
  statDistance: document.getElementById("statDistance"),

  routeFromSign: document.getElementById("routeFromSign"),
  routeToSign: document.getElementById("routeToSign"),
  arrivalToast: document.getElementById("arrivalToast"),

  infoCalories: document.getElementById("infoCalories"),
  infoWater: document.getElementById("infoWater"),
  infoSight: document.getElementById("infoSight"),

  mapContainer: document.getElementById("mapContainer"),
  rulerSvgWrap: document.getElementById("rulerSvgWrap"),

  totalKm: document.getElementById("totalKm"),
  longDistanceList: document.getElementById("longDistanceList"),
  recordCount: document.getElementById("recordCount"),
  achieveCount: document.getElementById("achieveCount"),
  historyList: document.getElementById("historyList"),

  heightInput: document.getElementById("heightInput"),
  weightInput: document.getElementById("weightInput"),
  strideInput: document.getElementById("strideInput"),
  lineSelect: document.getElementById("lineSelect"),
  originSelect: document.getElementById("originSelect"),
  directionSelect: document.getElementById("directionSelect"),
  goalInput: document.getElementById("goalInput"),
  applySettingsBtn: document.getElementById("applySettingsBtn"),
};

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------
let state = loadState();
let lineData = null;
let wasArrived = false; // 直前の更新で「到着済み」だったか(お祝い演出の重複防止用)

const pedometer = new Pedometer((increment) => {
  state.steps += increment;
  saveState(state);
  refreshToday();
});

const gpsTracker = new GpsTracker((gpsState) => {
  refreshToday({ gpsState });
});

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------
async function init() {
  rolloverDayIfNeeded();

  els.dateLabel.textContent = formatDateForDisplay();
  els.heightInput.value = state.heightCm ?? "";
  els.weightInput.value = state.weightKg ?? "";
  els.strideInput.value = state.strideCm ?? "";
  els.directionSelect.value = state.direction;
  els.goalInput.value = state.dailyGoal;

  lineData = await fetchLines();
  populateLineSelect();
  populateOriginSelect();

  initTabs();
  initMap("mapContainer");
  bindEvents();
  renderHistoryTab();
  await refreshToday();

  autoStartSensors();
}

/**
 * 前回アプリを使った日と今日の日付を比較し、日をまたいでいたら
 * (前日分はrefreshToday内で自動保存済みのため)当日の歩数を0にリセットする。
 */
function rolloverDayIfNeeded() {
  const today = todayKey();
  if (state.lastActiveDate && state.lastActiveDate !== today) {
    state.steps = 0;
  }
  state.lastActiveDate = today;
  saveState(state);
}

function populateLineSelect() {
  els.lineSelect.innerHTML = "";
  lineData.lines.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    if (l.id === state.lineId) opt.selected = true;
    els.lineSelect.appendChild(opt);
  });
}

function populateOriginSelect() {
  const line = lineData.lines.find((l) => l.id === state.lineId) || lineData.lines[0];
  els.originSelect.innerHTML = "";
  line.stations.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = `${s.name}駅`;
    if (s.name === state.originStation) opt.selected = true;
    els.originSelect.appendChild(opt);
  });
}

// ---------------------------------------------------------------------------
// センサー/GPSの自動起動(専用トグルUIは置かない)
// ---------------------------------------------------------------------------
function autoStartSensors() {
  // GPSはブラウザが自動で許可ダイアログを出すため、そのまま起動を試みる。
  try {
    gpsTracker.start();
  } catch (err) {
    console.warn("GPS自動起動に失敗:", err.message);
  }

  // 加速度センサーは起動を試み、iOS Safariなど「ユーザー操作直後」しか
  // 許可リクエストができない環境では、最初の画面タップで再試行する。
  startPedometerSilently();
}

async function startPedometerSilently() {
  try {
    await pedometer.start();
  } catch {
    const retry = async () => {
      document.removeEventListener("click", retry);
      document.removeEventListener("touchend", retry);
      try {
        await pedometer.start();
      } catch (err) {
        console.warn("センサーの利用が許可されませんでした:", err.message);
      }
    };
    document.addEventListener("click", retry, { once: true });
    document.addEventListener("touchend", retry, { once: true });
  }
}

// ---------------------------------------------------------------------------
// イベント
// ---------------------------------------------------------------------------
function bindEvents() {
  els.refreshBtn.addEventListener("click", () => {
    els.refreshBtn.classList.add("spinning");
    refreshToday().finally(() => {
      setTimeout(() => els.refreshBtn.classList.remove("spinning"), 700);
    });
  });

  els.lineSelect.addEventListener("change", () => {
    state.lineId = els.lineSelect.value;
    populateOriginSelect();
  });

  els.applySettingsBtn.addEventListener("click", () => {
    state.originStation = els.originSelect.value;
    state.direction = els.directionSelect.value;
    state.dailyGoal = Math.max(0, parseInt(els.goalInput.value || "0", 10));
    state.heightCm = els.heightInput.value ? Number(els.heightInput.value) : null;
    state.weightKg = els.weightInput.value ? Number(els.weightInput.value) : null;
    state.strideCm = els.strideInput.value ? Number(els.strideInput.value) : null;
    saveState(state);
    refreshToday();
  });
}

// ---------------------------------------------------------------------------
// 今日の表示を更新するメイン処理
// ---------------------------------------------------------------------------
async function refreshToday(options = {}) {
  const { gpsState } = options;

  const data = await convertSteps({
    steps: state.steps,
    distanceKmOverride: gpsState ? gpsState.distanceKm : null,
    durationMin: gpsState ? gpsState.durationMin : null,
    heightCm: state.heightCm,
    weightKg: state.weightKg,
    strideCm: state.strideCm,
    lineId: state.lineId,
    originStation: state.originStation,
    direction: state.direction,
  });

  applyConvertResultToUI(data, gpsState ? gpsState.path : null);

  // 到着演出: 直前は未到達で、今回ちょうど区間を歩き切った場合にお祝いする
  if (data.segment_progress >= 1 && !wasArrived) {
    setMascotState(els.mascotImg, "celebrate");
    els.arrivalToast.textContent = `🎉 ${data.passed_station}駅に到着しました！`;
    els.arrivalToast.classList.remove("hidden");
    setTimeout(() => els.arrivalToast.classList.add("hidden"), 2500);
  } else if (pedometer.isRunning || gpsTracker.isRunning) {
    setMascotState(els.mascotImg, "walking");
  } else {
    setMascotState(els.mascotImg, "idle");
  }
  wasArrived = data.segment_progress >= 1;

  // 当日分は自動でhistoryに保存する(手動保存ボタンは無い)
  state.history[todayKey()] = {
    steps: data.steps,
    distanceKm: data.distance_km,
    calories: data.calories,
    minutes: data.minutes,
    message: data.message,
    passedStation: data.passed_station,
    nextStation: data.next_station,
    sight: data.next_station_info?.sight ?? null,
    goalMet: state.dailyGoal > 0 && data.steps >= state.dailyGoal,
  };
  saveState(state);
  renderHistoryTab();

  const historyTotal = Object.values(state.history).reduce((sum, r) => sum + r.distanceKm, 0);
  els.totalKm.textContent = historyTotal.toFixed(1);
  await renderLongDistance(historyTotal);
  renderRuler(els.rulerSvgWrap, data.route_stations, data.line_color);
}

function applyConvertResultToUI(data, gpsPath) {
  els.stepsDisplay.innerHTML = `${data.steps.toLocaleString("ja-JP")}<small>歩</small>`;
  els.statDistance.textContent = data.distance_km.toFixed(2);

  updateRouteCard({ fromSign: els.routeFromSign, toSign: els.routeToSign }, data);

  els.infoCalories.textContent = `${data.calories}kcal：${data.food_equivalent.text || "-"}`;
  els.infoWater.textContent = data.water_intake.text || "-";

  const sight = data.next_station_info?.sight;
  if (sight) {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sight + " 京都")}`;
    els.infoSight.innerHTML = `<a href="${url}" target="_blank" rel="noopener">${sight}</a>`;
  } else {
    els.infoSight.textContent = "特になし";
  }

  if (data.passed_station_info && data.next_station_info) {
    updateMapRoute(data.passed_station_info, data.next_station_info, gpsPath);
  }
}

// ---------------------------------------------------------------------------
// アチーブタブ: 累計距離・履歴
// ---------------------------------------------------------------------------
async function renderLongDistance(totalKm) {
  const data = await convertLongDistance(totalKm);
  els.longDistanceList.innerHTML = "";
  data.routes.forEach((r) => {
    const wrap = document.createElement("div");
    wrap.className = "long-route";
    wrap.innerHTML = `
      <div class="long-route-head"><span>${r.name}</span><span>${r.progress_pct}%</span></div>
      <div class="long-route-track">
        <div class="long-route-fill${r.progress_pct >= 100 ? " complete" : ""}" style="width:${r.progress_pct}%"></div>
      </div>`;
    els.longDistanceList.appendChild(wrap);
  });
}

function renderHistoryTab() {
  const entries = Object.entries(state.history).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  els.recordCount.textContent = entries.length;
  els.achieveCount.textContent = entries.filter(([, r]) => r.goalMet).length;

  if (entries.length === 0) {
    els.historyList.innerHTML = `<p class="empty-text">まだ記録がありません。歩き始めると自動で記録されます。</p>`;
    return;
  }

  els.historyList.innerHTML = "";
  entries.forEach(([date, r]) => {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `
      <span class="history-date">${date}${r.goalMet ? " 🏅" : ""}</span>
      <span class="history-detail">${r.steps.toLocaleString("ja-JP")}歩 ／ ${r.distanceKm.toFixed(1)}km</span>`;
    els.historyList.appendChild(row);
  });
}

init();
