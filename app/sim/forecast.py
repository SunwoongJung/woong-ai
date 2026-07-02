"""수요예측(Linear Regression) + 재고 위험등급 (docs/06 §7, docs/07 §4~8).

DES의 Far Future 입력(수요 평균 λ)과 피킹 우선순위의 위험등급을 제공한다.
"""
import re
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


def _incoming_supply(sku: str) -> dict:
    """도착 예정 입고 수량 = 아직 재고(AVAILABLE)로 반영되지 않은 입고건(발주 포함).
    PLANNED(운송중)·RECEIVED(입하)·STOCKING_TASK_CREATED(적치중)를 합산하고 가장 이른 도착예정일을 함께 준다."""
    rows = q("""SELECT inbound_no, qty, expected_date, status, supplier FROM inbound_orders
                WHERE sku=? AND status IN ('PLANNED','RECEIVED','STOCKING_TASK_CREATED')
                ORDER BY expected_date""", (sku,))
    total = sum(r["qty"] for r in rows)
    return {"incoming_qty": total,
            "incoming_eta": rows[0]["expected_date"] if rows else None,
            "incoming_orders": [{"inbound_no": r["inbound_no"], "qty": r["qty"],
                                 "expected_date": r["expected_date"], "status": r["status"],
                                 "supplier": r["supplier"]} for r in rows]}


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
    inc = _incoming_supply(sku)                       # 도착 예정 입고(발주/입하 등 미반영 물량)
    incoming = inc["incoming_qty"]
    incoming_info = {"incoming_qty": incoming, "incoming_eta": inc["incoming_eta"],
                     "incoming_orders": inc["incoming_orders"],
                     "net_with_incoming": net + incoming,               # 도착예정 반영 시 순 가용
                     "covered_by_incoming": net <= 0 < net + incoming,  # 현재 부족이나 도착예정으로 해소
                     "shortfall_after_incoming": max(0, -(net + incoming))}

    if method == "insufficient_data":
        return {"sku": sku, "method": method, "reference_date": today.isoformat(),
                "current_stock": available, "backlog_demand": backlog, "net_available": net,
                "already_short": net <= 0, "safety_stock": safety,
                "expected_stockout_date": today.isoformat() if net <= 0 else None,
                "safety_stock_reach_date": None, "daily_projection": [], **incoming_info}

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
            "daily_projection": proj, **incoming_info}


def calculate_inventory_risk(sku: str) -> dict:
    fc = inventory_forecast(sku)
    inc = {"incoming_qty": fc.get("incoming_qty", 0), "incoming_eta": fc.get("incoming_eta"),
           "covered_by_incoming": fc.get("covered_by_incoming", False),
           "shortfall_after_incoming": fc.get("shortfall_after_incoming")}
    if fc.get("method") == "insufficient_data" and not fc.get("already_short"):
        return {"sku": sku, "risk_level": "UNKNOWN", "expected_stockout_date": None,
                "already_short": fc.get("already_short", False),
                "current_stock": fc.get("current_stock"), "backlog_demand": fc.get("backlog_demand"),
                "net_available": fc.get("net_available"), **inc}
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
            "backlog_demand": fc.get("backlog_demand"), "net_available": fc.get("net_available"), **inc}


def scan_inventory_risk(risk_levels: list[str] | None = None) -> dict:
    out = []
    for r in q("SELECT sku FROM products"):
        risk = calculate_inventory_risk(r["sku"])
        out.append({"sku": r["sku"], "risk_level": risk["risk_level"],
                    "expected_stockout_date": risk["expected_stockout_date"],
                    "already_short": risk.get("already_short", False),
                    "current_stock": risk.get("current_stock"), "backlog_demand": risk.get("backlog_demand"),
                    "incoming_qty": risk.get("incoming_qty", 0), "incoming_eta": risk.get("incoming_eta"),
                    "covered_by_incoming": risk.get("covered_by_incoming", False)})
    if risk_levels:
        out = [x for x in out if x["risk_level"] in risk_levels]
    return {"risks": out}


def _normalize_sku(sku) -> str | None:
    """다양한 표기를 실제 SKU 코드로 정규화: 'SKU_A002'·'a002'·'6'·'SKU_4'·'A9' 등.

    Router가 숫자를 'SKU_4'처럼 접두해 넘기기도 해서, 문자열 끝의 (선택 시리즈문자)+숫자를 뽑아
    ①시리즈문자+제로패딩 ②A-시리즈 ③해당 번호로 끝나는 SKU가 유일할 때 순으로 해석한다."""
    if sku is None:
        return None
    cand = str(sku).strip().upper().replace(" ", "")
    if not cand:
        return None
    for c in ([cand] if cand.startswith("SKU_") else [cand, "SKU_" + cand]):   # 있는 그대로/SKU_ 접두
        if q("SELECT 1 FROM products WHERE sku=?", (c,)):
            return c
    m = re.search(r"([A-Z]?)0*(\d+)$", cand)   # 끝의 (선택 시리즈문자)+숫자 추출
    if m:
        letter, padded = m.group(1), m.group(2).zfill(3)
        for c in ([f"SKU_{letter}{padded}"] if letter else []) + [f"SKU_A{padded}"]:
            if q("SELECT 1 FROM products WHERE sku=?", (c,)):
                return c
        rows = q("SELECT sku FROM products WHERE sku LIKE ?", ("%" + padded,))   # 유일 접미 매칭
        if len(rows) == 1:
            return rows[0]["sku"]
    return None


def _sku_tokens(sku) -> list[str]:
    """sku 파라미터(문자열/리스트/콤마구분)를 개별 토큰 리스트로."""
    if isinstance(sku, (list, tuple)):
        raw = [str(x) for x in sku]
    else:
        raw = str(sku).replace(";", ",").split(",")
    return [t.strip() for t in raw if str(t).strip()]


def required_order_quantities(sku: str | None = None, limit: int | None = None) -> dict:
    """필요 발주량 = 미처리 출고 + 안전재고 − 현재 가용.

    sku 지정 시 그 SKU '한 건'만(발주 불필요면 0으로) 반환하고, 미지정 시 부족 SKU 전체(양수)를 반환한다.
    '주문(발주)량'은 고객 출고주문 할당이 아니라, 미처리 출고를 채우고 안전재고를 회복하는 보충/구매 수량이다."""
    onhand = {r["sku"]: r["s"] for r in
              q("SELECT sku, COALESCE(SUM(qty),0) s FROM inventory WHERE status='AVAILABLE' GROUP BY sku")}
    resv = {r["sku"]: r["s"] for r in
            q("SELECT sku, COALESCE(SUM(qty),0) s FROM inventory_reservations WHERE status='RESERVED' GROUP BY sku")}
    backlog = {r["sku"]: r["s"] for r in
               q("""SELECT l.sku, COALESCE(SUM(l.qty),0) s FROM outbound_order_lines l
                    JOIN outbound_orders o ON o.order_no=l.order_no
                    WHERE o.status IN ('PLANNED','ALLOCATED') GROUP BY l.sku""")}

    def _item(s: str, safety: int) -> dict:
        avail = max(0, onhand.get(s, 0) - resv.get(s, 0))
        bl = backlog.get(s, 0)
        return {"sku": s, "current_stock": avail, "backlog_demand": bl,
                "safety_stock": safety, "required_order_qty": max(0, bl + safety - avail)}

    if sku is not None:   # 지정한 SKU(들)만 — 단일/리스트/콤마 모두 허용
        norms, unresolved, seen = [], [], set()
        for t in _sku_tokens(sku):
            n = _normalize_sku(t)
            if n and n not in seen:
                seen.add(n); norms.append(n)
            elif not n:
                unresolved.append(t)
        items = []
        for s in norms:
            safety = q("SELECT safety_stock FROM products WHERE sku=?", (s,))[0]["safety_stock"] or 0
            items.append(_item(s, safety))
        return {"scope_sku": norms, "unresolved": unresolved, "count": len(items),
                "total_required_qty": sum(i["required_order_qty"] for i in items),
                "note": "필요 발주량 = 미처리 출고 + 안전재고 − 현재 가용", "items": items}

    out = []
    for r in q("SELECT sku, safety_stock FROM products"):
        it = _item(r["sku"], r["safety_stock"] or 0)
        if it["required_order_qty"] > 0:
            out.append(it)
    out.sort(key=lambda x: -x["required_order_qty"])
    return {"count": len(out), "total_required_qty": sum(x["required_order_qty"] for x in out),
            "note": "필요 발주량 = 미처리 출고 + 안전재고 − 현재 가용",
            "items": out[:limit] if limit else out}


def risk_level_map() -> dict:
    """{sku: risk_level} — recommend_picking의 shortage_risk_score 주입용."""
    return {x["sku"]: x["risk_level"] for x in scan_inventory_risk()["risks"]}
