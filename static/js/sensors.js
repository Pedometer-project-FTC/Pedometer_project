/**
 * sensors.js
 * ------------------------------------------------------------
 * 「アプリを開いている間」に限り、端末のセンサーを使って
 *   1) 加速度センサーによる歩数の自動検出(簡易ペドメーター)
 *   2) GPSによる移動距離の自動計測
 * を行うモジュール。
 *
 * 【重要な制約】
 * ブラウザ(Web技術)には、タブ/アプリを閉じている間もバックグラウンドで
 * センサーを読み続ける仕組みが存在しない。そのため、この計測は
 * 「画面を開いている間だけ」有効。閉じている間も計測したい場合は、
 * Capacitor等でネイティブアプリ化する必要がある。
 * ------------------------------------------------------------
 */

/* ============================================================
   1. 加速度センサーによる歩数検出
   ============================================================
   考え方:
   端末を持って歩くと、上下方向の加速度(合成ベクトルの大きさ)が
   周期的に上下する。このピーク(山)を1歩としてカウントする、
   「ピーク検出方式」のシンプルな実装。
   医療機器レベルの精度はないが、デモ・体験用途としては十分。
*/

const STEP_THRESHOLD = 1.9;     // これを超える加速度変化を「1歩の候補」とみなす感度しきい値
const STEP_MIN_INTERVAL_MS = 280; // 1歩あたり最短でもこれだけの間隔を空ける(誤検出/連続カウント防止)

export class StepSensor {
  /**
   * @param {(stepDelta: number) => void} onStep - 歩数が1歩増えるたびに呼ばれるコールバック
   */
  constructor(onStep) {
    this.onStep = onStep;
    this._lastMagnitude = 0;
    this._lastStepAt = 0;
    this._handleMotion = this._handleMotion.bind(this);
    this.active = false;
  }

  /** iOS13+はユーザー操作直後にpermissionを要求する必要があるため、明示的に呼び出す */
  static async isSupported() {
    return typeof window !== "undefined" && "DeviceMotionEvent" in window;
  }

  /** センサーの利用許可をリクエストする(iOSのみ確認ダイアログが出る) */
  static async requestPermission() {
    const DME = window.DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === "function") {
      const result = await DME.requestPermission();
      return result === "granted";
    }
    // Androidなど、許可リクエストが不要な環境ではそのまま許可扱い
    return true;
  }

  start() {
    if (this.active) return;
    window.addEventListener("devicemotion", this._handleMotion, { passive: true });
    this.active = true;
  }

  stop() {
    window.removeEventListener("devicemotion", this._handleMotion);
    this.active = false;
  }

  _handleMotion(event) {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) return;

    const magnitude = Math.sqrt(
      (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
    );
    const delta = Math.abs(magnitude - this._lastMagnitude);
    this._lastMagnitude = magnitude;

    const now = Date.now();
    if (delta > STEP_THRESHOLD && now - this._lastStepAt > STEP_MIN_INTERVAL_MS) {
      this._lastStepAt = now;
      this.onStep(1);
    }
  }
}

/* ============================================================
   2. GPSによる距離計測
   ============================================================
   考え方:
   watchPositionで位置を継続取得し、直前の座標との間の距離を
   ハーバサイン(Haversine)公式で計算して積算する。
   歩数センサーより実距離に近い値が取れるため、
   「GPSモード」がONの間は歩数由来の距離より優先して使う。
*/

const EARTH_RADIUS_M = 6371000;
const GPS_MIN_ACCURACY_M = 30; // これより精度(誤差半径)が悪い測位は無視する
const GPS_MIN_MOVE_M = 3;      // これより小さい移動はGPSノイズとみなして無視する

export class GpsTracker {
  /**
   * @param {(totalDistanceM: number, deltaM: number) => void} onUpdate
   */
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this._watchId = null;
    this._lastCoords = null;
    this.totalDistanceM = 0;
    this.active = false;
  }

  static isSupported() {
    return typeof navigator !== "undefined" && "geolocation" in navigator;
  }

  start() {
    if (this.active || !GpsTracker.isSupported()) return;
    this._watchId = navigator.geolocation.watchPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn("GPS取得エラー:", err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    this.active = true;
  }

  stop() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    this._lastCoords = null;
    this.active = false;
  }

  reset() {
    this.totalDistanceM = 0;
    this._lastCoords = null;
  }

  _handlePosition(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    if (accuracy && accuracy > GPS_MIN_ACCURACY_M) return; // 精度が悪い測位は捨てる

    if (this._lastCoords) {
      const deltaM = haversineDistanceM(this._lastCoords, { latitude, longitude });
      if (deltaM >= GPS_MIN_MOVE_M) {
        this.totalDistanceM += deltaM;
        this._lastCoords = { latitude, longitude };
        this.onUpdate(this.totalDistanceM, deltaM);
      }
      // 微小移動はノイズとして無視し、基準点も更新しない
    } else {
      this._lastCoords = { latitude, longitude };
    }
  }
}

/** 2点間の距離をハーバサイン公式で計算する(メートル単位) */
function haversineDistanceM(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}
