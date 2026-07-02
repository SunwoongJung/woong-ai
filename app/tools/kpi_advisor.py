"""KPI 진단·개선 어드바이저 — 각 KPI의 현재값 + 원인 데이터 + 개선 레버(+간단 산수).

지원 KPI: zone_occupancy(존 점유율)·team_utilization(작업팀 가동률)·
          shipping_delay(출고지연)·putaway_delay(적치지연).
각 진단은 데이터로 산출한 recommendations(구체 조치 문자열)를 함께 반환하고, 응답은 이를 근거로 구성한다.
"""
import math
from datetime import datetime

from sim import forecast
from tools import kpi_dashboard, stocking, workload
from tools.common import q

WORK_MIN_PER_DAY = 540


def _avg_daily_demand(sku: str) -> float:
    r = q("SELECT AVG(shipped_qty) a FROM demand_history WHERE sku=?", (sku,))
    return round(r[0]["a"] or 0.0, 2)


# ---------- ① 존 점유율 ----------
def diagnose_zone(zone_id: str, target: float = 0.80) -> dict:
    z = next((x for x in kpi_dashboard.zone_occupancy() if x["zone_id"] == zone_id), None)
    if not z:
        return {"error": f"{zone_id} 존을 찾지 못했습니다"}
    skus = q("""SELECT i.sku, COALESCE(SUM(i.qty),0) qty FROM inventory i
                JOIN locations l ON l.location_id=i.location_id
                WHERE l.zone_id=? AND i.status='AVAILABLE' GROUP BY i.sku ORDER BY qty DESC""", (zone_id,))
    total_qty = sum(s["qty"] for s in skus)
    top, zone_demand, incoming_total = [], 0.0, 0
    for s in skus:
        avg = _avg_daily_demand(s["sku"])
        zone_demand += avg
        if len(top) < 8:
            inc = forecast._incoming_supply(s["sku"])
            incoming_total += inc["incoming_qty"]
            top.append({"sku": s["sku"], "qty": s["qty"], "avg_daily_demand": avg,
                        "days_of_stock": round(s["qty"] / avg, 1) if avg > 0 else None,
                        "incoming_qty": inc["incoming_qty"], "incoming_eta": inc["incoming_eta"]})
    zone_days = round(total_qty / zone_demand, 1) if zone_demand > 0 else None
    recs = []
    if (z["occupancy"] or 0) > target:
        recs.append(f"{zone_id} 점유율 {z['occupancy']:.1%}로 목표 {target:.0%} 초과 — 신규 유입을 줄여야 합니다.")
    inbound_skus = [t for t in top if t["incoming_qty"] > 0]
    if inbound_skus:
        recs.append("도착 예정 입고가 있는 SKU는 추가 발주를 보류하세요: "
                    + ", ".join(f"{t['sku']} 도착예정 {t['incoming_qty']}개" for t in inbound_skus[:5]))
    slow = [t for t in top if t["days_of_stock"] and t["days_of_stock"] > 30]
    if slow:
        recs.append("재고일수 과다(30일↑) SKU는 회전 촉진·타 존 재배치 후보: "
                    + ", ".join(f"{t['sku']} {t['days_of_stock']}일" for t in slow[:5]))
    if zone_days is not None:
        recs.append(f"존 전체 재고일수 ≈ {zone_days}일 (총 {total_qty}개 ÷ 일평균 소모 {round(zone_demand, 1)}개). "
                    "재고일수가 길수록 과잉이므로 발주 축소가 우선입니다.")
    return {"kpi": "zone_occupancy", "zone_id": zone_id, "occupancy": z["occupancy"], "target": target,
            "over_target": (z["occupancy"] or 0) > target, "total_qty": total_qty, "sku_count": len(skus),
            "zone_avg_daily_demand": round(zone_demand, 1), "zone_days_of_stock": zone_days,
            "incoming_total": incoming_total, "top_contributors": top, "recommendations": recs}


# ---------- ② 작업팀 가동률 ----------
def diagnose_utilization(target: float = 0.90) -> dict:
    wl = workload.estimate_workload("all")
    teams = max(1, wl["total_teams"])
    cap = teams * WORK_MIN_PER_DAY
    backlog = wl["total_work_minutes"]
    util = round(min(1.0, backlog / cap), 3) if cap else 0.0
    needed = math.ceil(backlog / (target * WORK_MIN_PER_DAY)) if target > 0 else teams
    add = max(0, needed - teams)
    items = {k: round(v.get("work_minutes", 0)) for k, v in wl["items"].items()}
    recs = []
    if util >= 1.0:
        recs.append(f"백로그 {backlog:.0f}분 ÷ 팀당 {WORK_MIN_PER_DAY}분 = {needed}팀 필요(현재 {teams}팀) → "
                    f"+{add}팀(작업자 {add * 2}·지게차 {add}) 투입 시 목표 {target:.0%} 이내로 진입.")
    else:
        recs.append(f"현재 가동률 {util:.0%}로 목표 {target:.0%} 대비 여유가 있습니다. 팀 증설보다 대기 물량 해소가 우선.")
    recs.append("업무량 구성(작업분): " + ", ".join(f"{k} {v}분" for k, v in items.items()))
    recs.append("가동률을 낮추려면 대기 물량(적치·피킹·출고확정)을 승인·처리하거나 팀을 늘리세요.")
    return {"kpi": "team_utilization", "utilization": util, "target": target,
            "total_work_minutes": backlog, "teams": teams, "capacity_minutes": cap,
            "needed_teams_for_target": needed, "add_teams": add, "work_breakdown": items,
            "recommendations": recs}


# ---------- ③ 출고지연 ----------
def diagnose_shipping_delay() -> dict:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    overdue = q("""SELECT COUNT(*) n FROM outbound_orders
                   WHERE status IN ('PLANNED','ALLOCATED','PICKING_ISSUED') AND due_datetime < ?""",
                (now,))[0]["n"]
    pending_confirm = q("SELECT COUNT(*) n FROM outbound_orders WHERE status='SHIPPING_PENDING'")[0]["n"]
    delay = kpi_dashboard.shipping_delay_count(kpi_dashboard.reference_date())
    recs = [
        f"출고지연 {delay}건 — 마감이 지났는데 아직 출고되지 않은 주문입니다.",
        f"마감이 지난 미착수 주문 {overdue}건은 '피킹지시'를 즉시 승인해 착수하세요(권장 시작=즉시).",
        f"출고확정 대기(SHIPPING_PENDING) {pending_confirm}건은 '출고확정'을 바로 처리하면 지연이 해소됩니다.",
        "처리 속도가 부족하면 작업팀 가동률을 확인해 팀 증설을 검토하세요.",
    ]
    return {"kpi": "shipping_delay", "delay_count": delay, "overdue_before_ship": overdue,
            "pending_confirm": pending_confirm, "recommendations": recs}


# ---------- ④ 적치지연 ----------
def diagnose_putaway_delay() -> dict:
    summ = stocking.summarize_backlog()
    wl = workload.estimate_workload("stocking")
    teams = max(1, wl["total_teams"])
    stock_min = round(wl["items"].get("stocking", {}).get("work_minutes", 0))
    hours = round(stock_min / teams / 60, 1) if teams else None
    delay = kpi_dashboard.putaway_delay_count(kpi_dashboard.reference_date())
    oldest = q("""SELECT expected_date d, COUNT(*) n FROM inbound_orders WHERE status='RECEIVED'
                  GROUP BY expected_date ORDER BY expected_date LIMIT 1""")
    recs = [f"적치지연 {delay}건 — 입고 완료 후 적치가 끝나지 않은 건입니다(적치 대기 총 {summ['total_count']}건)."]
    if oldest:
        recs.append(f"가장 오래된 대기부터 처리하세요: {oldest[0]['d']} {oldest[0]['n']}건.")
    recs.append(f"현재 팀 {teams}조로 적치 작업 {stock_min}분 ≈ {hours}시간 소요 예상 — '적치지시'를 승인해 착수하세요.")
    recs.append("완료가 지연되면 팀 증설(작업자·지게차)을 검토하세요.")
    return {"kpi": "putaway_delay", "delay_count": delay, "waiting_total": summ["total_count"],
            "work_minutes": stock_min, "teams": teams, "est_hours": hours,
            "oldest": (oldest[0] if oldest else None), "recommendations": recs}


_ALIASES = {"점유": "zone", "zone": "zone", "occupancy": "zone",
            "가동": "util", "utilization": "util", "workforce": "util", "team": "util",
            "출고지연": "ship", "출고 지연": "ship", "정시": "ship", "shipping": "ship",
            "적치지연": "putaway", "적치 지연": "putaway", "적치": "putaway",
            "putaway": "putaway", "stocking": "putaway"}


# 보조지표(핵심 4개 외) — 현재값은 조회하고 개선책은 KPI 정책문서(kpi_policy) 섹션을 근거로 안내
_SUPP = {"완료율": "stocking_completion_rate", "completion": "stocking_completion_rate",
         "정시": "on_time_shipping_rate", "on_time": "on_time_shipping_rate", "on-time": "on_time_shipping_rate",
         "체화": "dead_stock_count", "dead_stock": "dead_stock_count", "저회전": "dead_stock_count",
         "품절": "out_of_stock_count", "out_of_stock": "out_of_stock_count",
         "안전재고": "safety_stock_below_count", "safety_stock": "safety_stock_below_count",
         "결품": "expected_shortage_count", "shortage": "expected_shortage_count",
         "보충": "replenishment_needed_count", "replenish": "replenishment_needed_count",
         "소진": "stockout_within_week_count", "stockout": "stockout_within_week_count",
         "피킹 대기": "picking_wait", "피킹대기": "picking_wait", "picking_wait": "picking_wait",
         "자산": "inventory_value", "재고금액": "inventory_value", "재고가치": "inventory_value",
         "inventory_value": "inventory_value",
         "포화": "saturated_zone_count", "saturated": "saturated_zone_count",
         "목표초과": "zone_over_target_count"}


def diagnose(kpi: str | None = None, zone_id: str | None = None, targets: dict | None = None) -> dict:
    """자연어/파라미터로 대상 KPI를 판별해 해당 진단을 반환. 미특정 시 4개 KPI 전체."""
    targets = targets or {}
    zt = float(targets.get("kpi_target_zone_occupancy", 0.80))
    ut = float(targets.get("kpi_target_utilization", 0.90))
    text = f"{kpi or ''} {zone_id or ''}".lower()

    supp = next((v for a, v in _SUPP.items() if a.lower() in text), None)   # 보조지표: 값 + 문서 근거
    if supp:
        from tools import lookups
        rows = lookups.query_operation_kpis([supp])["kpis"]
        return {"kpi": supp, "current": (rows[0] if rows else None),
                "note": "개선 방안은 KPI 정책 문서(kpi_policy)의 해당 섹션(목표·경고기준·개선 SOP)을 근거로 안내한다."}

    key = next((v for a, v in _ALIASES.items() if a.lower() in text), None)

    if key == "util":
        return diagnose_utilization(ut)
    if key == "ship":
        return diagnose_shipping_delay()
    if key == "putaway":
        return diagnose_putaway_delay()
    if key == "zone" or zone_id:
        from tools.lookups import _resolve_zone
        zid = _resolve_zone(zone_id) or _resolve_zone(kpi)
        if zid:
            return diagnose_zone(zid, zt)
        over = [z for z in kpi_dashboard.zone_occupancy() if (z["occupancy"] or 0) > zt]
        return {"kpi": "zone_occupancy", "scope": "over_target", "target": zt,
                "over_target_zones": [z["zone_id"] for z in over],
                "diagnoses": [diagnose_zone(z["zone_id"], zt) for z in over[:3]]}

    # KPI 미특정 → 4개 전체 진단
    return {"kpi": "all",
            "zone_occupancy": diagnose(kpi="zone", targets=targets),
            "team_utilization": diagnose_utilization(ut),
            "shipping_delay": diagnose_shipping_delay(),
            "putaway_delay": diagnose_putaway_delay()}
