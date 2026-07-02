"""조회 Tool (docs/06 §4) + 운영 KPI 조회 (docs/13 §4)."""
import re

from tools.common import q


def lookup_inventory(sku: str) -> dict:
    inv = q("SELECT location_id, lot_no, qty, expiry_date FROM inventory "
            "WHERE sku=? AND status='AVAILABLE' ORDER BY location_id", (sku,))
    return {"sku": sku, "inventory": inv, "total_qty": sum(r["qty"] for r in inv)}


def lookup_inbound_orders(status: list[str], target_date: str | None = None) -> dict:
    marks = ",".join("?" for _ in status)
    params = list(status)
    sql = (f"SELECT inbound_no, sku, qty, expected_date, status FROM inbound_orders "
           f"WHERE status IN ({marks})")
    if target_date:
        sql += " AND expected_date=?"
        params.append(target_date)
    return {"orders": q(sql, tuple(params))}


def lookup_outbound_orders(status: list[str], target_date: str | None = None) -> dict:
    marks = ",".join("?" for _ in status)
    params = list(status)
    sql = (f"SELECT order_no, due_datetime, customer_priority, status FROM outbound_orders "
           f"WHERE status IN ({marks})")
    if target_date:
        sql += " AND substr(due_datetime,1,10)=?"
        params.append(target_date)
    orders = q(sql, tuple(params))
    for o in orders:
        o["lines"] = q("SELECT sku, qty FROM outbound_order_lines WHERE order_no=?", (o["order_no"],))
    return {"orders": orders}


def lookup_shipping_pending(status: str = "PENDING") -> dict:
    return {"pending": q("SELECT pending_id, order_no, ready_datetime, status "
                         "FROM shipping_pending WHERE status=? ORDER BY ready_datetime", (status,))}


def lookup_demand_history(sku: str, days: int = 60) -> dict:
    rows = q("SELECT demand_date, shipped_qty FROM demand_history WHERE sku=? "
             "ORDER BY demand_date DESC LIMIT ?", (sku, days))
    rows.reverse()
    return {"history": rows, "days_available": len(rows)}


def _resolve_zone(hint) -> str | None:
    """'A'·'zone a'·'ZONE_A'·'A존' 등을 실제 zone_id로 정규화(없으면 None)."""
    if not hint:
        return None
    s = str(hint).upper()
    m = (re.search(r"(?:ZONE|존)\s*[_\- ]?\s*([A-Z])", s)
         or re.search(r"\b([A-Z])\s*존", s) or re.search(r"^\s*([A-Z])\s*$", s))
    if not m:
        return None
    zid = "ZONE_" + m.group(1)
    return zid if q("SELECT 1 FROM zones WHERE zone_id=?", (zid,)) else None


def query_operation_kpis(kpis: list[str], target_date: str | None = None, zone_id: str | None = None) -> dict:
    """운영 KPI 조회. Zone 점유율은 KPI 대시보드와 동일한 실재고 기준으로 계산한다.
    zone_id 지정 시 해당 존만 반환. forecast 의존 KPI는 Phase 4에서 보강."""
    from tools import kpi_dashboard
    zid = _resolve_zone(zone_id)
    out = []
    for name in kpis:
        if name == "zone_occupancy":
            zones = kpi_dashboard.zone_occupancy()          # 실제 가용재고 기준(대시보드 동일 소스)
            if zid:
                zones = [z for z in zones if z["zone_id"] == zid]
            note = (f"{zone_id} 존을 찾지 못했습니다" if (zone_id and not zid) else None)
            out.append({"name": name, "value": zones, "unit": "percent", "note": note})
        elif name == "saturated_zone_count":
            n = len([z for z in kpi_dashboard.zone_occupancy() if (z["occupancy"] or 0) > 0.9])
            out.append({"name": name, "value": n, "unit": "count"})
        elif name == "team_utilization":
            out.append({"name": name, "value": kpi_dashboard.team_utilization_current(), "unit": "percent"})
        elif name == "inventory_value":
            out.append({"name": name, "value": round(kpi_dashboard.inventory_value()), "unit": "krw"})
        elif name == "picking_wait":
            out.append({"name": name, "value": kpi_dashboard.picking_wait()["avg_seconds"], "unit": "seconds"})
        elif name == "zone_over_target_count":
            out.append({"name": name, "value": len(kpi_dashboard.zones_over_target(0.80)), "unit": "count"})
        elif name == "stockout_within_week_count":
            out.append({"name": name, "value": kpi_dashboard.stockout_analysis()["within_week_count"], "unit": "count"})
        elif name == "out_of_stock_count":
            out.append({"name": name, "value": kpi_dashboard.stockout_analysis()["out_of_stock_count"], "unit": "count"})
        elif name == "shipping_delay_count":
            out.append({"name": name, "value": kpi_dashboard.shipping_delay_count(kpi_dashboard.reference_date()),
                        "unit": "count"})
        elif name == "putaway_delay_count":
            out.append({"name": name, "value": kpi_dashboard.putaway_delay_count(kpi_dashboard.reference_date()),
                        "unit": "count"})
        elif name == "safety_stock_below_count":
            n = q("""SELECT COUNT(*) n FROM (SELECT p.sku, p.safety_stock,
                       COALESCE((SELECT SUM(qty) FROM inventory i WHERE i.sku=p.sku),0) AS stock
                       FROM products p) WHERE stock < safety_stock""")[0]["n"]
            out.append({"name": name, "value": n, "unit": "count"})
        elif name == "on_time_shipping_rate":
            r = q("""SELECT AVG(CASE WHEN shipped_datetime <= due_datetime THEN 1.0 ELSE 0.0 END) rate
                     FROM outbound_orders WHERE status='SHIPPED' AND shipped_datetime IS NOT NULL""")[0]["rate"]
            out.append({"name": name, "value": round(r, 3) if r is not None else None, "unit": "percent"})
        elif name == "expected_shortage_count":
            from tools.allocation import expected_shortage_count
            out.append({"name": name, "value": expected_shortage_count(target_date), "unit": "count"})
        elif name == "dead_stock_count":
            from tools.dead_stock import dead_stock_count
            out.append({"name": name, "value": dead_stock_count(), "unit": "count"})
        elif name == "replenishment_needed_count":
            from tools.replenishment import replenishment_needed_count
            out.append({"name": name, "value": replenishment_needed_count(), "unit": "count"})
        elif name == "stocking_completion_rate":
            r = q("""SELECT
                       SUM(CASE WHEN status='STOCKED' THEN 1 ELSE 0 END)*1.0
                       / NULLIF(SUM(CASE WHEN status IN ('RECEIVED','STOCKING_RECOMMENDED','STOCKING_TASK_CREATED','STOCKED') THEN 1 ELSE 0 END),0) AS rate
                     FROM inbound_orders""")[0]["rate"]
            out.append({"name": name, "value": round(r, 3) if r is not None else None, "unit": "percent"})
        else:
            # forecast/이력 의존 KPI는 Phase 4에서 구현
            out.append({"name": name, "value": None, "unit": None, "note": "Phase 4에서 구현 예정"})
    return {"kpis": out}
