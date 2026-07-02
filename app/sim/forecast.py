"""수요예측(Linear Regression) + 재고 위험등급 (docs/06 §7, docs/07 §4~8).

DES의 Far Future 입력(수요 평균 λ)과 피킹 우선순위의 위험등급을 제공한다.
"""
from datetime import date, timedelta

import numpy as np

from config import settings
from tools.common import q


def _base_date() -> date:
    return date.fromisoformat(settings.base_date)


def fit_demand(sku: str):
    """일별 출고량으로 수요 예측 함수 f(k)=미래 k일째 예상 수요 반환.

    Fallback(docs/07 §8): 30일↑ LR / 14일↑ MA14 / 7일↑ MA7 / 7일 미만 예측불가.
    """
    rows = q("SELECT shipped_qty FROM demand_history WHERE sku=? ORDER BY demand_date", (sku,))
    n = len(rows)
    if n < 7:
        return None, "insufficient_data"
    y = np.array([r["shipped_qty"] for r in rows], dtype=float)
    if n >= 30:
        x = np.arange(n)
        a, b = np.polyfit(x, y, 1)
        return (lambda k: max(0.0, a * (n - 1 + k) + b)), "linear_regression"
    if n >= 14:
        m = float(y[-14:].mean())
        return (lambda k: max(0.0, m)), "ma_14"
    m = float(y[-7:].mean())
    return (lambda k: max(0.0, m)), "ma_7"


def _backlog_demand(sku: str) -> int:
    """미처리 출고 수요 = 아직 출고되지 않은(PLANNED/ALLOCATED) 주문 라인의 요청 수량 합.
    현시점에 이미 밀려 있는(누적) 출고 물량이므로, 소진 판정 시 즉시 소비로 반영한다."""
    r = q("""SELECT COALESCE(SUM(l.qty),0) s FROM outbound_order_lines l
             JOIN outbound_orders o ON o.order_no=l.order_no
             WHERE l.sku=? AND o.status IN ('PLANNED','ALLOCATED')""", (sku,))
    return r[0]["s"] or 0


def inventory_forecast(sku: str, forecast_days: int = 30) -> dict:
    p = q("SELECT safety_stock FROM products WHERE sku=?", (sku,))
    if not p:
        return {"error": "SKU 없음"}
    safety = p[0]["safety_stock"]
    f, method = fit_demand(sku)
    cur = q("SELECT COALESCE(SUM(qty),0) s FROM inventory WHERE sku=? AND status='AVAILABLE'", (sku,))[0]["s"]
    from bb.reservations import reserved              # 예약재고 단일출처 차감(가용 = on_hand - reserved)
    available = max(0, cur - reserved(sku))
    today = date.today()                              # 실시간 '오늘' 기준(고정 base_date 아님)
    backlog = _backlog_demand(sku)
    net = available - backlog                         # 미처리 출고를 즉시 반영한 순 가용

    if method == "insufficient_data":
        return {"sku": sku, "method": method, "reference_date": today.isoformat(),
                "current_stock": available, "backlog_demand": backlog, "net_available": net,
                "already_short": net <= 0, "safety_stock": safety,
                "expected_stockout_date": today.isoformat() if net <= 0 else None,
                "safety_stock_reach_date": None, "daily_projection": []}

    daily = max(0.0, float(f(1)))                     # 최근 추세 기준 일평균 수요
    proj, stockout, safety_reach = [], None, None
    already_short = net <= 0                          # 미처리 출고 반영 시 이미 소진(결품) 상태
    if already_short:
        stockout = today.isoformat()                 # 현시점 기준 이미 소진되었어야 함
        if available <= safety:
            safety_reach = today.isoformat()
    elif daily > 0:
        inv = float(net)                              # 미처리 출고 해소 후 남는 재고에서 향후 수요 차감
        for k in range(1, forecast_days + 1):
            ds = (today + timedelta(days=k)).isoformat()
            inv -= daily
            proj.append({"date": ds, "projected_inventory": round(inv, 1)})
            if stockout is None and inv <= 0:
                stockout = ds
            if safety_reach is None and inv <= safety:
                safety_reach = ds

    return {"sku": sku, "method": method, "reference_date": today.isoformat(),
            "current_stock": available, "backlog_demand": backlog, "net_available": net,
            "daily_demand": round(daily, 2), "already_short": already_short, "safety_stock": safety,
            "expected_stockout_date": stockout, "safety_stock_reach_date": safety_reach,
            "daily_projection": proj}


def calculate_inventory_risk(sku: str) -> dict:
    fc = inventory_forecast(sku)
    if fc.get("method") == "insufficient_data" and not fc.get("already_short"):
        return {"sku": sku, "risk_level": "UNKNOWN", "expected_stockout_date": None,
                "already_short": fc.get("already_short", False),
                "current_stock": fc.get("current_stock"), "backlog_demand": fc.get("backlog_demand"),
                "net_available": fc.get("net_available")}
    so, sd = fc["expected_stockout_date"], fc.get("safety_stock_reach_date")
    today = date.today()                              # 실시간 '오늘' 기준으로 위험등급 판정
    if fc.get("already_short"):
        level = "HIGH"                                # 미처리 출고 반영 시 이미 소진 → 최우선
    elif so:
        days = (date.fromisoformat(so) - today).days
        level = "HIGH" if days <= 7 else "MEDIUM" if days <= 14 else "LOW"
    elif sd:
        level = "WATCH"
    else:
        level = "LOW"
    return {"sku": sku, "risk_level": level, "expected_stockout_date": so, "safety_stock_reach_date": sd,
            "already_short": fc.get("already_short", False), "current_stock": fc.get("current_stock"),
            "backlog_demand": fc.get("backlog_demand"), "net_available": fc.get("net_available")}


def scan_inventory_risk(risk_levels: list[str] | None = None) -> dict:
    out = []
    for r in q("SELECT sku FROM products"):
        risk = calculate_inventory_risk(r["sku"])
        out.append({"sku": r["sku"], "risk_level": risk["risk_level"],
                    "expected_stockout_date": risk["expected_stockout_date"],
                    "already_short": risk.get("already_short", False),
                    "current_stock": risk.get("current_stock"), "backlog_demand": risk.get("backlog_demand")})
    if risk_levels:
        out = [x for x in out if x["risk_level"] in risk_levels]
    return {"risks": out}


def required_order_quantities(limit: int | None = None) -> dict:
    """부족/위험 SKU별 필요 발주량 = 미처리 출고 + 안전재고 − 현재 가용 (양수인 SKU만).

    '주문(발주)량'은 고객 출고주문 할당이 아니라, 미처리 출고를 모두 채우고 안전재고를 회복하는 데
    필요한 보충/구매 수량이다."""
    onhand = {r["sku"]: r["s"] for r in
              q("SELECT sku, COALESCE(SUM(qty),0) s FROM inventory WHERE status='AVAILABLE' GROUP BY sku")}
    resv = {r["sku"]: r["s"] for r in
            q("SELECT sku, COALESCE(SUM(qty),0) s FROM inventory_reservations WHERE status='RESERVED' GROUP BY sku")}
    backlog = {r["sku"]: r["s"] for r in
               q("""SELECT l.sku, COALESCE(SUM(l.qty),0) s FROM outbound_order_lines l
                    JOIN outbound_orders o ON o.order_no=l.order_no
                    WHERE o.status IN ('PLANNED','ALLOCATED') GROUP BY l.sku""")}
    out = []
    for r in q("SELECT sku, safety_stock FROM products"):
        sku, safety = r["sku"], r["safety_stock"] or 0
        avail = max(0, onhand.get(sku, 0) - resv.get(sku, 0))
        bl = backlog.get(sku, 0)
        required = max(0, bl + safety - avail)
        if required <= 0:
            continue
        out.append({"sku": sku, "current_stock": avail, "backlog_demand": bl,
                    "safety_stock": safety, "required_order_qty": required})
    out.sort(key=lambda x: -x["required_order_qty"])
    return {"count": len(out), "total_required_qty": sum(x["required_order_qty"] for x in out),
            "note": "필요 발주량 = 미처리 출고 + 안전재고 − 현재 가용",
            "items": out[:limit] if limit else out}


def risk_level_map() -> dict:
    """{sku: risk_level} — recommend_picking의 shortage_risk_score 주입용."""
    return {x["sku"]: x["risk_level"] for x in scan_inventory_risk()["risks"]}
