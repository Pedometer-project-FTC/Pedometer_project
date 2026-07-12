/**
 * food.js
 * ------------------------------------------------------------
 * 消費カロリー(kcal)を「おにぎり1個分」のような、
 * 身近な食べ物の個数に置き換えて表示するためのモジュール。
 * 数字だけの「◯kcal」より直感的にイメージしやすくする狙い。
 * ------------------------------------------------------------
 */

// 食べ物ごとの目安カロリー(kcal)。一般的な栄養成分表示に基づく概算値。
const FOODS = [
  { name: "おにぎり", unit: "個", kcal: 180, emoji: "🍙" },
  { name: "板チョコ", unit: "枚", kcal: 280, emoji: "🍫" },
  { name: "バナナ", unit: "本", kcal: 90, emoji: "🍌" },
  { name: "缶ビール(350ml)", unit: "本", kcal: 140, emoji: "🍺" },
  { name: "食パン(6枚切り)", unit: "枚", kcal: 160, emoji: "🍞" },
  { name: "ショートケーキ", unit: "個", kcal: 340, emoji: "🍰" },
  { name: "たい焼き", unit: "個", kcal: 220, emoji: "🐟" },
];

/**
 * 消費カロリーに近い食べ物を1つ選び、「◯個分」の文言を作る。
 * 個数が0.3〜3個くらいに収まる食べ物を優先的に選ぶことで、
 * 「たい焼き0.02個分」のような不自然な表示を避ける。
 *
 * @param {number} calories - 消費カロリー(kcal)
 * @returns {{ text: string, emoji: string }}
 */
export function calorieToFood(calories) {
  if (!calories || calories <= 0) {
    return { text: "歩数を入力するとカロリーを食べ物に換算します", emoji: "🍽️" };
  }

  // 各食べ物について「何個分か」を計算し、1個分に近いものを優先的に選ぶ
  let best = null;
  let bestScore = Infinity;
  for (const food of FOODS) {
    const count = calories / food.kcal;
    // 0.3個〜3個くらいに収まるものを「ちょうどいい」とみなすスコアリング
    const score = Math.abs(Math.log(count / 1.0));
    if (count >= 0.15 && score < bestScore) {
      bestScore = score;
      best = { ...food, count };
    }
  }

  // どれも極端な数値になる場合は最初の食べ物にフォールバック
  if (!best) {
    const food = FOODS[0];
    best = { ...food, count: calories / food.kcal };
  }

  const countText = formatCount(best.count);
  return {
    text: `${best.name} ${countText}${best.unit}分`,
    emoji: best.emoji,
  };
}

/** 個数を見やすい形式にする(1個未満は小数第1位、それ以上は整数寄り) */
function formatCount(count) {
  if (count < 1) return count.toFixed(1);
  if (count < 10) return count.toFixed(1);
  return Math.round(count).toString();
}
