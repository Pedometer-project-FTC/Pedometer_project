"""
stations.py
「歩いた距離を駅間距離に換算する」ロジックを担当するモジュール。
Flaskに依存しない純粋関数のみで構成し、テストしやすくしている。
"""

import json
import os
from typing import Optional


DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "stations.json")


def load_station_data(path: str = DATA_PATH) -> dict:
    """路線・駅データ(JSON)を読み込む"""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_line(station_data: dict, line_id: str) -> Optional[dict]:
    """路線IDから路線データを取得する"""
    for line in station_data["lines"]:
        if line["id"] == line_id:
            return line
    return None


def get_station(line: dict, name: str) -> Optional[dict]:
    """路線データの中から駅名で駅を検索する"""
    return next((s for s in line["stations"] if s["name"] == name), None)


def find_segment(stations: list, target_cum: float) -> dict:
    """
    起点からの絶対キロ程(target_cum)が、どの駅とどの駅の間にあるかを求める。

    stations は cum_km (起点からの累積距離) の昇順であることを前提とする。
    路線の端をはみ出した場合は overshoot に "start" / "end" を入れて返す。

    戻り値の from_station / to_station は「cum_kmが小さい方 / 大きい方」で
    固定されており、進行方向(北行き/南行き)の意味づけは呼び出し側で行う。
    """
    max_cum = stations[-1]["cum_km"]
    min_cum = stations[0]["cum_km"]
    overshoot = None

    if target_cum < min_cum:
        overshoot = "start"
        target_cum = min_cum
    elif target_cum > max_cum:
        overshoot = "end"
        target_cum = max_cum

    for i in range(len(stations) - 1):
        lo, hi = stations[i], stations[i + 1]
        if lo["cum_km"] <= target_cum <= hi["cum_km"]:
            span = hi["cum_km"] - lo["cum_km"]
            progress = 0.0 if span == 0 else (target_cum - lo["cum_km"]) / span
            return {
                "from_station": lo["name"],
                "to_station": hi["name"],
                "progress": round(progress, 3),
                "overshoot": overshoot,
            }

    # target_cum がちょうど端点と一致する場合のフォールバック
    edge = stations[0] if target_cum <= min_cum else stations[-1]
    return {
        "from_station": edge["name"],
        "to_station": edge["name"],
        "progress": 0.0,
        "overshoot": overshoot,
    }


def build_route_list(stations: list, origin: dict, target_cum: float, direction: str) -> list:
    """
    路線図UI表示用に、起点から現在地までの駅リストを status付きで返す。
    status: "passed"(通過済み) / "current"(現在地を示す仮想マーカー)
    """
    lo_cum, hi_cum = sorted([origin["cum_km"], target_cum])
    in_range = [s for s in stations if lo_cum <= s["cum_km"] <= hi_cum]

    # 起点から進行方向へ並べ替え(北行き=decrease ならcum_km降順)
    in_range.sort(key=lambda s: s["cum_km"], reverse=(direction == "decrease"))

    route = [{"name": s["name"], "status": "passed"} for s in in_range]

    # 現在地がちょうど駅と一致しない場合、末尾に仮想の"current"地点を追加する
    if not any(abs(s["cum_km"] - target_cum) < 1e-6 for s in in_range):
        route.append({"name": None, "status": "current"})
    elif route:
        route[-1]["status"] = "current"

    return route


def convert_distance_to_station(
    station_data: dict,
    line_id: str,
    origin_name: str,
    distance_km: float,
    direction: str,
) -> dict:
    """
    距離(km)を駅換算結果に変換するメイン関数。

    戻り値には以下を含む:
      - passed_station / next_station: 進行方向を踏まえた「通過済み駅」「次の駅」
      - segment_progress: 次の駅までの区間内での進捗(0〜1)
      - route_stations: 路線図UI描画用の駅リスト
      - line_complete: 路線の端まで歩き切ったかどうか
    """
    line = get_line(station_data, line_id)
    if line is None:
        raise ValueError(f"路線 '{line_id}' が見つかりません")

    stations = line["stations"]
    origin = get_station(line, origin_name)
    if origin is None:
        raise ValueError(f"駅 '{origin_name}' が見つかりません")

    target_cum = origin["cum_km"] + distance_km if direction == "increase" else origin["cum_km"] - distance_km

    segment = find_segment(stations, target_cum)
    route_stations = build_route_list(stations, origin, target_cum, direction)

    # find_segment は cum_km 昇順(from=小 / to=大)で返すため、
    # 実際の進行方向に合わせて「通過済み駅」と「次の駅」を組み直す。
    if direction == "increase":
        passed_station, next_station = segment["from_station"], segment["to_station"]
        line_complete = segment["overshoot"] == "end"
    else:
        passed_station, next_station = segment["to_station"], segment["from_station"]
        line_complete = segment["overshoot"] == "start"

    passed = get_station(line, passed_station)
    nxt = get_station(line, next_station)

    return {
        "line_name": line["name"],
        "line_color": line["color"],
        "origin_station": origin_name,
        "direction": direction,
        "passed_station": passed_station,
        "next_station": next_station,
        "passed_station_info": passed,
        "next_station_info": nxt,
        "segment_progress": segment["progress"],
        "line_complete": line_complete,
        "route_stations": route_stations,
    }
