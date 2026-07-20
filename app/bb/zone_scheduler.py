"""Zone 스케줄러 — 매 컨트롤 루프 사이클마다 zone 점유·team 배정 진행을 앞당긴다(폴링, 이벤트 1회성 아님).

team 배정 단계: ISSUED(팀 미배정)인 작업 중 team이 비면 FIFO로 ALLOCATE_TEAM — TASK_CREATED
이벤트는 1회만 발동되므로(ResourceAgent가 그 순간 team이 없으면 영영 재시도 안 됨), 여기서 폴링으로
보강한다. 완료 단계: IN_PROGRESS이고 작업시간이 다 된 작업 → FINISH_ZONE_LEG(적치는 즉시 완료,
피킹은 남은 zone이 있으면 zone_index만 전진). 시작 단계: team은 배정됐지만(TEAM_ASSIGNED) 목표
zone이 사용중이라 대기하던 작업 중, zone이 빈 것부터 FIFO로 START_ZONE_WORK. Zone 동시용량은
1(단일 점유).
"""
import json
from datetime import datetime

from bb import actions, exec_log, executor
from bb.agents.resource_agent import _free_team
from bb.store import now
from bb.zone_work import current_zone, zone_busy
from db.database import get_connection
from tools.common import q

NAME = "ZoneScheduler"
_KINDS = (("stocking_tasks", "stocking_task_id", "stocking"), ("picking_tasks", "picking_task_id", "picking"))


def _pending_team_requests() -> list[dict]:
    out = []
    for tbl, idcol, kind in _KINDS:
        rows = q(f"""SELECT {idcol} AS task_id, issued_at FROM {tbl}
                     WHERE status='ISSUED' AND worker_id IS NULL ORDER BY issued_at ASC""")
        out.extend({"task_id": r["task_id"], "kind": kind, "issued_at": r["issued_at"]} for r in rows)
    out.sort(key=lambda t: t["issued_at"] or "")   # stocking·picking 병합 후 발행시각 순 FIFO
    return out


# ---------- 처리순서 휴리스틱(dispatch_score) — issued_at FIFO 대체 ----------
_TS_FMTS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M")


def _dt(s):
    if not s:
        return None
    for f in _TS_FMTS:
        try:
            return datetime.strptime(str(s), f)
        except ValueError:
            continue
    try:                                   # 날짜만(expected_date) → 그날 09:00
        return datetime.strptime(str(s)[:10] + " 09:00:00", _TS_FMTS[0])
    except ValueError:
        return None


def _mins(a, b):
    return (b - a).total_seconds() / 60.0 if (a and b) else 0.0


def _c01(x):
    return max(0.0, min(x, 1.0))


def _pick_cand(r, now_dt, zmap):
    from bb.zone_work import remaining_travel_minutes
    seq = json.loads(r.get("zone_sequence") or "[]")
    idx = r.get("zone_index") or 0
    remaining = seq[idx:] if 0 <= idx < len(seq) else []
    rem_work = sum(zmap.get(z, 10.0) for z in remaining)          # 남은 존 작업시간
    rem_travel = remaining_travel_minutes(seq, idx)               # 남은 경로 이동시간(수리식 d_ij)
    rem_min = rem_work + rem_travel                               # 완료까지 남은 총 시간
    rem_zones = (len(seq) - idx) if seq else 0
    due = _dt(r.get("due_datetime"))
    slack = (_mins(now_dt, due) - rem_min) if due else None
    if slack is None:
        due_urg = 0.1
    elif slack <= 0:
        due_urg = 1.0
    elif slack <= 30:
        due_urg = 0.9
    elif slack <= 60:
        due_urg = 0.7
    elif slack <= 120:
        due_urg = 0.4
    else:
        due_urg = 0.1
    wait_age = _c01(_mins(_dt(r.get("issued_at")), now_dt) / 120)
    short = 1 - _c01(rem_min / 60)
    route = 1 - _c01(rem_zones / 5)
    score = 50 * due_urg + 25 * wait_age + 15 * short + 10 * route
    return {"task_id": r["id"], "kind": "picking", "issued_at": r.get("issued_at"),
            "zone_id": current_zone("picking", r), "dispatch_score": round(score, 3),
            "score_factors": {"due_urgency": round(due_urg, 3), "waiting_age": round(wait_age, 3),
                              "short_job_bonus": round(short, 3), "route_simplicity": round(route, 3),
                              "remaining_minutes": round(rem_min, 1), "remaining_work": round(rem_work, 1),
                              "remaining_travel": round(rem_travel, 1),
                              "slack_minutes": round(slack, 1) if slack is not None else None}}


def _stock_cand(r, now_dt, zmap, pend):
    recv = _dt(r.get("received_datetime")) or _dt((str(r.get("expected_date"))[:10] + " 09:00:00") if r.get("expected_date") else None)
    recv_age = _c01(_mins(recv, now_dt) / 1440)
    inq = r.get("qty") or 0
    ob_need = _c01(pend.get(r.get("sku"), 0) / inq) if inq > 0 else 0.0
    wait_age = _c01(_mins(_dt(r.get("issued_at")), now_dt) / 120)
    wm = zmap.get(r.get("zone_id"), 10.0)
    short = 1 - _c01(wm / 60)
    score = 45 * recv_age + 25 * ob_need + 20 * wait_age + 10 * short
    return {"task_id": r["id"], "kind": "stocking", "issued_at": r.get("issued_at"),
            "zone_id": r.get("zone_id"), "dispatch_score": round(score, 3),
            "score_factors": {"received_age": round(recv_age, 3), "outbound_need": round(ob_need, 3),
                              "waiting_age": round(wait_age, 3), "short_job_bonus": round(short, 3),
                              "pending_outbound_qty": pend.get(r.get("sku"), 0), "inbound_qty": inq}}


def _zmap() -> dict:
    return {r["zone_id"]: (r["work_minutes"] if r["work_minutes"] is not None else 10.0)
            for r in q("SELECT zone_id, work_minutes FROM zones")}


def _pending_outbound() -> dict:
    return {r["sku"]: r["s"] for r in q("""SELECT l.sku, COALESCE(SUM(l.qty),0) s
              FROM outbound_order_lines l JOIN outbound_orders o ON o.order_no=l.order_no
              WHERE o.status IN ('PLANNED','ALLOCATED','PICKING_ISSUED') GROUP BY l.sku""")}


def dispatch_score_for(task_id: str, kind: str) -> dict:
    """단일 작업의 dispatch_score + score_factors — ResourceAgent(B단계) ALLOCATE_TEAM 통일용.
    ZoneScheduler(A단계)와 동일 산식(_pick_cand/_stock_cand)을 재사용한다."""
    now_dt = _dt(now()) or datetime.now()
    zmap = _zmap()
    if kind == "picking":
        r = q("""SELECT p.picking_task_id id, p.issued_at, p.zone_sequence, p.zone_index, o.due_datetime
                 FROM picking_tasks p LEFT JOIN outbound_orders o ON o.order_no=p.order_no
                 WHERE p.picking_task_id=?""", (task_id,))
        c = _pick_cand(dict(r[0]), now_dt, zmap) if r else None
    else:
        r = q("""SELECT s.stocking_task_id id, s.issued_at, s.zone_id, i.sku, i.qty,
                        i.received_datetime, i.expected_date
                 FROM stocking_tasks s LEFT JOIN inbound_orders i ON i.inbound_no=s.inbound_no
                 WHERE s.stocking_task_id=?""", (task_id,))
        c = _stock_cand(dict(r[0]), now_dt, zmap, _pending_outbound()) if r else None
    if not c:
        return {"dispatch_score": 0.0, "score_factors": {}}
    return {"dispatch_score": c["dispatch_score"], "score_factors": c["score_factors"]}


def _dispatch_candidates(now_override=None) -> list[dict]:
    """ISSUED·미배정 피킹/적치를 dispatch_score로 정렬. 각 후보에 eligible(현재 zone 여유) 표시.
    정렬: dispatch_score DESC → issued_at ASC → task_id."""
    now_dt = _dt(now_override or now()) or datetime.now()
    zmap = _zmap()
    pend = _pending_outbound()
    cands = []
    for r in q("""SELECT p.picking_task_id id, p.issued_at, p.zone_sequence, p.zone_index, o.due_datetime
                  FROM picking_tasks p LEFT JOIN outbound_orders o ON o.order_no=p.order_no
                  WHERE p.status='ISSUED' AND p.worker_id IS NULL"""):
        cands.append(_pick_cand(dict(r), now_dt, zmap))
    for r in q("""SELECT s.stocking_task_id id, s.issued_at, s.zone_id, i.sku, i.qty,
                         i.received_datetime, i.expected_date
                  FROM stocking_tasks s LEFT JOIN inbound_orders i ON i.inbound_no=s.inbound_no
                  WHERE s.status='ISSUED' AND s.worker_id IS NULL"""):
        cands.append(_stock_cand(dict(r), now_dt, zmap, pend))
    for c in cands:   # 목표 zone이 사용 중이면 이번 사이클 배정 제외(None이면 통과)
        c["eligible"] = not (c["zone_id"] and zone_busy(c["zone_id"], exclude_task_id=c["task_id"]))
    cands.sort(key=lambda t: (-t["dispatch_score"], t["issued_at"] or "", t["task_id"]))
    return cands


# ---------- 계산 히스토리 persist ----------
def _ensure_dispatch_table():
    conn = get_connection()
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS dispatch_scores(
            id INTEGER PRIMARY KEY AUTOINCREMENT, cycle_ts TEXT, task_id TEXT, kind TEXT,
            zone_id TEXT, dispatch_score REAL, factors_json TEXT, decision TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
        conn.commit()
    finally:
        conn.close()


def _log_dispatch(cycle_ts, decided):
    """decided=[(candidate, decision)]. 배정이 발생한 사이클만 기록(스팸 방지) + 최근 1000행 유지."""
    _ensure_dispatch_table()
    conn = get_connection()
    try:
        for c, decision in decided:
            conn.execute("""INSERT INTO dispatch_scores(cycle_ts,task_id,kind,zone_id,dispatch_score,factors_json,decision)
                            VALUES(?,?,?,?,?,?,?)""",
                         (cycle_ts, c["task_id"], c["kind"], c["zone_id"], c["dispatch_score"],
                          json.dumps(c["score_factors"], ensure_ascii=False), decision))
        conn.execute("DELETE FROM dispatch_scores WHERE id <= (SELECT MAX(id) - 1000 FROM dispatch_scores)")
        conn.commit()
    finally:
        conn.close()


def _due_in_progress() -> list[dict]:
    out = []
    for tbl, idcol, kind in _KINDS:
        zone_idx_col = "zone_index" if kind == "picking" else "0 AS zone_index"
        rows = q(f"""SELECT {idcol} AS task_id, {zone_idx_col} FROM {tbl}
                     WHERE status='IN_PROGRESS' AND expected_complete_at IS NOT NULL
                       AND expected_complete_at<=?""", (now(),))
        for r in rows:
            out.append({"task_id": r["task_id"], "kind": kind, "zone_index": r.get("zone_index") or 0})
    return out


def _waiting_for_zone() -> list[dict]:
    out = []
    for tbl, idcol, kind in _KINDS:
        rows = q(f"SELECT * FROM {tbl} WHERE status='TEAM_ASSIGNED' ORDER BY issued_at ASC")
        for r in rows:
            out.append({"task_id": r[idcol], "kind": kind, "zone_index": r.get("zone_index") or 0,
                        "zone_id": current_zone(kind, r)})
    return out


def advance() -> dict:
    """단계 순서 = 자원 해제 최우선(§7): ①FINISH_ZONE_LEG → ②START_ZONE_WORK → ③ALLOCATE_TEAM.
    완료로 팀·존을 먼저 풀면 같은 사이클의 START·ALLOCATE가 그 자원을 즉시 재활용할 수 있다.
    실행 순서는 exec_log에 실시간 기록 → 사람이 '자원해제가 배정보다 먼저'임을 검증."""
    finished, started, allocated = [], [], []
    _P = actions.type_priority

    # ① 완료(자원·존 해제) — 최우선
    for t in _due_in_progress():
        aid = actions.create(
            agent_name=NAME, action_type="FINISH_ZONE_LEG",
            idempotency_key=f"FINISH_ZONE_LEG:{t['task_id']}:{t['zone_index']}",
            target_type="task", target_id=t["task_id"], payload={"task_id": t["task_id"], "kind": t["kind"]},
            priority_score=50.0, auto_executable=True, reason=f"{t['task_id']} zone 작업시간 종료 — 완료 처리")
        if aid["status"] == "PENDING":
            r = executor.execute(aid["action_id"])
            finished.append({"task_id": t["task_id"], "status": r.get("status")})
            exec_log.record("FINISH_ZONE_LEG", _P("FINISH_ZONE_LEG"), _P("FINISH_ZONE_LEG") + 50.0,
                            t["task_id"], str(r.get("status")),
                            reason="자원 해제 최우선 — zone 작업시간 종료로 팀·존 반환")

    # ② 대기 작업 시작 — 존 확보된 것부터
    for t in _waiting_for_zone():
        if t["zone_id"] and zone_busy(t["zone_id"], exclude_task_id=t["task_id"]):
            continue   # zone 사용중 — 대기 유지, 다음 사이클 재시도
        aid = actions.create(
            agent_name=NAME, action_type="START_ZONE_WORK",
            idempotency_key=f"START_ZONE_WORK:{t['task_id']}:{t['zone_index']}",
            target_type="task", target_id=t["task_id"], payload={"task_id": t["task_id"], "kind": t["kind"]},
            priority_score=45.0, auto_executable=True,
            reason=f"{t['task_id']} zone({t['zone_id'] or '-'}) 확보 — 작업 시작")
        if aid["status"] == "PENDING":
            r = executor.execute(aid["action_id"])
            if r.get("status") == "SUCCESS":
                started.append({"task_id": t["task_id"], "zone_id": t["zone_id"]})
            exec_log.record("START_ZONE_WORK", _P("START_ZONE_WORK"), _P("START_ZONE_WORK") + 45.0,
                            t["task_id"], str(r.get("status")),
                            reason=f"목표 zone({t['zone_id'] or '-'}) 확보 — 배정된 작업 시작(신규 배정보다 우선)")

    # ③ 신규 팀 배정 — dispatch_score 순(①②로 풀린 팀·존 반영해 재계산)
    cands = _dispatch_candidates()
    decided, cycle_ts, assigned_any, teams_out = [], now(), False, False
    for t in cands:
        if not t["eligible"]:
            decided.append((t, "SKIP_ZONE_BUSY")); continue   # 목표 zone 사용중 — 이번 사이클 제외
        if teams_out:
            decided.append((t, "SKIP_NO_TEAM")); continue
        team = _free_team()
        if not team:
            teams_out = True; decided.append((t, "SKIP_NO_TEAM")); continue   # team 풀 소진 → 배정 중단
        if t["zone_id"] and zone_busy(t["zone_id"], exclude_task_id=t["task_id"]):
            decided.append((t, "SKIP_ZONE_BUSY")); continue   # 방어적 재확인
        aid = actions.create(
            agent_name=NAME, action_type="ALLOCATE_TEAM",
            idempotency_key=f"ALLOCATE_TEAM:{t['task_id']}",
            target_type="task", target_id=t["task_id"],
            payload={"task_id": t["task_id"], "kind": t["kind"],
                     "dispatch_score": t["dispatch_score"], "score_factors": t["score_factors"], **team},
            priority_score=round(t["dispatch_score"], 2), auto_executable=True,
            reason=f"{t['task_id']} score={t['dispatch_score']} team({team['worker_id']}/{team['worker_id_2']}, {team['forklift_id']}) 배정")
        if aid["status"] == "PENDING":
            r = executor.execute(aid["action_id"])
            if r.get("status") == "SUCCESS":
                allocated.append({"task_id": t["task_id"], "dispatch_score": t["dispatch_score"]})
                decided.append((t, "ASSIGNED")); assigned_any = True
                _klabel = "피킹" if t["kind"] == "picking" else "적치"
                exec_log.record("ALLOCATE_TEAM", _P("ALLOCATE_TEAM"),
                                _P("ALLOCATE_TEAM") + t["dispatch_score"], t["task_id"], "ASSIGNED",
                                t["score_factors"],
                                reason=f"{_klabel} 후보 중 dispatch_score {t['dispatch_score']} 최고 → 가용 팀 배정")
            else:
                decided.append((t, "EXEC_" + str(r.get("status"))))
        else:
            decided.append((t, "DUP"))
    if assigned_any:
        _log_dispatch(cycle_ts, decided)   # 배정 있었던 사이클만 계산 히스토리 기록

    return {"allocated": allocated, "finished": finished, "started": started}
