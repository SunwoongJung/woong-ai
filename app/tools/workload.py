"""작업량·완료시간·가용팀 추정 — "완료 예상시간/얼마나 걸려/오늘 다 끝낼 수 있어/가용 팀" 질의 응답용.

계산에 필요한 데이터는 이미 존재하나(process_time_params 소요시간, resources 팀 수) 챗 Tool로
노출되지 않았던 공백을 채운다. 산식: 대기 물량 × 건당 소요분 ÷ 가용 팀 수 → 09-18(540분/일)
근무시간에 매핑해 완료 예상 시각·오늘 처리 가능 여부를 산출한다(LLM 자가계산 금지 원칙 준수).
"""
from datetime import datetime, timedelta

import resmgmt
from config import settings
from tools.common import q
from tools.picking import calculate_picking_required_time

WORK_START_H, WORK_END_H = 9, 18
WORK_MIN_PER_DAY = (WORK_END_H - WORK_START_H) * 60   # 540
_FMT = "%Y-%m-%d %H:%M"
_BUSY = ("TEAM_ASSIGNED", "IN_PROGRESS")


def _proc_minutes() -> dict:
    return {r["stage"]: r["mean_minutes"] for r in q("SELECT stage, mean_minutes FROM process_time_params")}


def team_capacity() -> dict:
    """현재 작업팀(작업자2+지게차1) 총/사용중/가용 수."""
    r = resmgmt.get_resources()
    total = max(0, min(r["worker"] // 2, r["forklift"]))
    marks = ",".join("?" for _ in _BUSY)
    busy = q(f"""SELECT COUNT(*) n FROM (
        SELECT picking_task_id FROM picking_tasks WHERE worker_id IS NOT NULL AND status IN ({marks})
        UNION ALL
        SELECT stocking_task_id FROM stocking_tasks WHERE worker_id IS NOT NULL AND status IN ({marks}))""",
             (*_BUSY, *_BUSY))[0]["n"]
    return {"total_teams": total, "busy_teams": busy, "available_teams": max(0, total - busy),
            "worker": r["worker"], "forklift": r["forklift"]}


def _add_work_minutes(start: datetime, minutes: float) -> datetime:
    """09-18 근무시간만 소비하며 minutes 경과 후 시각 반환(야간·다음날 이월)."""
    cur, remaining, guard = start, float(minutes), 0
    while remaining > 1e-9 and guard < 400:
        guard += 1
        day_start = cur.replace(hour=WORK_START_H, minute=0, second=0, microsecond=0)
        day_end = cur.replace(hour=WORK_END_H, minute=0, second=0, microsecond=0)
        if cur < day_start:
            cur = day_start
        if cur >= day_end:
            cur = (cur + timedelta(days=1)).replace(hour=WORK_START_H, minute=0, second=0, microsecond=0)
            continue
        take = min((day_end - cur).total_seconds() / 60, remaining)
        cur += timedelta(minutes=take)
        remaining -= take
    return cur


def estimate_workload(scope: str = "all", current_datetime: str | None = None) -> dict:
    """적치·피킹·출고확정 대기 물량의 작업량과 완료 예상시간을 산출."""
    pm = _proc_minutes()
    cap = team_capacity()
    teams = max(1, cap["total_teams"])
    items = {}

    if scope in ("all", "stocking", "inbound"):
        n = q("SELECT COUNT(*) n FROM inbound_orders WHERE status='RECEIVED'")[0]["n"]
        per = pm.get("STOCKING", 8)
        items["stocking"] = {"label": "적치", "pending": n, "minutes_each": per,
                             "work_minutes": round(n * per, 1)}
    if scope in ("all", "picking", "outbound"):
        orders = q("SELECT order_no FROM outbound_orders WHERE status IN ('PLANNED','ALLOCATED')")
        total_pick = 0.0
        for o in orders:
            try:
                total_pick += calculate_picking_required_time(o["order_no"])["estimated_minutes"]
            except Exception:
                total_pick += pm.get("PICKING", 15)
        items["picking"] = {"label": "피킹", "pending": len(orders), "work_minutes": round(total_pick, 1)}
    if scope in ("all", "shipping"):
        n = q("SELECT COUNT(*) n FROM shipping_pending WHERE status='PENDING'")[0]["n"]
        per = pm.get("PACKING_SHIP", 10)
        items["shipping_confirm"] = {"label": "출고확정", "pending": n, "minutes_each": per,
                                     "work_minutes": round(n * per, 1)}

    total_work = round(sum(v["work_minutes"] for v in items.values()), 1)
    elapsed = total_work / teams   # 팀 병렬 처리 가정
    start = (datetime.strptime(current_datetime, _FMT) if current_datetime
             else datetime.strptime(f"{settings.base_date} {WORK_START_H:02d}:00", _FMT))
    completion = _add_work_minutes(start, elapsed)
    today_end = start.replace(hour=WORK_END_H, minute=0, second=0, microsecond=0)
    feasible = completion <= today_end
    return {
        "scope": scope, "items": items,
        "total_work_minutes": total_work,
        "teams_used": teams,
        "available_teams": cap["available_teams"], "total_teams": cap["total_teams"],
        "capacity": cap,
        "estimated_elapsed_minutes": round(elapsed, 1),
        "estimated_elapsed_hours": round(elapsed / 60, 1),
        "start_time": start.strftime(_FMT),
        "estimated_completion": completion.strftime(_FMT),
        "오늘완료가능여부": "가능" if feasible else "불가(익일 이후로 이월)",
        "note": "산식: 대기 물량 × 건당 소요분 ÷ 가용 팀 수, 09-18 근무시간 기준",
    }
