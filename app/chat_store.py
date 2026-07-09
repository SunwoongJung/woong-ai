"""대화 세션 영속화 — Chat UI의 대화 이력 저장/복원 + 멀티턴 맥락 공급.

계층 A(저장·복원): chat_sessions / chat_messages 테이블.
계층 B(맥락): recent_history()가 최근 N턴을 에이전트에 주입할 형태로 반환.
"""
import uuid
from datetime import datetime

from db.database import get_connection
from tools.common import q

HISTORY_TURNS = 12  # 에이전트에 주입할 최근 대화 메시지 수(멀티턴 맥락 — 직전 시뮬 결과 등 회상용)


def ensure_chat_tables() -> None:
    conn = get_connection()
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS chat_sessions (
            session_id TEXT PRIMARY KEY, user_id TEXT, title TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS chat_messages (
            msg_id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
            role TEXT NOT NULL, content TEXT NOT NULL, intent TEXT, sources_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chat_msg_session ON chat_messages(session_id)")
        conn.commit()
    finally:
        conn.close()


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_session(user_id: str | None = None, title: str | None = None) -> str:
    ensure_chat_tables()
    sid = "S-" + uuid.uuid4().hex[:8]
    conn = get_connection()
    try:
        conn.execute("INSERT INTO chat_sessions(session_id,user_id,title,created_at,updated_at)"
                     " VALUES(?,?,?,?,?)", (sid, user_id, title or "새 대화", _now(), _now()))
        conn.commit()
    finally:
        conn.close()
    return sid


def list_sessions(user_id: str | None = None, limit: int = 50) -> list[dict]:
    ensure_chat_tables()
    sql = ("SELECT s.session_id, s.title, s.updated_at, "
           "(SELECT COUNT(*) FROM chat_messages m WHERE m.session_id=s.session_id) AS msg_count "
           "FROM chat_sessions s")
    params: tuple = ()
    if user_id:
        sql += " WHERE s.user_id=?"
        params = (user_id,)
    sql += " ORDER BY s.updated_at DESC LIMIT ?"
    return q(sql, params + (limit,))


def get_messages(session_id: str) -> list[dict]:
    ensure_chat_tables()
    return q("SELECT role, content, intent, sources_json, created_at FROM chat_messages "
             "WHERE session_id=? ORDER BY msg_id", (session_id,))


def add_message(session_id: str, role: str, content: str,
                intent: str | None = None, sources: list | None = None) -> None:
    import json
    ensure_chat_tables()
    conn = get_connection()
    try:
        conn.execute("INSERT INTO chat_messages(session_id,role,content,intent,sources_json,created_at)"
                     " VALUES(?,?,?,?,?,?)",
                     (session_id, role, content, intent,
                      json.dumps(sources, ensure_ascii=False) if sources else None, _now()))
        # 첫 user 메시지면 제목 자동 설정
        if role == "user":
            cur = q("SELECT title FROM chat_sessions WHERE session_id=?", (session_id,))
            if cur and (cur[0]["title"] in (None, "", "새 대화")):
                conn.execute("UPDATE chat_sessions SET title=? WHERE session_id=?",
                             (content[:40], session_id))
        conn.execute("UPDATE chat_sessions SET updated_at=? WHERE session_id=?", (_now(), session_id))
        conn.commit()
    finally:
        conn.close()


def recent_history(session_id: str, turns: int = HISTORY_TURNS) -> list[dict]:
    """최근 N개 메시지를 시간순 [{role, content}]로 반환(맥락 주입용)."""
    if not session_id:
        return []
    rows = q("SELECT role, content FROM chat_messages WHERE session_id=? "
             "ORDER BY msg_id DESC LIMIT ?", (session_id, turns))
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def delete_session(session_id: str) -> None:
    ensure_chat_tables()
    conn = get_connection()
    try:
        conn.execute("DELETE FROM chat_messages WHERE session_id=?", (session_id,))
        conn.execute("DELETE FROM chat_sessions WHERE session_id=?", (session_id,))
        conn.commit()
    finally:
        conn.close()
