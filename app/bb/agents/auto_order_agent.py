"""Auto Order Agent(자동발주) — 출고 결품 감지 → 부족분 발주(PLACE_REPLENISHMENT_ORDER).

출고 주문의 가용재고가 부족하면 부족분만큼 입고 발주를 넣고 주문을 대기(AWAITING_STOCK)시킨다.
리드타임(도착) 경과 또는 '바로 보충' 후 재고가 채워지면 backorder.resume_fillable()이 주문을 재개한다.
"""
from bb import reservations
from tools.common import q

NAME = "AutoOrderAgent"
EVENTS = {"NEW_OUTBOUND_ORDER"}


def handles(event_type: str) -> bool:
    return event_type in EVENTS


def _shortage(order_no: str) -> list[dict]:
    short = []
    for ln in q("SELECT sku, qty FROM outbound_order_lines WHERE order_no=?", (order_no,)):
        avail = reservations.available(ln["sku"])
        if avail < ln["qty"]:
            short.append({"sku": ln["sku"], "qty": ln["qty"] - avail})   # 부족분만
    return short


def propose(event: dict) -> list[dict]:
    order_no = event.get("target_id")
    if not order_no:
        return []
    o = q("SELECT status FROM outbound_orders WHERE order_no=?", (order_no,))
    if not o or o[0]["status"] not in ("PLANNED", "ALLOCATED"):
        return []
    short = _shortage(order_no)
    if not short:
        return []
    desc = ", ".join(f"{s['sku']}(부족 {s['qty']})" for s in short)
    # 동적 조정(상한 70) = 40·결품심각도 + 20·납기긴급 + 10·소진위험
    from bb.agents import _score
    total_req = sum(ln["qty"] for ln in q("SELECT qty FROM outbound_order_lines WHERE order_no=?", (order_no,))) or 1
    sev = _score.c01(sum(s["qty"] for s in short) / total_req)
    du = _score.due_urgency((q("SELECT due_datetime FROM outbound_orders WHERE order_no=?", (order_no,)) or [{}])[0].get("due_datetime"))
    risk = max((_score.stockout_risk(s["sku"]) for s in short), default=0.0)
    ps = round(40 * sev + 20 * du + 10 * risk, 1)
    return [dict(agent_name=NAME, action_type="PLACE_REPLENISHMENT_ORDER",
                 idempotency_key=f"PLACE_REPLENISHMENT_ORDER:{order_no}", event_id=event["event_id"],
                 target_type="order", target_id=order_no,
                 payload={"order_no": order_no, "shortage": short},
                 priority_score=ps, auto_executable=True,
                 reason=f"출고 {order_no} 결품 — 부족분 발주 후 재고 도착 대기: {desc} "
                        f"— 조정 {ps}(결품심각 {sev:.2f}·납기긴급 {du:.2f}·소진위험 {risk:.2f})")]
