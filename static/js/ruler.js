/**
 * ruler.js
 * 「駅間ものさし」— 起点から現在地までの駅を線でつないで見せる、
 * このアプリのシグネチャーとなるSVG描画を担当するモジュール。
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const STEP_GAP = 90;   // 駅と駅の間の描画上の間隔(px)
const TRACK_Y = 46;    // ラインのY座標

/**
 * 駅間ものさしを描画する。
 * @param {HTMLElement} wrapEl - 描画先のラッパー要素
 * @param {Array<{name: string|null, status: "passed"|"current"}>} routeStations
 * @param {string} lineColor - 路線カラー(HEX)
 */
export function renderRuler(wrapEl, routeStations, lineColor) {
  wrapEl.innerHTML = "";
  const n = routeStations.length;
  if (n === 0) return;

  const width = Math.max(320, (n - 1) * STEP_GAP + 60);
  const height = 90;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "駅間の到達位置を示す図");

  svg.appendChild(drawBaseLine(width));

  const passedCount = routeStations.filter((s) => s.status === "passed").length;
  const lastPassedIdx = Math.max(0, passedCount - 1);
  const progressX = 30 + lastPassedIdx * STEP_GAP;
  svg.appendChild(drawProgressLine(progressX, n, lineColor));

  routeStations.forEach((s, i) => {
    const cx = 30 + i * STEP_GAP;
    drawStationMarker(svg, s, cx, lineColor);
  });

  wrapEl.appendChild(svg);

  // 現在地が見えるよう、横スクロール位置を自動調整する
  requestAnimationFrame(() => {
    wrapEl.scrollLeft = Math.max(0, progressX - wrapEl.clientWidth / 2);
  });
}

function drawBaseLine(width) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", 30);
  line.setAttribute("y1", TRACK_Y);
  line.setAttribute("x2", width - 30);
  line.setAttribute("y2", TRACK_Y);
  line.setAttribute("stroke", "#E4E1D8");
  line.setAttribute("stroke-width", 6);
  line.setAttribute("stroke-linecap", "round");
  return line;
}

function drawProgressLine(progressX, stationCount) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", 30);
  line.setAttribute("y1", TRACK_Y);
  line.setAttribute("x2", stationCount > 1 ? progressX : 30);
  line.setAttribute("y2", TRACK_Y);
  line.setAttribute("stroke", "var(--line-green, #009944)");
  line.setAttribute("stroke-width", 6);
  line.setAttribute("stroke-linecap", "round");
  return line;
}

function drawStationMarker(svg, station, cx, color) {
  const isCurrent = station.status === "current";
  const isPassed = station.status === "passed";

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", cx);
  circle.setAttribute("cy", TRACK_Y);
  circle.setAttribute("r", isCurrent ? 12 : 8);
  circle.setAttribute("fill", isCurrent ? "#fff" : isPassed ? color : "#fff");
  circle.setAttribute("stroke", color);
  circle.setAttribute("stroke-width", isCurrent ? 4 : 3);
  svg.appendChild(circle);

  if (isCurrent) {
    svg.appendChild(drawPulse(cx, color));
  }

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("x", cx);
  label.setAttribute("y", TRACK_Y + 30);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "13");
  label.setAttribute("font-weight", isCurrent ? "700" : "500");
  label.setAttribute("fill", isCurrent ? "#1A1A1A" : "#5F5F5F");
  label.textContent = isCurrent ? "▲今ここ" : station.name;
  svg.appendChild(label);

  if (isCurrent && station.name) {
    const nameLabel = document.createElementNS(SVG_NS, "text");
    nameLabel.setAttribute("x", cx);
    nameLabel.setAttribute("y", TRACK_Y - 20);
    nameLabel.setAttribute("text-anchor", "middle");
    nameLabel.setAttribute("font-size", "12");
    nameLabel.setAttribute("fill", "#5F5F5F");
    nameLabel.textContent = station.name;
    svg.appendChild(nameLabel);
  }
}

function drawPulse(cx, color) {
  const pulse = document.createElementNS(SVG_NS, "circle");
  pulse.setAttribute("cx", cx);
  pulse.setAttribute("cy", TRACK_Y);
  pulse.setAttribute("r", 12);
  pulse.setAttribute("fill", "none");
  pulse.setAttribute("stroke", color);
  pulse.setAttribute("stroke-width", 2);
  pulse.setAttribute("opacity", "0.6");

  const animR = document.createElementNS(SVG_NS, "animate");
  animR.setAttribute("attributeName", "r");
  animR.setAttribute("values", "12;20;12");
  animR.setAttribute("dur", "2s");
  animR.setAttribute("repeatCount", "indefinite");

  const animOpacity = document.createElementNS(SVG_NS, "animate");
  animOpacity.setAttribute("attributeName", "opacity");
  animOpacity.setAttribute("values", "0.6;0;0.6");
  animOpacity.setAttribute("dur", "2s");
  animOpacity.setAttribute("repeatCount", "indefinite");

  pulse.appendChild(animR);
  pulse.appendChild(animOpacity);
  return pulse;
}
