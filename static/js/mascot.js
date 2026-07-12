/**
 * mascot.js
 * マスコットの<img>要素に対して、状態に応じたCSSアニメーションクラスを
 * 付け替えるだけのモジュール。実際のイラスト画像は
 * static/img/mascot.png (差し替え用プレースホルダー) を参照している。
 *
 * 状態:
 *   idle      - 立ち止まっている
 *   walking   - 歩いている(センサー/GPS計測中)
 *   celebrate - 目的の駅に到着した時のお祝いアニメーション
 */

/**
 * マスコットの状態を切り替える。
 * @param {HTMLImageElement} imgEl
 * @param {"idle"|"walking"|"celebrate"} state
 */
export function setMascotState(imgEl, state) {
  imgEl.classList.remove("mascot-idle", "mascot-walking", "mascot-celebrate");
  imgEl.classList.add(`mascot-${state}`);

  if (state === "celebrate") {
    spawnConfetti(imgEl.parentElement);
  }
}

/** お祝い演出用の紙吹雪を数個生成し、アニメーション後に自動で消す */
function spawnConfetti(containerEl) {
  if (!containerEl) return;
  const colors = ["#F3A98B", "#6FCF57", "#F2C94C", "#7FB8E0"];
  for (let i = 0; i < 10; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${55 + Math.random() * 30}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.2}s`;
    containerEl.appendChild(piece);
    setTimeout(() => piece.remove(), 1600);
  }
}
