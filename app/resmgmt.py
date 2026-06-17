"""운영 자원(작업자/지게차) 기준값 조회·업데이트.

resources는 작업자/지게차 개별 row 기반으로 관리한다. What-if는 DB를 수정하지 않고
시나리오 delta만 적용하며, baseline 업데이트 시 active resource row를 실제로 조정한다.
"""
from db.database import get_connection
from tools.common import q


RESOURCE_TYPES = {
    "WORKER": {"prefix": "W", "default_shift": ("08:00", "17:00")},
    "FORKLIFT": {"prefix": "F", "default_shift": ("08:00", "17:00")},
}


def ensure_resource_rows_schema() -> None:
    """기존 count 집계형 resources 테이블을 개별 row 구조로 1회 마이그레이션."""
    conn = get_connection()
    try:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(resources)").fetchall()]
        if "count" not in cols:
            return
        old = conn.execute(
            "SELECT resource_type, count, shift_start, shift_end, active_flag FROM resources"
        ).fetchall()
        counts: dict[str, dict] = {}
        for row in old:
            typ = row["resource_type"]
            if typ not in RESOURCE_TYPES:
                continue
            item = counts.setdefault(typ, {"count": 0, "shift_start": row["shift_start"],
                                           "shift_end": row["shift_end"], "active_flag": row["active_flag"]})
            if row["active_flag"]:
                item["count"] += max(0, int(row["count"] or 0))

        conn.execute("ALTER TABLE resources RENAME TO resources_aggregate_backup")
        conn.execute("""CREATE TABLE resources (
            resource_id TEXT PRIMARY KEY,
            resource_type TEXT NOT NULL,
            shift_start TEXT,
            shift_end TEXT,
            active_flag INTEGER DEFAULT 1
        )""")
        for typ, item in counts.items():
            prefix = RESOURCE_TYPES[typ]["prefix"]
            shift_start = item["shift_start"] or RESOURCE_TYPES[typ]["default_shift"][0]
            shift_end = item["shift_end"] or RESOURCE_TYPES[typ]["default_shift"][1]
            for i in range(1, item["count"] + 1):
                conn.execute(
                    "INSERT INTO resources(resource_id,resource_type,shift_start,shift_end,active_flag) VALUES(?,?,?,?,1)",
                    (f"{prefix}-{i:02d}", typ, shift_start, shift_end),
                )
        conn.commit()
    finally:
        conn.close()


def _counts(conn) -> dict[str, int]:
    rows = conn.execute("""SELECT resource_type, COUNT(*) count FROM resources
                           WHERE active_flag=1 GROUP BY resource_type""").fetchall()
    d = {r["resource_type"]: r["count"] for r in rows}
    return {"WORKER": d.get("WORKER", 0), "FORKLIFT": d.get("FORKLIFT", 0)}


def _next_id(conn, typ: str) -> str:
    prefix = RESOURCE_TYPES[typ]["prefix"]
    rows = conn.execute("SELECT resource_id FROM resources WHERE resource_type=?", (typ,)).fetchall()
    nums = []
    for row in rows:
        rid = row["resource_id"] or ""
        if rid.startswith(prefix + "-"):
            try:
                nums.append(int(rid.split("-", 1)[1]))
            except ValueError:
                pass
    return f"{prefix}-{(max(nums) if nums else 0) + 1:02d}"


def _set_active_count(conn, typ: str, target: int) -> None:
    target = max(1, int(target))
    cur = _counts(conn).get(typ, 0)
    if cur == target:
        return
    if cur < target:
        need = target - cur
        inactive = conn.execute("""SELECT resource_id FROM resources
                                   WHERE resource_type=? AND active_flag=0
                                   ORDER BY resource_id LIMIT ?""", (typ, need)).fetchall()
        for row in inactive:
            conn.execute("UPDATE resources SET active_flag=1 WHERE resource_id=?", (row["resource_id"],))
        need -= len(inactive)
        shift_start, shift_end = RESOURCE_TYPES[typ]["default_shift"]
        for _ in range(need):
            conn.execute(
                "INSERT INTO resources(resource_id,resource_type,shift_start,shift_end,active_flag) VALUES(?,?,?,?,1)",
                (_next_id(conn, typ), typ, shift_start, shift_end),
            )
        return

    remove = cur - target
    active = conn.execute("""SELECT resource_id FROM resources
                             WHERE resource_type=? AND active_flag=1
                             ORDER BY resource_id DESC LIMIT ?""", (typ, remove)).fetchall()
    for row in active:
        conn.execute("UPDATE resources SET active_flag=0 WHERE resource_id=?", (row["resource_id"],))


def get_resources() -> dict:
    ensure_resource_rows_schema()
    d = {r["resource_type"]: r["count"] for r in q("""SELECT resource_type, COUNT(*) count
                                                     FROM resources WHERE active_flag=1
                                                     GROUP BY resource_type""")}
    return {"worker": d.get("WORKER", 0), "forklift": d.get("FORKLIFT", 0)}


def update_resources(worker: int, forklift: int) -> dict:
    ensure_resource_rows_schema()
    conn = get_connection()
    try:
        _set_active_count(conn, "WORKER", worker)
        _set_active_count(conn, "FORKLIFT", forklift)
        conn.commit()
    finally:
        conn.close()
    return get_resources()
