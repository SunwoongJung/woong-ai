"""Auto Mode 컨트롤 루프 — 의사결정 주기마다 이벤트 수집→에이전트 제안→정책/실행.

run_once(): 1 사이클(테스트 가능). run_forever(): 별도 스레드에서 주기 반복(블로킹 작업이 async 루프를
막지 않도록 스레드로 동작). 빌드 6~8은 Picking 흐름만 — 도메인 6종·배치 시뮬은 빌드 9~10.
"""
import threading
import time

from bb import actions, audit, backorder, events, exec_log, executor, settings, simulation_agent, zone_scheduler
from bb.agents import REGISTRY
from bb.store import ensure_schema, now


_ZONE_CACHE: dict = {}


def _zone_of(location_id):
    if not location_id:
        return None
    if location_id not in _ZONE_CACHE:
        from tools.common import q
        r = q("SELECT zone_id FROM locations WHERE location_id=?", (location_id,))
        _ZONE_CACHE[location_id] = r[0]["zone_id"] if r else None
    return _ZONE_CACHE[location_id]


def _gate_block(action_type: str, payload: dict, g: dict):
    """노동/공간 2차원 게이트 → 차단 사유(문자열) 또는 None."""
    if action_type in simulation_agent.LABOR_GATED and not g.get("labor_ok", True):
        u = (g.get("kpis") or {}).get("resource_utilization_team")
        return f"가동률 과부하({u*100:.0f}%)" if u is not None else "가동률 과부하"
    if action_type in simulation_agent.SPACE_GATED:
        zb = g.get("zone_block", 1.0)
        zp = g.get("zone_peak") or {}
        zone = _zone_of(payload.get("location_id"))       # 적치: 목표 존
        occ = zp.get(zone) if zone else g.get("worst_zone_occ")   # 입고 등: 최악 존
        if occ is not None and occ > zb:
            return f"보관공간 과부하({zone or '전체'} {occ*100:.0f}%)"
    return None


# ---------- Action 실행 우선순위(§1) ----------
def _action_type_priority(action_type: str) -> float:
    """action_type별 base 우선순위(actions.BASE_PRIORITY). 표에 없으면 기본값."""
    return actions.type_priority(action_type)


def _effective_priority(spec: dict) -> float:
    """base + spec.priority_score. spec에 priority_score가 없으면 base만."""
    return _action_type_priority(spec["action_type"]) + float(spec.get("priority_score") or 0)


def run_once(force: bool = False, step_delay: float | None = None) -> dict:
    """1 사이클: NEW 이벤트 → 에이전트 propose → Action 생성·실행. 실행 중 발생한 체인 이벤트
    (NEED_PUTAWAY·TASK_CREATED)도 같은 사이클에서 소진(budget·pass 상한).
    step_delay: Action 1건 처리 후 지연(초) — 한 건씩 흘러가는 모습을 눈으로 보이게 함."""
    ensure_schema()
    if not force and not settings.enabled():
        return {"enabled": False, "events": 0, "created": [], "executed": []}
    if step_delay is None:
        step_delay = settings.step_delay()
    budget = settings.max_actions_per_cycle()
    out = {"enabled": True, "events": 0, "created": [], "executed": []}

    # 배치 What-if 게이트 — 캐시(논블로킹) 확인만. 오래됐으면 gate()가 백그라운드 갱신을 트리거하고,
    # 그 실제 실행 구간의 감사로그(SimulationAgent)는 simulation_agent.evaluate()가 직접 남긴다.
    sim_gate = {"ok": True, "ran": False, "reason": "시뮬 미사용", "kpis": {}}
    if settings.simulation_required() and events.new_events(limit=1):
        sim_gate = simulation_agent.gate()
        # 워밍업 대기: 첫 배치 시뮬 결과가 아직 없으면(ts is None — 첫 DES 진행중) 이번 사이클을 통째로
        # 보류한다. 이벤트를 NEW로 보존해 첫 시뮬 완료 후 사이클에서 처리 → 예측 없이 일감을 내보내지
        # 않는다. (DES 오류로 ts는 있으나 ran=False인 경우는 기존 fail-open 정책대로 진행 — 영구 데드락 방지)
        if settings.enabled() and sim_gate.get("ts") is None:
            out["simulation"] = sim_gate
            out["warmup"] = True
            out["reason"] = "시뮬레이션 워밍업 — 첫 배치 시뮬 완료 대기(이벤트 보존)"
            audit.log("PRECHECK", "OK", agent_name="SimulationAgent", action_type="BATCH_SIMULATION",
                      message="시뮬레이션 워밍업 — 첫 배치 시뮬 완료까지 자동처리 대기")
            return out
    out["simulation"] = sim_gate
    exec_log.begin(now())   # 실행 순서 트레이스 시작 — advance()·도메인 action을 한 사이클 순서로 기록
    out["zone_scheduler"] = zone_scheduler.advance()   # 매 사이클: 완료(자원해제)→시작→팀배정
    # 발주 리드타임 경과분 입고 도착 + 재고 채워진 백오더 재개
    out["arrived"] = backorder.arrive_due_replenishments()
    out["resumed"] = backorder.resume_fillable()

    passes = 0
    while budget > 0 and passes < 100:
        passes += 1
        evs = events.new_events(limit=budget)
        if not evs:
            break
        # 이벤트 순서(severity+시각)는 수집에만 유지 — 실행은 action effective_priority 순(§1)
        for ev in evs:
            events.set_status(ev["event_id"], "PROCESSING")
            audit.log("EVENT_RECEIVED", "OK", event_id=ev["event_id"], message=ev["event_type"])
        cands, remaining = [], {}   # (spec, event_id) 후보 + 이벤트별 미시도 수(예산 부족 시 되돌림용)
        for ev in evs:
            for agent in REGISTRY:
                if not agent.handles(ev["event_type"]):
                    continue
                for spec in agent.propose(ev):
                    cands.append((spec, ev["event_id"]))
                    remaining[ev["event_id"]] = remaining.get(ev["event_id"], 0) + 1
        cands.sort(key=lambda c: (-_effective_priority(c[0]),
                                  str(c[0].get("idempotency_key") or c[0].get("target_id") or "")))
        for spec, eid in cands:
            if budget <= 0:
                break
            res = actions.create(**spec)
            out["created"].append({"action_id": res.get("action_id"), "status": res["status"],
                                   "agent": spec["agent_name"], "type": spec["action_type"]})
            remaining[eid] -= 1
            if res["status"] == "PENDING":
                audit.log("ACTION_CREATED", "OK", action_id=res["action_id"], event_id=eid,
                          agent_name=spec["agent_name"], action_type=spec["action_type"],
                          message=spec.get("reason"))
                base, eff = _action_type_priority(spec["action_type"]), _effective_priority(spec)
                tgt = spec.get("target_id") or ""
                block = _gate_block(spec["action_type"], spec.get("payload") or {}, sim_gate)
                if block:
                    actions.update(res["action_id"], status="POLICY_BLOCKED",
                                   reason=f"배치 시뮬 차단: {block}", finished_at=now())
                    audit.log("POLICY_CHECK", "BLOCKED", action_id=res["action_id"], event_id=eid,
                              agent_name=spec["agent_name"], action_type=spec["action_type"],
                              message=f"시뮬 게이트: {block}")
                    out["executed"].append({"action_id": res["action_id"], "agent": spec["agent_name"],
                                            "type": spec["action_type"], "status": "POLICY_BLOCKED",
                                            "reason": block})
                    exec_log.record(spec["action_type"], base, eff, tgt, "POLICY_BLOCKED",
                                    reason=f"{spec.get('reason') or ''} — [차단] {block}")
                else:
                    r = executor.execute(res["action_id"])
                    out["executed"].append({"action_id": res["action_id"], "agent": spec["agent_name"],
                                            "type": spec["action_type"], "status": r.get("status"),
                                            "reason": r.get("reason")})
                    exec_log.record(spec["action_type"], base, eff, tgt, str(r.get("status")), reason=spec.get("reason"))
                budget -= 1
                if step_delay > 0:
                    time.sleep(step_delay)   # 한 건씩 가시화(사람이 흐름을 볼 수 있게)
        for ev in evs:   # 모든 후보 시도됨 → PROCESSED, 예산부족으로 남으면 NEW로 되돌려 다음 사이클 재시도
            if remaining.get(ev["event_id"], 0) <= 0:
                events.set_status(ev["event_id"], "PROCESSED"); out["events"] += 1
            else:
                events.set_status(ev["event_id"], "NEW")
    exec_log.flush()   # 이번 사이클 실행 순서 확정 기록(빈 사이클은 무기록)
    return out


# ---------- 백그라운드 주기 실행 ----------
_thread: threading.Thread | None = None
_running = False


def _loop():
    while _running:   # _running은 start()/stop()에서만 갱신 — 여기선 읽기만 하므로 global 선언 불필요
        try:
            if settings.enabled():
                run_once()
        except Exception as e:  # noqa: BLE001
            audit.log("FINISHED", "FAIL", message=f"control loop 오류: {e}")
        time.sleep(settings.cycle_seconds())


def start() -> dict:
    global _thread, _running
    if not _running:
        _running = True
        simulation_agent.kick()   # 첫 배치 시뮬을 백그라운드로 띄움
        _thread = threading.Thread(target=_loop, name="bb-control-loop", daemon=True)
        _thread.start()
    return {"running": _running, "cycle_seconds": settings.cycle_seconds()}


def stop() -> dict:
    global _running
    _running = False
    return {"running": _running}


def status() -> dict:
    return {"running": _running, "enabled": settings.enabled(), "cycle_seconds": settings.cycle_seconds()}
