/**
 * route_card.js
 * 実際の駅名標(駅番号+漢字+ローマ字+ひらがな)を模した見た目で、
 * 現在歩いている区間(passed_station → next_station)を表示するモジュール。
 */

/**
 * @param {{fromSign: HTMLElement, toSign: HTMLElement}} els
 * @param {object} data - /api/convert のレスポンス
 * @returns {boolean} true: ちょうど区間を歩き切った(到着)瞬間
 */
export function updateRouteCard(els, data) {
  fillStationSign(els.fromSign, data.passed_station_info);
  fillStationSign(els.toSign, data.next_station_info);

  return (data.segment_progress || 0) >= 1;
}

function fillStationSign(signEl, station) {
  if (!signEl || !station) return;
  signEl.querySelector(".station-code").textContent = station.code || "";
  signEl.querySelector(".station-kanji").textContent = station.name;
  signEl.querySelector(".station-romaji").textContent = station.romaji || "";
  signEl.querySelector(".station-kana").textContent = station.kana || "";
}
