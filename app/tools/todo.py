"""오늘 할 일 액션 패널 — 4개 대기 버킷의 실행 후보 조회 + 즉시 승인/보류 처리.

버킷 = 승인 액션과 1:1: 출고지시 대기(출고확정) · 피킹지시 대기(피킹지시) · 적치지시 대기(적치지시) · 부족재고(발주).
승인=초안 생성 후 즉시 실행, 보류=초안만 생성(Approval 탭 대기), 거절=프론트에서 목록 제외.
"""
from datetime import datetime

from sim import forecast
from tools import drafts, picking, stocking
from tools.common import q


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _picking_items(offset: int, limit: int):
    recs = picking.recommend_picking(_now(), forecast.risk_level_map())["recommendations"]
    items = [{"id": r["order_no"], "title": r["order_no"],
              "sub": (r.get("start_guidance") or "") + (" · 긴급" if r.get("urgent") else "")}
             for r in recs[offset:offset + limit]]
    return len(recs), items


def _stocking_items(offset: int, limit: int):
    rows = q("""SELECT inbound_no, sku, qty, expected_date FROM inbound_orders
                WHERE status='RECEIVED' ORDER BY expected_date, inbound_no""")
    items = [{"id": r["inbound_no"], "title": r["inbound_no"],
              "sub": f"{r['sku']} {r['qty']}개 · 입고예정 {r['expected_date']}"}
             for r in rows[offset:offset + limit]]
    return len(rows), items


def _shipping_items(offset: int, limit: int):
    rows = q("SELECT order_no FROM outbound_orders WHERE status='SHIPPING_PENDING' ORDER BY order_no")
    items = [{"id": r["order_no"], "title": r["order_no"], "sub": "피킹 완료 · 출고확정 대기"}
             for r in rows[offset:offset + limit]]
    return len(rows), items


def _order_items(offset: int, limit: int):
    all_items = forecast.required_order_quantities()["items"]   # 부족 SKU 전체(필요량 내림차순)
    items = [{"id": it["sku"], "title": it["sku"], "qty": it["required_order_qty"],
              "sub": f"필요 발주 {it['required_order_qty']}개 · 미처리 {it['backlog_demand']} · 가용 {it['current_stock']}"}
             for it in all_items[offset:offset + limit]]
    return len(all_items), items


_BUCKETS = {
    "shipping": ("출고지시 대기", "출고확정", _shipping_items),
    "picking": ("피킹지시 대기", "피킹지시", _picking_items),
    "stocking": ("적치지시 대기", "적치지시", _stocking_items),
    "order": ("주문 필요(부족재고)", "발주", _order_items),
}


def overview(limit: int = 10) -> dict:
    out = []
    for key, (label, action, fn) in _BUCKETS.items():
        total, items = fn(0, limit)
        out.append({"key": key, "label": label, "action_label": action,
                    "count": total, "items": items, "has_more": total > limit})
    return {"buckets": out}


def more(bucket: str, offset: int, limit: int = 20) -> dict:
    if bucket not in _BUCKETS:
        return {"error": "알 수 없는 버킷"}
    total, items = _BUCKETS[bucket][2](offset, limit)
    return {"items": items, "total": total, "has_more": offset + len(items) < total}


def act(bucket: str, target_id: str, decision: str) -> dict:
    """decision: 'approve'(즉시 실행) | 'hold'(Approval 탭 대기). 각 버킷의 해당 초안을 생성."""
    if bucket == "picking":
        d = drafts.create_picking_instruction_draft(target_id)
    elif bucket == "shipping":
        d = drafts.create_shipping_confirm_draft(target_id)
    elif bucket == "stocking":
        rec = stocking.recommend_stocking(target_id)
        loc = rec.get("recommended_location_id") or (rec.get("candidates") or [{}])[0].get("location_id")
        if not loc:
            return {"error": f"{target_id}: 적치 가능한 추천 위치가 없습니다. 위치를 직접 지정해 지시하세요."}
        d = drafts.create_stocking_task_draft(target_id, loc)
    elif bucket == "order":
        req = forecast.required_order_quantities(sku=target_id)
        items = req.get("items") or []
        qty = items[0]["required_order_qty"] if items else 0
        if qty <= 0:
            return {"error": f"{target_id}: 필요 발주량이 없습니다"}
        d = drafts.create_purchase_order_draft(target_id, qty)
    else:
        return {"error": "알 수 없는 버킷"}

    if d.get("error"):
        return d
    if decision == "approve":
        res = drafts.approve_action(d["draft_id"], True, "operator01")   # 즉시 실행
        return {"decision": "approved", "draft_id": d["draft_id"], "result": res}
    return {"decision": "held", "draft_id": d["draft_id"], "status": "PENDING_APPROVAL"}   # 보류
