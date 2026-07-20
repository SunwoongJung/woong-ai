"""도메인 Agent 공용 동적 priority_score factor (0~1 정규화). Dispatch Score와 같은 스타일.

각 Action의 priority_score는 이 factor들의 가중합으로 산출하며, 가중치 합 = 기존 고정값(상한)이라
'가장 급한 인스턴스 ≈ 기존 값, 덜 급하면 낮음'으로 동작한다. 통상은 실행순서만 바꾸지만, 예산 초과·
대량 폭주 등 특수 상황에서 실제 처리 순서를 가른다.
"""
from datetime import datetime

from tools.common import q

_FMTS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d")


def _dt(v):
    if not v:
        return None
    for f in _FMTS:
        try:
            return datetime.strptime(str(v), f)
        except ValueError:
            continue
    try:
        return datetime.strptime(str(v)[:10] + " 09:00:00", _FMTS[0])
    except ValueError:
        return None


def c01(x: float) -> float:
    return max(0.0, min(x, 1.0))


def _now() -> datetime:
    from bb.store import now
    return _dt(now()) or datetime.now()


def due_urgency(due) -> float:
    """납기까지 남은 시간 → 급함(0~1). 지났으면 1.0."""
    d = _dt(due)
    if not d:
        return 0.1
    slack = (d - _now()).total_seconds() / 60.0
    if slack <= 0:
        return 1.0
    if slack <= 60:
        return 0.9
    if slack <= 180:
        return 0.6
    if slack <= 480:
        return 0.3
    return 0.1


def waiting_age(ts, cap_min: float = 120.0) -> float:
    """발행/생성 후 경과 → 대기(0~1). cap_min 이상이면 1.0."""
    d = _dt(ts)
    if not d:
        return 0.0
    return c01((_now() - d).total_seconds() / 60.0 / cap_min)


def outbound_need(sku: str, base_qty: float) -> float:
    """SKU의 미처리 출고 수요 / 기준량 (0~1). 출고에 필요한 SKU일수록 높음."""
    if not base_qty or base_qty <= 0:
        return 0.0
    r = q("""SELECT COALESCE(SUM(l.qty), 0) s FROM outbound_order_lines l
             JOIN outbound_orders o ON o.order_no = l.order_no
             WHERE l.sku = ? AND o.status IN ('PLANNED', 'ALLOCATED', 'PICKING_ISSUED')""", (sku,))
    return c01((r[0]["s"] if r else 0) / base_qty)


def is_cold(sku: str) -> float:
    r = q("SELECT storage_type FROM products WHERE sku = ?", (sku,))
    return 1.0 if (r and r[0]["storage_type"] == "COLD") else 0.0


def stockout_risk(sku: str) -> float:
    """예상 소진 위험등급 → 0~1 (HIGH 1.0 / MEDIUM 0.5 / WATCH 0.3)."""
    from sim import forecast
    lvl = (forecast.calculate_inventory_risk(sku) or {}).get("risk_level")
    return {"HIGH": 1.0, "MEDIUM": 0.5, "WATCH": 0.3}.get(lvl, 0.0)
