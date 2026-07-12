/**
 * tabs.js
 * 下部ナビゲーションによる3画面(記録/アチーブ/アカウント)の切り替えを担当する。
 */

export function initTabs() {
  const navButtons = document.querySelectorAll(".nav-btn");
  const panels = document.querySelectorAll(".tab-panel");

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tab;

      panels.forEach((p) => p.classList.toggle("hidden", p.id !== targetId));
      navButtons.forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
}
