"""Zone 작업시간·점유 판정 — 적치/피킹 공통.

Zone 작업시간(work_minutes)은 zone별 결정론적 고정값(팀·SKU 무관, bb/store.py에서 1회 백필).
Zone 점유는 별도 락 테이블 없이 작업 테이블(stocking_tasks/picking_tasks) 자체를 단일 소스로 판정한다:
"해당 zone에 started_at이 찍힌 IN_PROGRESS 작업이 있는가" = 사용중. Zone 동시용량은 1(엄격한 단일 점유).
"""
import itertools
import json

from db.database import get_connection
from tools.common import q


def zone_minutes(zone_id: str) -> float:
    r = q("SELECT work_minutes FROM zones WHERE zone_id=?", (zone_id,))
    return float(r[0]["work_minutes"]) if r and r[0]["work_minutes"] is not None else 10.0


# ---------- 피킹 동선: closed TSP(입구→방문존→입구) 완전탐색 ----------
_DM_CACHE = None


def _dist_matrix() -> dict:
    """입구+9존 전쌍 거리. sim.animation의 2D 레이아웃 재사용(지연 임포트로 순환 방지).
    좌표가 정적 상수라 1회 캐시. 거리 계산은 이 함수로 분리 — 추후 aisle graph 거리로 교체하는 단일 지점."""
    global _DM_CACHE
    if _DM_CACHE is None:
        from sim.animation import distance_matrix
        _DM_CACHE = distance_matrix()
    return _DM_CACHE


def _route_cost(route: list[str], dm: dict) -> float:
    """route 인접 노드 쌍 거리 합(입구 포함 closed tour)."""
    return sum(dm[route[i]][route[i + 1]] for i in range(len(route) - 1))


MIN_PER_DIST = 4.0   # 그리드 거리 1단위당 이동시간(분) — sim.animation.MIN_PER_CELL와 동일


def leg_travel_minutes(kind: str, task: dict) -> float:
    """현재 leg(직전 위치→현재 존)의 이동시간(분). 수리식 d_ij 반영.

    피킹만 모델링(적치는 단일 target zone, 이번 범위 제외 → 0).
    첫 존이면 입구→존, 이후 이전 존→현재 존. 마지막 존이면 존→입구 복귀 가산(closed tour 일관)."""
    if kind != "picking":
        return 0.0
    seq = json.loads(task.get("zone_sequence") or "[]")
    idx = task.get("zone_index") or 0
    if not (0 <= idx < len(seq)):
        return 0.0
    dm = _dist_matrix()
    cur = seq[idx]
    prev = "ENTRANCE" if idx == 0 else seq[idx - 1]
    travel = dm[prev][cur]
    if idx == len(seq) - 1:                 # 마지막 존 → 입구 복귀
        travel += dm[cur]["ENTRANCE"]
    return round(travel * MIN_PER_DIST, 2)


def remaining_travel_minutes(seq: list[str], idx: int = 0) -> float:
    """zone_index부터 남은 모든 leg의 이동시간 합(입구 복귀 포함). dispatch slack·완료예측용.
    leg_travel_minutes를 남은 구간에 대해 합산한 것과 동일."""
    if not seq or idx >= len(seq):
        return 0.0
    dm = _dist_matrix()
    prev = "ENTRANCE" if idx == 0 else seq[idx - 1]
    total = 0.0
    for i in range(idx, len(seq)):
        total += dm[prev][seq[i]]
        prev = seq[i]
    total += dm[prev]["ENTRANCE"]           # 마지막 존 → 입구 복귀
    return round(total * MIN_PER_DIST, 2)


def _solve_closed_tsp_bruteforce(zone_ids: list[str]) -> list[str]:
    """입구에서 출발해 모든 존을 한 번씩 방문 후 입구 복귀하는 최소거리 순서(입구 제외 반환).
    동일 거리는 순열 tuple 사전순으로 tie-break → 결과 재현성 보장."""
    zs = sorted(zone_ids)            # 결정성
    if not zs:
        return []
    if len(zs) == 1:
        return [zs[0]]
    dm = _dist_matrix()
    best = min(itertools.permutations(zs),
               key=lambda p: (_route_cost(["ENTRANCE", *p, "ENTRANCE"], dm), p))
    return list(best)


def route_plan(skus: list[str]) -> dict:
    """SKU 재고 존 → TSP 방문순서 + 거리비용·이동/작업시간 상세(로그·표시용)."""
    if not skus:
        return {"zone_ids": [], "zone_sequence": [], "route_cost": 0.0, "travel_minutes": 0.0, "work_minutes": 0.0}
    marks = ",".join("?" for _ in skus)
    zone_ids = sorted({r["zone_id"] for r in q(f"""SELECT DISTINCT z.zone_id FROM inventory i
                       JOIN locations l ON l.location_id=i.location_id JOIN zones z ON z.zone_id=l.zone_id
                       WHERE i.sku IN ({marks}) AND i.status='AVAILABLE'""", tuple(skus))})
    seq = _solve_closed_tsp_bruteforce(zone_ids)
    cost = _route_cost(["ENTRANCE", *seq, "ENTRANCE"], _dist_matrix()) if seq else 0.0
    return {"zone_ids": zone_ids, "zone_sequence": seq, "route_cost": round(cost, 2),
            "travel_minutes": remaining_travel_minutes(seq, 0),
            "work_minutes": round(sum(zone_minutes(z) for z in seq), 1)}


# ---------- 경로 계산 히스토리 persist ----------
def _ensure_route_table():
    conn = get_connection()
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS zone_routes(
            id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, task_id TEXT, order_no TEXT, source TEXT,
            zone_ids TEXT, zone_sequence TEXT, route_cost REAL, travel_minutes REAL, work_minutes REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
        conn.commit()
    finally:
        conn.close()


def log_route(conn, task_id: str, order_no: str, source: str, plan: dict):
    """피킹 경로 계산 결과 기록(AUTO|HITL). 호출자의 conn(트랜잭션) 사용 — 커밋은 호출자가. 최근 1000행 유지."""
    from bb.store import now as _now
    conn.execute("""INSERT INTO zone_routes(ts,task_id,order_no,source,zone_ids,zone_sequence,
                    route_cost,travel_minutes,work_minutes) VALUES(?,?,?,?,?,?,?,?,?)""",
                 (_now(), task_id, order_no, source,
                  json.dumps(plan.get("zone_ids", []), ensure_ascii=False),
                  json.dumps(plan.get("zone_sequence", []), ensure_ascii=False),
                  plan.get("route_cost"), plan.get("travel_minutes"), plan.get("work_minutes")))
    conn.execute("DELETE FROM zone_routes WHERE id <= (SELECT MAX(id) - 1000 FROM zone_routes)")


def zone_busy(zone_id: str, exclude_task_id: str | None = None) -> bool:
    """해당 zone에 이미 점유 중(IN_PROGRESS + started_at 존재)인 다른 작업이 있는가."""
    if not zone_id:
        return False
    st = q("""SELECT stocking_task_id id FROM stocking_tasks
              WHERE zone_id=? AND status='IN_PROGRESS' AND started_at IS NOT NULL""", (zone_id,))
    pk = q("""SELECT picking_task_id id FROM picking_tasks
              WHERE status='IN_PROGRESS' AND started_at IS NOT NULL
                AND json_extract(zone_sequence, '$[' || zone_index || ']')=?""", (zone_id,))
    busy_ids = [r["id"] for r in st] + [r["id"] for r in pk]
    if exclude_task_id:
        busy_ids = [i for i in busy_ids if i != exclude_task_id]
    return bool(busy_ids)


def current_zone(kind: str, task: dict) -> str | None:
    """작업의 '지금 목표 zone'. 적치=zone_id 고정, 피킹=zone_sequence[zone_index]."""
    if kind == "stocking":
        return task.get("zone_id")
    seq = json.loads(task.get("zone_sequence") or "[]")
    idx = task.get("zone_index") or 0
    return seq[idx] if 0 <= idx < len(seq) else None


def is_last_zone(kind: str, task: dict) -> bool:
    if kind == "stocking":
        return True
    seq = json.loads(task.get("zone_sequence") or "[]")
    idx = task.get("zone_index") or 0
    return idx >= len(seq) - 1
