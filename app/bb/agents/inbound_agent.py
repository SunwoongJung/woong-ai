"""Inbound Agent — NEW_INBOUND_ARRIVAL → CREATE_INBOUND_TASK(입고 처리=RECEIVED).

priority_score(조정, 상한 50) = 30·출고필요 + 12·냉장 + 8·물량 — 출고 필요/냉장/대량 입고를 먼저.
"""
from bb.agents import _score
from tools.common import q

NAME = "InboundAgent"
EVENTS = {"NEW_INBOUND_ARRIVAL"}


def handles(event_type: str) -> bool:
    return event_type in EVENTS


def propose(event: dict) -> list[dict]:
    inb = event.get("target_id")
    if not inb:
        return []
    o = q("SELECT sku, qty, status FROM inbound_orders WHERE inbound_no=?", (inb,))
    if not o or o[0]["status"] != "PLANNED":
        return []
    sku, qty = o[0]["sku"], o[0]["qty"]
    on, cold, qn = _score.outbound_need(sku, qty), _score.is_cold(sku), _score.c01(qty / 100)
    ps = round(30 * on + 12 * cold + 8 * qn, 1)
    return [dict(agent_name=NAME, action_type="CREATE_INBOUND_TASK",
                 idempotency_key=f"CREATE_INBOUND_TASK:{inb}", event_id=event["event_id"],
                 target_type="inbound", target_id=inb, payload={"inbound_no": inb},
                 priority_score=ps, auto_executable=True,
                 reason=f"입고 도착 {inb}(SKU {sku} {qty}개) 입고작업 자동 생성 "
                        f"— 조정 {ps}(출고필요 {on:.2f}·냉장 {cold:.0f}·물량 {qn:.2f})")]
