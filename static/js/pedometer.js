/**
 * pedometer.js
 * スマホの加速度センサー(DeviceMotion)を使って、簡易的な歩数検出を行うモジュール。
 *
 * 【重要な制限】
 * これはブラウザの Web API を使っているため、この画面(タブ)を開いていて、
 * かつ画面がスリープしていない間しか動作しない。ブラウザを閉じたり
 * 画面を消したりした状態でのバックグラウンド計測は、Web技術だけでは実現できない
 * (実現するにはCapacitor等でネイティブアプリ化する必要がある)。
 *
 * アルゴリズム:
 *   加速度の合成ベクトルの大きさ(magnitude)を監視し、
 *   「一定の閾値を超える山(ピーク)」を検出するたびに1歩とカウントする。
 *   静かなノイズによる誤検出を防ぐため、直前の歩から一定時間(不応期)は
 *   次の歩をカウントしないようにしている。
 */

const STEP_THRESHOLD = 1.2;      // 歩行とみなす加速度変化量のしきい値(m/s^2、経験的な値)
const MIN_STEP_INTERVAL_MS = 280; // 1歩あたりの最短間隔(これより短い間隔は誤検出として無視)

export class Pedometer {
  /**
   * @param {(stepIncrement: number) => void} onStep - 1歩検出するたびに呼ばれるコールバック
   */
  constructor(onStep) {
    this.onStep = onStep;
    this._lastMagnitude = 0;
    this._lastStepTime = 0;
    this._rising = false;
    this._handleMotion = this._handleMotion.bind(this);
    this.isRunning = false;
  }

  /** センサーが利用可能かどうか */
  static isSupported() {
    return typeof DeviceMotionEvent !== "undefined";
  }

  /**
   * センサーの利用許可をリクエストして計測を開始する。
   * iOS Safariでは明示的な許可リクエストが必要(ユーザー操作の直後でないと失敗する点に注意)。
   */
  async start() {
    if (!Pedometer.isSupported()) {
      throw new Error("このブラウザは加速度センサーに対応していません");
    }

    if (typeof DeviceMotionEvent.requestPermission === "function") {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== "granted") {
        throw new Error("センサーの利用が許可されませんでした");
      }
    }

    window.addEventListener("devicemotion", this._handleMotion);
    this.isRunning = true;
  }

  stop() {
    window.removeEventListener("devicemotion", this._handleMotion);
    this.isRunning = false;
  }

  _handleMotion(event) {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc || acc.x === null) return;

    const magnitude = Math.sqrt(
      (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
    );
    const delta = magnitude - this._lastMagnitude;
    this._lastMagnitude = magnitude;

    const now = performance.now();

    // 加速度が急上昇した瞬間を「一歩の踏み込み」とみなす
    if (delta > STEP_THRESHOLD && !this._rising) {
      this._rising = true;
      if (now - this._lastStepTime > MIN_STEP_INTERVAL_MS) {
        this._lastStepTime = now;
        this.onStep(1);
      }
    } else if (delta < 0) {
      this._rising = false;
    }
  }
}
