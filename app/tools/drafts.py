"""Draft / Approval / 실행 Tool (docs/06 §8). 상태변경은 승인 후에만 수행.

흐름: create_*_draft → dry_run_action → approve_action → issue_*/confirm_shipping
"""
import json
import uuid
from datetime import datetime

from db.database import get_connection
from tools import allocation, replenishment
from tools.common import q
from tools.picking import calculate_picking_required_time

_NOW = lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S")  # noqa: E731


def _draft_id(prefix: str) -> str:
    return f"DRF-{prefix}-{uuid.uuid4().hex[:6]}"


def _get_draft(draft_id: str) -> dict | None:
    r = q("SELECT * FROM action_drafts WHERE draft_id=?", (draft_id,))
    return r[0] if r else None


# ---------- Draft 생성 ----------
def create_stocking_task_draft(inbound_no: str, location_id: str) -> dict:
    inb = q("SELECT sku, qty FROM inbound_orders WHERE inbound_no=?", (inbound_no,))
    if not inb:
        return {"error": "입고번호 없음"}
    payload = {"inbound_no": inbound_no, "location_id": location_id,
               "sku": inb[0]["sku"], "qty": inb[0]["qty"]}
    did = _draft_id("STK")
    conn = get_connection()
    try:
        conn.execute("INSERT INTO action_drafts(draft_id,action_type,target_id,payload_json,status)"
                     " VALUES(?,?,?,?,?)",
                     (did, "STOCKING", inbound_no, json.dumps(payload, ensure_ascii=False), "PENDING_APPROVAL"))
        conn.commit()
    finally:
        conn.close()
    return {"draft_id": did, "status": "PENDING_APPROVAL"}


def create_purchase_order_draft(sku: str, qty) -> dict:
    """발주(구매 입고) Draft — 승인 시 inbound_orders에 입고 발주 생성. 도착=오늘+리드타임."""
    from datetime import date, timedelta
    p = q("SELECT lead_time_days FROM products WHERE sku=?", (sku,))
    if not p:
        return {"error": f"{sku} 상품 마스터에 없음"}
    try:
        qty = int(qty)
    except (TypeError, ValueError):
        return {"error": "발주 수량이 올바르지 않습니다(정수 필요)"}
    if qty <= 0:
        return {"error": "발주 수량은 1개 이상이어야 합니다"}
    lead = int(p[0]["lead_time_days"] or 3)
    eta = (date.today() + timedelta(days=lead)).isoformat()
    payload = {"sku": sku, "qty": qty, "lead_time_days": lead, "expected_date": eta}
    did = _draft_id("PO")
    conn = get_connection()
    try:
        conn.execute("INSERT INTO action_drafts(draft_id,action_type,target_id,payload_json,status)"
                     " VALUES(?,?,?,?,?)",
                     (did, "ORDER", sku, json.dumps(payload, ensure_ascii=False), "PENDING_APPROVAL"))
        conn.commit()
    finally:
        conn.close()
    return {"draft_id": did, "dry_run": dry_run_action(did), "status": "PENDING_APPROVAL"}


def create_picking_instruction_draft(order_no: str) -> dict:
    if not q("SELECT 1 FROM outbound_orders WHERE order_no=?", (order_no,)):
        return {"error": "주문번호 없음"}
    payload = {"order_no": order_no}
    did = _draft_id("PCK")
    conn = get_connection()
    try:
        conn.execute("INSERT INTO action_drafts(draft_id,action_type,target_id,payload_json,status)"
                     " VALUES(?,?,?,?,?)",
                     (did, "PICKING", order_no, json.dumps(payload, ensure_ascii=False), "PENDING_APPROVAL"))
        conn.commit()
    finally:
        conn.close()
    return {"draft_id": did, "status": "PENDING_APPROVAL"}


def create_shipping_confirm_draft(order_no: str) -> dict:
    if not q("SELECT 1 FROM outbound_orders WHERE order_no=?", (order_no,)):
        return {"error": "주문번호 없음"}
    payload = {"order_no": order_no}
    did = _draft_id("SHP")
    conn = get_connection()
    try:
        conn.execute("INSERT INTO action_drafts(draft_id,action_type,target_id,payload_json,status)"
                     " VALUES(?,?,?,?,?)",
                     (did, "SHIPPING", order_no, json.dumps(payload, ensure_ascii=False), "PENDING_APPROVAL"))
        conn.commit()
    finally:
        conn.close()
    dry = dry_run_action(did)  # 생성 시 Dry Run 자동 수행
    return {"draft_id": did, "dry_run": dry, "status": "PENDING_APPROVAL"}


# ---------- 발주 실행 내역: 입고 도착여부 / 삭제 / 바로 보충 ----------
def order_arrival(draft: dict) -> dict | None:
    """ORDER 실행(EXECUTED) Draft가 만든 입고건의 도착 여부. 링크(payload.inbound_no) 우선, 없으면 근사 매칭.

    반환: {inbound_no, inbound_status, arrived} 또는 None(대상 아님). arrived=True면 이미 STOCKED(입고완료)."""
    if draft.get("action_type") != "ORDER" or draft.get("status") != "EXECUTED":
        return None
    raw = draft.get("payload_json")
    p = json.loads(raw) if isinstance(raw, str) else (draft.get("payload") or {})
    row = None
    if p.get("inbound_no"):
        r = q("SELECT inbound_no, status, expected_date FROM inbound_orders WHERE inbound_no=?",
              (p["inbound_no"],))
        row = r[0] if r else None
    if not row:   # 구버전(링크 미저장) — sku·수량·도착예정으로 근사 매칭
        r = q("""SELECT inbound_no, status, expected_date FROM inbound_orders
                 WHERE sku=? AND qty=? AND expected_date=? AND supplier='PO'
                 ORDER BY inbound_no DESC LIMIT 1""",
              (p.get("sku"), p.get("qty"), p.get("expected_date")))
        row = r[0] if r else None
    if not row:
        return None
    return {"inbound_no": row["inbound_no"], "inbound_status": row["status"],
            "expected_date": row["expected_date"], "arrived": row["status"] == "STOCKED"}


def delete_draft(draft_id: str) -> dict:
    """처리 완료(EXECUTED/REJECTED) 내역 삭제. 단, 발주 후 아직 입고 전(STOCKED 아님)이면 삭제 불가."""
    d = _get_draft(draft_id)
    if not d:
        return {"error": "draft 없음"}
    if d["status"] not in ("EXECUTED", "REJECTED"):
        return {"error": "처리 완료된 내역만 삭제할 수 있습니다"}
    arr = order_arrival(d)
    if arr and not arr["arrived"]:
        return {"error": f"발주 입고가 완료되어야 삭제할 수 있습니다 (입고 {arr['inbound_no']}, 도착예정 "
                         f"{arr['expected_date']}). 지금 처리하려면 '바로 보충'을 누르세요."}
    conn = get_connection()
    try:
        conn.execute("DELETE FROM action_drafts WHERE draft_id=?", (draft_id,))
        conn.commit()
    finally:
        conn.close()
    return {"status": "DELETED", "draft_id": draft_id}


def stock_now_draft(draft_id: str) -> dict:
    """'바로 보충' — 발주 실행 내역의 입고 전 건을 가상 즉시 입고·재고 반영(자동운영과 동일 효과)."""
    d = _get_draft(draft_id)
    if not d:
        return {"error": "draft 없음"}
    arr = order_arrival(d)
    if not arr:
        return {"error": "즉시 보충할 발주 입고 건이 없습니다"}
    if arr["arrived"]:
        return {"error": "이미 입고 완료된 건입니다"}
    from bb import backorder
    return backorder.stock_inbound_now(arr["inbound_no"])


# ---------- Dry Run ----------
def dry_run_action(draft_id: str) -> dict:
    d = _get_draft(draft_id)
    if not d:
        return {"error": "draft 없음"}
    payload = json.loads(d["payload_json"])
    changes: list[dict] = []
    warnings: list[str] = []

    if d["action_type"] == "STOCKING":
        loc = q("SELECT capacity, occupied_qty FROM locations WHERE location_id=?", (payload["location_id"],))
        inb = q("SELECT status FROM inbound_orders WHERE inbound_no=?", (payload["inbound_no"],))
        changes.append({"table": "inbound_orders", "field": "status",
                        "before": inb[0]["status"] if inb else None, "after": "STOCKING_TASK_CREATED"})
        changes.append({"table": "stocking_tasks", "field": "신규", "after": payload["location_id"]})
        if loc and (loc[0]["capacity"] - loc[0]["occupied_qty"]) < payload["qty"]:
            warnings.append("잔여용량 부족 — CAPA 확인 필요")

    elif d["action_type"] == "ORDER":
        avail = q("SELECT COALESCE(SUM(qty),0) s FROM inventory WHERE sku=? AND status='AVAILABLE'",
                  (payload["sku"],))[0]["s"]
        changes.append({"table": "inbound_orders", "field": "신규 발주(PLANNED)",
                        "after": f"{payload['sku']} {payload['qty']}개, 도착예정 {payload['expected_date']}"
                                 f"(리드타임 {payload['lead_time_days']}일)"})
        changes.append({"table": "재고 반영", "note": "도착·적치 완료 시 가용재고 증가", "현재_가용": avail})

    elif d["action_type"] == "PICKING":
        o = q("SELECT status FROM outbound_orders WHERE order_no=?", (payload["order_no"],))
        ct = calculate_picking_required_time(payload["order_no"])
        changes.append({"table": "outbound_orders", "field": "status",
                        "before": o[0]["status"] if o else None, "after": "PICKING_ISSUED"})
        changes.append({"table": "picking_tasks", "field": "estimated_minutes", "after": ct["estimated_minutes"]})

    elif d["action_type"] == "SHIPPING":
        o = q("SELECT status FROM outbound_orders WHERE order_no=?", (payload["order_no"],))
        changes.append({"table": "outbound_orders", "field": "status",
                        "before": o[0]["status"] if o else None, "after": "SHIPPED"})
        for ln in q("SELECT sku, qty FROM outbound_order_lines WHERE order_no=?", (payload["order_no"],)):
            stock = q("SELECT COALESCE(SUM(qty),0) s FROM inventory WHERE sku=?", (ln["sku"],))[0]["s"]
            changes.append({"table": "inventory", "sku": ln["sku"], "qty_change": -ln["qty"]})
            if stock < ln["qty"]:
                warnings.append(f"{ln['sku']} 재고 부족(보유 {stock} < 출고 {ln['qty']})")

    result = {"changes": changes, "warnings": warnings}
    conn = get_connection()
    try:
        conn.execute("UPDATE action_drafts SET dry_run_result_json=? WHERE draft_id=?",
                     (json.dumps(result, ensure_ascii=False), draft_id))
        conn.commit()
    finally:
        conn.close()
    return result


# ---------- 승인 + 실행 ----------
def approve_action(draft_id: str, approved: bool, user_id: str) -> dict:
    d = _get_draft(draft_id)
    if not d:
        return {"error": "draft 없음"}
    if d["status"] != "PENDING_APPROVAL":
        return {"error": f"승인 불가 상태: {d['status']}"}
    conn = get_connection()
    try:
        if not approved:
            conn.execute("UPDATE action_drafts SET status='REJECTED' WHERE draft_id=?", (draft_id,))
            conn.commit()
            return {"status": "REJECTED", "executed_action": None}
        conn.execute("UPDATE action_drafts SET status='APPROVED', approved_at=? WHERE draft_id=?",
                     (_NOW(), draft_id))
        conn.commit()
    finally:
        conn.close()

    dispatch = {"STOCKING": issue_stocking_task, "PICKING": issue_picking_instruction,
                "SHIPPING": confirm_shipping, "ORDER": issue_purchase_order}
    executed = dispatch[d["action_type"]](draft_id)

    conn = get_connection()
    try:
        conn.execute("UPDATE action_drafts SET status='EXECUTED', executed_at=? WHERE draft_id=?",
                     (_NOW(), draft_id))
        conn.commit()
    finally:
        conn.close()
    return {"status": "EXECUTED", "executed_action": executed}


# ---------- 실행 Tool (승인된 Draft만 호출됨) ----------
def issue_purchase_order(draft_id: str) -> dict:
    d = _get_draft(draft_id)
    p = json.loads(d["payload_json"])
    inbound_no = f"PO-{uuid.uuid4().hex[:6]}"
    conn = get_connection()
    try:
        conn.execute("INSERT INTO inbound_orders(inbound_no,sku,qty,expected_date,status,supplier)"
                     " VALUES(?,?,?,?,?,?)",
                     (inbound_no, p["sku"], p["qty"], p["expected_date"], "PLANNED", "PO"))
        p["inbound_no"] = inbound_no   # 링크 저장 — 도착여부 확인·'바로 보충'·삭제가드에 사용
        conn.execute("UPDATE action_drafts SET payload_json=? WHERE draft_id=?",
                     (json.dumps(p, ensure_ascii=False), draft_id))
        conn.commit()
    finally:
        conn.close()
    return {"inbound_no": inbound_no, "sku": p["sku"], "qty": p["qty"],
            "expected_date": p["expected_date"], "status": "PLANNED"}


def issue_stocking_task(draft_id: str) -> dict:
    d = _get_draft(draft_id)
    payload = json.loads(d["payload_json"])
    task_id = f"STK-{uuid.uuid4().hex[:6]}"
    conn = get_connection()
    try:
        conn.execute("INSERT INTO stocking_tasks(stocking_task_id,inbound_no,location_id,qty,status,draft_id)"
                     " VALUES(?,?,?,?,?,?)",
                     (task_id, payload["inbound_no"], payload["location_id"], payload["qty"], "ISSUED", draft_id))
        conn.execute("UPDATE inbound_orders SET status='STOCKING_TASK_CREATED' WHERE inbound_no=?",
                     (payload["inbound_no"],))
        conn.commit()
    finally:
        conn.close()
    repl = replenishment.execute_for_sku(payload["sku"])   # 적치지시 시 해당 SKU 피킹면 자동 보충(승인 불필요)
    return {"stocking_task_id": task_id, "inbound_status": "STOCKING_TASK_CREATED", "auto_replenishment": repl}


def issue_picking_instruction(draft_id: str) -> dict:
    d = _get_draft(draft_id)
    payload = json.loads(d["payload_json"])
    order_no = payload["order_no"]
    alloc = allocation.apply_allocation(order_no)   # 피킹지시 시 재고 할당 자동 수행(승인 불필요·꼬임방지)
    task_id = f"PCK-{uuid.uuid4().hex[:6]}"
    # 자동운영과 동일 기준: SKU 재고 존을 TSP closed-route로 방문순서 산출 + 이동/작업시간 계산(타이밍만 즉시 완료)
    from bb.zone_work import log_route, route_plan
    skus = [r["sku"] for r in q("SELECT DISTINCT sku FROM outbound_order_lines WHERE order_no=?", (order_no,))]
    plan = route_plan(skus)                          # 자동운영과 동일한 route_plan 호출
    seq = plan["zone_sequence"]
    work_min = plan["work_minutes"]
    travel_min = plan["travel_minutes"]              # 입구→…→입구 이동시간(수리식 d_ij)
    total_min = round(work_min + travel_min)
    conn = get_connection()
    try:
        # 존 단위 실행 로직(TSP 순서·이동·작업시간)을 동기 계산해 즉시 완료 처리 → 출고확정 대기 큐 진입
        conn.execute("""INSERT INTO picking_tasks(picking_task_id,order_no,estimated_minutes,status,draft_id,
                        zone_sequence,zone_index,started_at,completed_at)
                        VALUES(?,?,?,?,?,?,?,?,?)""",
                     (task_id, order_no, total_min, "COMPLETED", draft_id,
                      json.dumps(seq), max(0, len(seq) - 1), _NOW(), _NOW()))
        conn.execute("""UPDATE outbound_order_lines
                        SET picked_qty=CASE WHEN allocated_qty>0 THEN allocated_qty ELSE qty END,
                            line_status='PICKED' WHERE order_no=?""", (order_no,))
        conn.execute("UPDATE outbound_orders SET status='SHIPPING_PENDING' WHERE order_no=?", (order_no,))
        if not conn.execute("SELECT 1 FROM shipping_pending WHERE order_no=? AND status='PENDING'",
                            (order_no,)).fetchone():   # 출고확정 대기 큐 등록(중복 방지)
            conn.execute("INSERT INTO shipping_pending(order_no,ready_datetime,status) VALUES(?,?,'PENDING')",
                         (order_no, _NOW()))
        log_route(conn, task_id, order_no, "HITL", plan)   # 경로 계산 히스토리(자동과 동일)
        conn.commit()
    finally:
        conn.close()
    return {"picking_task_id": task_id, "order_status": "SHIPPING_PENDING", "zone_sequence": seq,
            "work_minutes": round(work_min, 1), "travel_minutes": travel_min,
            "estimated_minutes": total_min, "auto_allocation": alloc}


def confirm_shipping(draft_id: str) -> dict:
    d = _get_draft(draft_id)
    payload = json.loads(d["payload_json"])
    order_no = payload["order_no"]
    changes = []
    conn = get_connection()
    try:
        for ln in conn.execute("SELECT sku, qty FROM outbound_order_lines WHERE order_no=?", (order_no,)).fetchall():
            remaining = ln["qty"]
            lots = conn.execute("SELECT inventory_id, location_id, qty FROM inventory "
                                "WHERE sku=? AND qty>0 ORDER BY inventory_id", (ln["sku"],)).fetchall()
            for lot in lots:
                if remaining <= 0:
                    break
                take = min(remaining, lot["qty"])
                conn.execute("UPDATE inventory SET qty=qty-? WHERE inventory_id=?", (take, lot["inventory_id"]))
                conn.execute("UPDATE locations SET occupied_qty=occupied_qty-? WHERE location_id=?",
                             (take, lot["location_id"]))
                remaining -= take
            shipped = ln["qty"] - max(remaining, 0)
            changes.append({"sku": ln["sku"], "qty_change": -shipped,
                            "shortfall": remaining if remaining > 0 else 0})
            conn.execute("UPDATE outbound_order_lines SET shipped_qty=?, line_status='SHIPPED' "
                         "WHERE order_no=? AND sku=?", (shipped, order_no, ln["sku"]))
        conn.execute("UPDATE outbound_orders SET status='SHIPPED' WHERE order_no=?", (order_no,))
        conn.execute("UPDATE shipping_pending SET status='CONFIRMED', confirmed_at=? WHERE order_no=?",
                     (_NOW(), order_no))
        conn.commit()
    finally:
        conn.close()
    return {"order_status": "SHIPPED", "inventory_changes": changes}
