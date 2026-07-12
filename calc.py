"""
calc.py
歩行に関する数値計算をまとめたモジュール。
「駅換算」とは独立した、歩数・距離・カロリー・食べ物換算のロジックを担当する。

このファイルは意図的に Flask に依存しない(純粋関数のみ)。
そうすることでユニットテストがしやすく、将来ネイティブアプリ化する際にも
ロジックだけ流用しやすくなる。
"""

from typing import Optional, TypedDict


# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------

# 歩幅・カロリーの計算に使う既定値(身長・体重が未入力のユーザー向けフォールバック)
DEFAULT_STRIDE_M = 0.65          # 歩幅(m)の既定値
DEFAULT_KCAL_PER_STEP = 0.04     # 体重不明時の1歩あたり消費カロリー概算(kcal)
STEPS_PER_MINUTE = 100           # 歩行ペースの目安(歩/分)

# 身長から歩幅を推定する係数。 歩幅(m) ≒ 身長(cm) × STRIDE_FACTOR / 100
# 一般的に男性は0.45、女性は0.41程度と言われる値の中間を採用(簡易近似値)。
STRIDE_FACTOR_FROM_HEIGHT = 0.42

# 歩行の運動強度(MET値)。普通歩行(時速4km程度)を想定した一般的な値。
WALKING_MET = 3.5


class WalkStats(TypedDict):
    distance_km: float
    calories: int
    minutes: int
    stride_m: float


def estimate_stride_m(height_cm: Optional[float], manual_stride_m: Optional[float]) -> float:
    """
    歩幅(m)を決定する。優先順位:
      1. ユーザーが手動で入力した歩幅
      2. 身長から推定した歩幅
      3. 既定値
    """
    if manual_stride_m and manual_stride_m > 0:
        return manual_stride_m
    if height_cm and height_cm > 0:
        return round(height_cm * STRIDE_FACTOR_FROM_HEIGHT / 100, 3)
    return DEFAULT_STRIDE_M


def minutes_from_distance(distance_km: float, stride_m: float) -> int:
    """距離(km)と歩幅から、歩行時間(分)を概算する(GPS実測で歩数が無い場合用)"""
    speed_km_per_min = (stride_m * STEPS_PER_MINUTE) / 1000
    if speed_km_per_min <= 0:
        return 0
    return round(distance_km / speed_km_per_min)


def calories_from_time(minutes: int, weight_kg: Optional[float], steps: int) -> int:
    """歩行時間(分)からカロリーを計算する。体重が分かればMET法、不明なら歩数概算にフォールバック"""
    if weight_kg and weight_kg > 0:
        hours = minutes / 60
        return round(WALKING_MET * weight_kg * hours)
    return round(steps * DEFAULT_KCAL_PER_STEP)


def compute_walk_stats(
    steps: int,
    height_cm: Optional[float] = None,
    weight_kg: Optional[float] = None,
    manual_stride_m: Optional[float] = None,
) -> WalkStats:
    """
    歩数(と任意の身長体重)から、距離・カロリー・歩行時間を計算する。

    - 距離: 歩幅 × 歩数
    - カロリー: 体重が分かればMET法(運動強度×体重×時間)でより正確に計算。
                不明な場合は歩数あたりの概算値にフォールバックする。
    - 時間: 平均的な歩行ペース(歩/分)から概算
    """
    stride_m = estimate_stride_m(height_cm, manual_stride_m)
    distance_km = round(steps * stride_m / 1000, 3)
    minutes = round(steps / STEPS_PER_MINUTE) if steps > 0 else 0

    if weight_kg and weight_kg > 0:
        hours = minutes / 60
        calories = round(WALKING_MET * weight_kg * hours)
    else:
        calories = round(steps * DEFAULT_KCAL_PER_STEP)

    return {
        "distance_km": distance_km,
        "calories": calories,
        "minutes": minutes,
        "stride_m": stride_m,
    }


# ---------------------------------------------------------------------------
# 水分補給量の目安
# ---------------------------------------------------------------------------
# 一般的な運動時の水分補給目安(15〜20分ごとに100〜150ml程度)を参考にした簡易換算。
# あくまで一般的な目安であり、医療的な指導に代わるものではない。
WATER_ML_PER_MINUTE = 4.0   # 1分あたりの目安水分量(ml)
CUP_ML = 100                # 「コップ1杯」とみなす量(ml)。厳密な計量カップの容量ではなく目安。


def water_intake(minutes: int) -> dict:
    """歩行時間(分)から、適正水分補給量の目安を計算する"""
    if minutes <= 0:
        return {"ml": 0, "cups": 0, "text": ""}

    ml = round(minutes * WATER_ML_PER_MINUTE / 10) * 10  # きりの良い10ml単位に丸める
    cups = round(ml / CUP_ML, 1)
    cup_label = f"コップ{cups}杯" if cups != 1 else "コップ一杯"
    return {"ml": ml, "cups": cups, "text": f"{ml}ml：{cup_label}"}


# ---------------------------------------------------------------------------
# カロリー×食べ物換算
# ---------------------------------------------------------------------------
# 「180kcal」だけ言われてもピンとこないため、身近な食べ物に例える。
# kcal値はいずれも一般に知られている目安値(概算)。
FOOD_TABLE = [
    {"name": "ミニおにぎり", "emoji": "🍙", "kcal": 80},
    {"name": "バナナ", "emoji": "🍌", "kcal": 90},
    {"name": "缶コーヒー", "emoji": "☕", "kcal": 100},
    {"name": "食パン1枚", "emoji": "🍞", "kcal": 160},
    {"name": "おにぎり", "emoji": "🍙", "kcal": 180},
    {"name": "肉まん", "emoji": "🥟", "kcal": 240},
    {"name": "ショートケーキ", "emoji": "🍰", "kcal": 350},
    {"name": "ラーメン", "emoji": "🍜", "kcal": 500},
]


def food_equivalent(calories: int) -> dict:
    """
    消費カロリーに最も近い(の基準となる)食べ物を1つ選び、
    「何個分か」を計算して返す。カロリー0の場合はNoneを返す。
    """
    if calories <= 0:
        return {"food": None, "emoji": None, "count": 0, "text": ""}

    # 消費カロリーに最も近いkcalの食べ物を基準に選ぶ
    closest = min(FOOD_TABLE, key=lambda f: abs(f["kcal"] - calories))
    count = round(calories / closest["kcal"], 1)
    if count <= 0:
        count = 0.1

    count_label = "1個分" if count == 1 else f"{count}個分"
    text = f"{closest['emoji']} {closest['name']} {count_label}"
    return {"food": closest["name"], "emoji": closest["emoji"], "count": count, "text": text}
