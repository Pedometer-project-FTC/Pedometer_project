/**
 * gps_tracker.js
 * GPS(Geolocation API)を使って、実際に歩いた距離を測定するモジュール。
 *
 * 【重要な制限】
 * pedometer.js と同様、この画面を開いている間しか計測できない。
 * また、位置情報の取得にはユーザーの許可が必要で、屋内や地下ではGPS精度が
 * 落ちるため、実際の距離と多少のズレが出ることがある点に留意する。
 *
 * 仕組み:
 *   navigator.geolocation.watchPosition で位置更新を受け取るたびに、
 *   直前の地点からの距離をHaversine公式(球面上の2点間の距離を求める公式)で計算し、
 *   合計距離に加算していく。
 */

const EARTH_RADIUS_KM = 6371;

/** 2点間の距離(km)をHaversine公式で計算する */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// GPSの誤差でわずかに動いただけでも距離が加算されてしまうのを防ぐための、
// 「これ未満の移動は無視する」しきい値(km)。屋内での立ち止まり時のノイズ対策。
const MIN_MOVEMENT_KM = 0.003; // 3m

export class GpsTracker {
  /**
   * @param {(state: {distanceKm: number, durationMin: number}) => void} onUpdate
   */
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this._watchId = null;
    this._lastPos = null;
    this._distanceKm = 0;
    this._path = [];
    this._startTime = null;
    this.isRunning = false;
  }

  static isSupported() {
    return "geolocation" in navigator;
  }

  start() {
    if (!GpsTracker.isSupported()) {
      throw new Error("このブラウザは位置情報の取得に対応していません");
    }
    this._distanceKm = 0;
    this._lastPos = null;
    this._path = [];
    this._startTime = performance.now();
    this.isRunning = true;

    this._watchId = navigator.geolocation.watchPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn("GPS取得エラー:", err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  stop() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    this.isRunning = false;
    return this.getState();
  }

  getState() {
    const durationMin = this._startTime
      ? Math.round((performance.now() - this._startTime) / 60000)
      : 0;
    return {
      distanceKm: Math.round(this._distanceKm * 1000) / 1000,
      durationMin,
      path: this._path,
    };
  }

  _handlePosition(pos) {
    const { latitude, longitude } = pos.coords;
    if (this._lastPos) {
      const d = haversineKm(this._lastPos.lat, this._lastPos.lon, latitude, longitude);
      if (d >= MIN_MOVEMENT_KM) {
        this._distanceKm += d;
        this._lastPos = { lat: latitude, lon: longitude };
        this._path.push({ lat: latitude, lng: longitude });
      }
    } else {
      this._lastPos = { lat: latitude, lon: longitude };
      this._path.push({ lat: latitude, lng: longitude });
    }
    this.onUpdate(this.getState());
  }
}
