"""Putaway Agent — NEED_PUTAWAY(입고완료) → CREATE_PUTAWAY_TASK(적치 위치 배정).

적치 위치는 기존 stocking.recommend_stocking(동일SKU·CAPA·거리·고회전 정책)을 재사용.
적치 가능 위치가 없으면 PUTAWAY_BLOCKED(자동실행 금지) 알림.
priority_score(조정, 상한 40) = 24·출고필요 + 10·냉장 + 6·물량.
"""
from bb.agents import _score
from tools import stocking
from tools.common import q

NAME = "PutawayAgent"
EVENTS = {"NEED_PUTAWAY"}


def handles(event_type: str) -> bool:
    return event_type in EVENTS


def propose(event: dict) -> list[dict]:
    inb = event.get("target_id")
    if not inb:
        return []
    o = q("SELECT sku, qty, status FROM inbound_orders WHERE inbound_no=?", (inb,))
    if not o or o[0]["status"] != "RECEIVED":
        return []
    sku, qty = o[0]["sku"], o[0]["qty"]
    loc = (stocking.recommend_stocking(inb) or {}).get("recommended_location_id")
    if not loc:
        return [dict(agent_name=NAME, action_type="PUTAWAY_BLOCKED",
                     idempotency_key=f"PUTAWAY_BLOCKED:{inb}", event_id=event["event_id"],
                     target_type="inbound", target_id=inb, payload={"inbound_no": inb},
                     auto_executable=False, reason=f"{inb} 적치 가능 Location 없음 — 검토 필요")]
    on, cold, qn = _score.outbound_need(sku, qty), _score.is_cold(sku), _score.c01(qty / 100)
    ps = round(24 * on + 10 * cold + 6 * qn, 1)
    return [dict(agent_name=NAME, action_type="CREATE_PUTAWAY_TASK",
                 idempotency_key=f"CREATE_PUTAWAY_TASK:{inb}:{sku}:{loc}", event_id=event["event_id"],
                 target_type="inbound", target_id=inb,
                 payload={"inbound_no": inb, "sku": sku, "location_id": loc, "qty": qty},
                 priority_score=ps, auto_executable=True,
                 reason=f"입고 {inb}(SKU {sku}) → {loc} 적치작업 자동 생성 "
                        f"— 조정 {ps}(출고필요 {on:.2f}·냉장 {cold:.0f}·물량 {qn:.2f})")]
