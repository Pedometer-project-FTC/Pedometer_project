/**
 * map.js
 * Leaflet(CDN経由で読み込み)を使い、現在の区間(駅→駅)と、
 * GPSで実際に歩いたルートを地図上に表示するモジュール。
 */

let map = null;
let stationMarkers = [];
let routeLine = null;
let gpsLine = null;

/** 地図を初期化する。1度だけ呼び出す想定 */
export function initMap(containerId) {
  if (map) return map;
  map = L.map(containerId, { zoomControl: false, attributionControl: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  map.setView([35.01, 135.77], 14); // 初期表示: 京都市中心部あたり
  return map;
}

/**
 * 現在区間(起点駅→次の駅)を地図上に描画する。
 * @param {{lat:number, lng:number, name:string}} fromStation
 * @param {{lat:number, lng:number, name:string}} toStation
 * @param {Array<{lat:number, lng:number}>} [gpsPath] - GPS実測の座標列(あれば実際の歩行ルートを描く)
 */
export function updateMapRoute(fromStation, toStation, gpsPath) {
  if (!map || !fromStation || !toStation) return;

  stationMarkers.forEach((m) => map.removeLayer(m));
  stationMarkers = [];
  if (routeLine) map.removeLayer(routeLine);
  if (gpsLine) map.removeLayer(gpsLine);

  const fromLatLng = [fromStation.lat, fromStation.lng];
  const toLatLng = [toStation.lat, toStation.lng];

  const fromMarker = L.circleMarker(fromLatLng, {
    radius: 8,
    color: "#3E5C99",
    fillColor: "#3E5C99",
    fillOpacity: 1,
  }).bindTooltip(fromStation.name, { permanent: false });

  const toMarker = L.circleMarker(toLatLng, {
    radius: 9,
    color: "#6FCF97",
    fillColor: "#6FCF97",
    fillOpacity: 1,
  }).bindTooltip(toStation.name, { permanent: false });

  fromMarker.addTo(map);
  toMarker.addTo(map);
  stationMarkers = [fromMarker, toMarker];

  // 駅間の直線(目安ルート)を破線で表示
  routeLine = L.polyline([fromLatLng, toLatLng], {
    color: "#E0522F",
    weight: 3,
    dashArray: "6 6",
  }).addTo(map);

  const bounds = L.latLngBounds([fromLatLng, toLatLng]);

  // GPS実測ルートがあれば、実際に歩いた道を実線で重ねて表示する
  if (gpsPath && gpsPath.length > 1) {
    const latlngs = gpsPath.map((p) => [p.lat, p.lng]);
    gpsLine = L.polyline(latlngs, { color: "#3E5C99", weight: 4 }).addTo(map);
    bounds.extend(gpsLine.getBounds());
  }

  map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
}
