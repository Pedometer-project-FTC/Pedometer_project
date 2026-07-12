/**
 * api.js
 * バックエンド(Flask)のAPIを呼び出す関数をまとめたモジュール。
 * fetchの詳細をここに閉じ込め、他のファイルからは意味のある関数名で呼べるようにする。
 */

/** 対応路線・駅の一覧を取得する */
export async function fetchLines() {
  const res = await fetch("/api/lines");
  if (!res.ok) throw new Error("路線データの取得に失敗しました");
  return res.json();
}

/**
 * 歩数(またはGPS実測距離)を駅換算結果に変換する。
 * @param {object} params - steps, distanceKmOverride, durationMin, heightCm, weightKg,
 *                           strideCm, lineId, originStation, direction
 */
export async function convertSteps(params) {
  const body = {
    steps: params.steps,
    distance_km_override: params.distanceKmOverride ?? null,
    duration_min: params.durationMin ?? null,
    height_cm: params.heightCm ?? null,
    weight_kg: params.weightKg ?? null,
    stride_m: params.strideCm ? params.strideCm / 100 : null,
    line_id: params.lineId,
    origin_station: params.originStation,
    direction: params.direction,
  };
  const res = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("駅換算の計算に失敗しました");
  return res.json();
}

/** 累計距離(km)を長距離ルートへの進捗に変換する */
export async function convertLongDistance(totalKm) {
  const res = await fetch("/api/long_distance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ total_km: totalKm }),
  });
  if (!res.ok) throw new Error("累計距離の計算に失敗しました");
  return res.json();
}
