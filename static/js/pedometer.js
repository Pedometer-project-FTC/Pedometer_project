/**
 * pedometer.js
 * スマホの加速度センサー(DeviceMotion)を使って、簡易的な歩数検出を行うモジュール。
 * 【改善版：ローパス・ハイパスフィルタ、移動平均、ピーク検知、および「6歩目からカウント」機能搭載】
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

const STEP_THRESHOLD = 2.5;       // 歩行とみなす加速度変化量のしきい値（1.5〜2.5付近で調整）
const MIN_STEP_INTERVAL_MS = 500; // 1歩あたりの最短間隔（ミリ秒）。チャタリング（誤検知）防止用

// 連続歩行判定用の設定
const BUFFER_REQUIRED_STEPS = 6;  // 何歩目からカウントを開始するか（6歩以上連続で歩いたらカウント開始）
const TIMEOUT_RESET_MS = 2000;    // 連続歩行が途切れたとみなす時間（2秒間次の歩行がないとリセット）

export class Pedometer {
  /**
   * @param {(stepIncrement: number) => void} onStep - 検出した歩数を通知するコールバック
   */
  constructor(onStep) {
    this.onStep = onStep;
    this.isRunning = false;

    // フィルタ・ノイズ除去用の変数
    this._gravity = { x: 0, y: 0, z: 0 };
    this._history = [];
    this._historySize = 5; // 移動平均を取るデータ数
    this._lastNormalizedAcc = 0;
    this._isIncreasing = false;
    this._lastStepTime = 0;

    // 「6歩目からカウント」用の変数
    this._stepBufferCount = 0; // 連続して歩いた一時的な歩数
    this._hasStartedCounting = false; // 連続歩行の基準（6歩）を超えたかどうかのフラグ

    // イベントリスナーのバインド
    this._handleMotion = this._handleMotion.bind(this);
  }

  /** センサーが利用可能かどうか */
  static isSupported() {
    return typeof DeviceMotionEvent !== "undefined";
  }

  /** 計測を開始する */
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

    // 各変数を初期化
    this._gravity = { x: 0, y: 0, z: 0 };
    this._history = [];
    this._lastNormalizedAcc = 0;
    this._isIncreasing = false;
    this._lastStepTime = performance.now();

    // 連続歩行判定用の変数も初期化
    this._stepBufferCount = 0;
    this._hasStartedCounting = false;

    window.addEventListener("devicemotion", this._handleMotion);
    this.isRunning = true;
  }

  /** 計測を停止する */
  stop() {
    window.removeEventListener("devicemotion", this._handleMotion);
    this.isRunning = false;
  }

  /** 加速度センサーのイベントハンドラ */
  _handleMotion(event) {
    let acc = event.acceleration;

    // Android等で重力成分なしが取得できない場合のフォールバック
    if (!acc || acc.x === null) {
      const raw = event.accelerationIncludingGravity;
      if (!raw || raw.x === null) return;

      const k = 0.8;
      this._gravity.x = k * this._gravity.x + (1 - k) * raw.x;
      this._gravity.y = k * this._gravity.y + (1 - k) * raw.y;
      this._gravity.z = k * this._gravity.z + (1 - k) * raw.z;

      acc = {
        x: raw.x - this._gravity.x,
        y: raw.y - this._gravity.y,
        z: raw.z - this._gravity.z
      };
    }

    const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);

    this._history.push(magnitude);
    if (this._history.length > this._historySize) {
      this._history.shift();
    }
    const smoothAcc = this._history.reduce((a, b) => a + b, 0) / this._history.length;

    const now = performance.now();

    // ピーク検知
    if (smoothAcc > this._lastNormalizedAcc) {
      this._isIncreasing = true;
    } else if (smoothAcc < this._lastNormalizedAcc && this._isIncreasing) {
      this._isIncreasing = false;

      if (this._lastNormalizedAcc > STEP_THRESHOLD) {
        if (now - this._lastStepTime > MIN_STEP_INTERVAL_MS) {

          // ─── ここから「最初の6歩」判定ロジック ───

          // 前回の1歩から2秒以上空いていたら、立ち止まったとみなしてカウントをリセット
          if (now - this._lastStepTime > TIMEOUT_RESET_MS) {
            this._stepBufferCount = 0;
            this._hasStartedCounting = false;
          }

          this._lastStepTime = now;
          this._stepBufferCount++; // 連続歩行数を1つ増やす

          if (this._hasStartedCounting) {
            // すでに6歩以上の連続歩行が確定している場合は、1歩ずつリアルタイムに加算
            this.onStep(1);
          } else {
            // まだ連続歩行が6歩に達していない場合
            if (this._stepBufferCount >= BUFFER_REQUIRED_STEPS) {
              // 6歩目に達した瞬間！これまで貯めていた「6歩分」をまとめてドカンと追加する
              this._hasStartedCounting = true;
              this.onStep(this._stepBufferCount);
            }
            // 5歩目までは画面上の歩数は増えず、裏で `_stepBufferCount` が貯まるだけになります
          }

          // ─────────────────────────────────────────
        }
      }
    }

    this._lastNormalizedAcc = smoothAcc;
  }
}
