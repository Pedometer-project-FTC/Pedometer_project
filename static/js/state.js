/**
 * state.js
 * アプリの状態(歩数・設定・履歴)を localStorage に保存/読み込みするモジュール。
 * サーバーにDBが無いMVP構成のため、この端末内だけで完結する。
 * 将来ログイン機能を追加する際は、ここをAPI経由の同期処理に差し替える想定。
 */

const STORAGE_KEY = "tokotoko_state_v2";

/** 状態の既定値 */
const DEFAULTS = {
  steps: 0,
  dailyGoal: 8000,
  lineId: "tozai",
  originStation: "東山",
  direction: "decrease",
  lastActiveDate: null, // 最後にアプリを使った日付("YYYY-MM-DD")。日付が変わったら歩数を自動リセットする

  // プロフィール(任意入力。歩幅・カロリー計算の精度向上に使う)
  heightCm: null,
  weightKg: null,
  strideCm: null,

  // 1日ごとのスナップショットを自動保存する。
  // { "2026-07-10": { steps, distanceKm, calories, minutes, message,
  //                    passedStation, nextStation, sight, goalMet } }
  history: {},
};

/** localStorageから状態を読み込む。無ければ既定値を返す */
export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

/** 状態をlocalStorageに保存する */
export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** 今日の日付キー("YYYY-MM-DD")を返す */
export function todayKey() {
  return dateKey(new Date());
}

/** 任意のDateを"YYYY-MM-DD"キーに変換する */
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** dateKeyに対してoffsetDays日ずらしたDateを返す */
export function addDays(key, offsetDays) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

/** 表示用に整形した日付文字列(任意の日付。省略時は今日) */
export function formatDateForDisplay(date = new Date()) {
  const week = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getMonth() + 1}月${date.getDate()}日（${week[date.getDay()]}）`;
}
