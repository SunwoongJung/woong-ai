"""사이클별 액션 실행 순서 트레이스.

advance()의 자원/배정 액션(FINISH_ZONE_LEG·START_ZONE_WORK·ALLOCATE_TEAM)과 control_loop의
도메인 액션(CREATE_* 등)을 '실제 실행된 순서(seq)'대로 한 버퍼에 모아 사이클 종료 시 flush한다.
§1(우선순위 실행)·§3(자원 해제 최우선)을 사람이 눈으로 검증하는 로그 — 어느 서브시스템이 만든
액션인지와 무관하게 실행 시점 순서를 그대로 기록하므로 사이클 전역 순서가 한 화면에 드러난다.
"""
import json

from bb.store import now
from db.database import get_connection

_BUF: list[dict] = []
_CYCLE_TS: str | None = None


def begin(cycle_ts: str | None = None) -> None:
    """사이클 시작 — 버퍼 리셋. control_loop.run_once()가 advance() 직전에 호출."""
    global _BUF, _CYCLE_TS
    _BUF = []
    _CYCLE_TS = cycle_ts or now()


def record(action_type: str, base_priority: float, effective_priority: float,
           target_id: str, decision: str, factors: dict | None = None,
           reason: str | None = None) -> None:
    """실행된 액션 1건 기록(seq는 flush 시 버퍼 순서로 부여). begin() 전이면 무시.
    reason = 우선순위/배정 사유(에이전트·스케줄러가 남긴 사람이 읽는 설명) → 경합 판정 이해용."""
    if _CYCLE_TS is None:
        return
    _BUF.append({"action_type": action_type, "base_priority": base_priority,
                 "effective_priority": effective_priority, "target_id": target_id,
                 "decision": decision, "factors": factors, "reason": reason})


def _ensure_table(conn) -> None:
    conn.execute("""CREATE TABLE IF NOT EXISTS action_exec_log(
        id INTEGER PRIMARY KEY AUTOINCREMENT, cycle_ts TEXT, seq INTEGER,
        action_type TEXT, base_priority REAL, effective_priority REAL,
        target_id TEXT, decision TEXT, factors_json TEXT, reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
    # 기존 DB(구 스키마)에 reason 컬럼 보강
    cols = [c[1] for c in conn.execute("PRAGMA table_info(action_exec_log)").fetchall()]
    if "reason" not in cols:
        conn.execute("ALTER TABLE action_exec_log ADD COLUMN reason TEXT")


def ensure_table() -> None:
    """조회 엔드포인트용 — 독립 커넥션으로 테이블 보장."""
    conn = get_connection()
    try:
        _ensure_table(conn)
        conn.commit()
    finally:
        conn.close()


def flush() -> None:
    """버퍼를 action_exec_log에 실행순(seq)으로 기록 + 최근 2000행 유지. 빈 사이클은 무기록."""
    global _BUF, _CYCLE_TS
    buf, cts = _BUF, _CYCLE_TS
    _BUF, _CYCLE_TS = [], None
    if not buf or cts is None:
        return
    conn = get_connection()
    try:
        _ensure_table(conn)
        for i, r in enumerate(buf, 1):
            conn.execute("""INSERT INTO action_exec_log(cycle_ts,seq,action_type,base_priority,
                            effective_priority,target_id,decision,factors_json,reason)
                            VALUES(?,?,?,?,?,?,?,?,?)""",
                         (cts, i, r["action_type"], r["base_priority"], r["effective_priority"],
                          r["target_id"], r["decision"],
                          json.dumps(r["factors"], ensure_ascii=False) if r["factors"] else None,
                          r.get("reason")))
        conn.execute("DELETE FROM action_exec_log WHERE id <= (SELECT MAX(id) - 2000 FROM action_exec_log)")
        conn.commit()
    finally:
        conn.close()
