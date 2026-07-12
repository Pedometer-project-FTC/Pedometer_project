"""
app.py
歩数×駅換算サービス「トコトコ駅歩き」のFlaskエントリーポイント。

設計方針:
  - このファイルは「ルーティングとリクエスト/レスポンスの整形」だけに専念する。
  - 実際の計算ロジックは calc.py (歩数・カロリー計算) と
    stations.py (駅換算ロジック) に分離してあり、ユニットテストが書きやすい。
  - 認証やDBは持たない。歩数・設定・履歴はブラウザの localStorage で管理し、
    サーバーは「計算だけ」を担当するステートレスなAPIとして動く。
    (将来ログイン機能を追加する際は、ここにDBアクセス層を追加する想定)

起動方法:
    pip install -r requirements.txt
    python app.py
    → http://127.0.0.1:5000 にアクセス
"""

from flask import Flask, jsonify, render_template, request

import calc
import stations

app = Flask(__name__)

# アプリ起動時に一度だけ駅データを読み込んでメモリに保持する
STATION_DATA = stations.load_station_data()
DEFAULT_LINE_ID = STATION_DATA.get("default_line_id") or STATION_DATA["lines"][0]["id"]


# ---------------------------------------------------------------------------
# ページ
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """メイン画面(SPA的に1ページで完結。タブ切り替えはフロント側で行う)"""
    return render_template("index.html")


# ---------------------------------------------------------------------------
# API: 駅データ
# ---------------------------------------------------------------------------

@app.route("/api/lines")
def api_lines():
    """対応路線・駅の一覧を返す(起点駅セレクトボックス等に使用)"""
    return jsonify(STATION_DATA)


# ---------------------------------------------------------------------------
# API: 歩数 → 距離・カロリー・駅換算
# ---------------------------------------------------------------------------

@app.route("/api/convert", methods=["POST"])
def api_convert():
    """
    歩数(またはGPSで測定した距離)を、駅換算結果に変換して返す。

    リクエストJSON:
      steps          : int   今日の歩数 (distance_km_override 未指定時は必須)
      distance_km_override : float  GPS等で直接測定した距離(km)。指定時はstepsより優先。
      height_cm      : float 任意。歩幅の精度向上に使用
      weight_kg      : float 任意。カロリー計算の精度向上に使用(MET法)
      stride_m       : float 任意。歩幅を手動指定する場合
      line_id        : str   任意。省略時は先頭の路線
      origin_station : str   任意。省略時は路線の先頭駅
      direction      : "decrease" | "increase" 任意。起点からの進行方向
    """
    body = request.get_json(silent=True) or {}

    steps = body.get("steps") or 0
    distance_override = body.get("distance_km_override")
    line_id = body.get("line_id") or DEFAULT_LINE_ID

    line = stations.get_line(STATION_DATA, line_id)
    if line is None:
        return jsonify({"error": f"路線 '{line_id}' が見つかりません"}), 404

    origin_name = body.get("origin_station") or line["stations"][0]["name"]
    direction = body.get("direction") or "decrease"

    # --- 歩数・距離・カロリーの計算 (calc.py) ---
    if distance_override is not None:
        # GPSトラッキング等で距離が直接わかっている場合はそれを優先する。
        # 歩数が無くても、距離→時間→カロリーの順で計算し直す。
        walk = calc.compute_walk_stats(
            steps=steps,
            height_cm=body.get("height_cm"),
            weight_kg=body.get("weight_kg"),
            manual_stride_m=body.get("stride_m"),
        )
        distance_km = round(float(distance_override), 3)
        effective_steps = steps or round(distance_km * 1000 / walk["stride_m"])
        duration_override = body.get("duration_min")
        minutes = (
            round(duration_override)
            if duration_override
            else calc.minutes_from_distance(distance_km, walk["stride_m"])
        )
        calories = calc.calories_from_time(minutes, body.get("weight_kg"), effective_steps)
        steps = effective_steps
    else:
        if not isinstance(steps, (int, float)) or steps < 0:
            return jsonify({"error": "steps は0以上の数値で指定してください"}), 400
        walk = calc.compute_walk_stats(
            steps=steps,
            height_cm=body.get("height_cm"),
            weight_kg=body.get("weight_kg"),
            manual_stride_m=body.get("stride_m"),
        )
        distance_km = walk["distance_km"]
        minutes = walk["minutes"]
        calories = walk["calories"]

    # --- 駅換算 (stations.py) ---
    try:
        station_result = stations.convert_distance_to_station(
            STATION_DATA, line_id, origin_name, distance_km, direction
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 404

    passed = station_result["passed_station"]
    message = (
        f"今日は{origin_name}駅から{passed}駅まで歩いた距離です"
        if passed != origin_name
        else f"今日は{origin_name}駅の近くを歩いた距離です"
    )

    result = {
        "steps": steps,
        "distance_km": distance_km,
        "calories": calories,
        "minutes": minutes,
        "stride_m": walk["stride_m"],
        "food_equivalent": calc.food_equivalent(calories),
        "water_intake": calc.water_intake(minutes),
        "message": message,
        "current_from": passed,
        "current_to": station_result["next_station"],
        **station_result,
    }
    return jsonify(result)


@app.route("/api/long_distance", methods=["POST"])
def api_long_distance():
    """累計距離を長距離ルート(京都→大阪 等)に換算する"""
    body = request.get_json(silent=True) or {}
    total_km = body.get("total_km")
    if not isinstance(total_km, (int, float)) or total_km < 0:
        return jsonify({"error": "total_km は0以上の数値で指定してください"}), 400

    routes = STATION_DATA["long_distance_routes"]
    results = [
        {
            "name": route["name"],
            "km": route["km"],
            "progress_pct": min(100, round(total_km / route["km"] * 100, 1)),
        }
        for route in routes
    ]
    return jsonify({"total_km": total_km, "routes": results})


if __name__ == "__main__":
    app.run(debug=True)
