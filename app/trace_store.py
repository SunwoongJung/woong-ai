"""에이전트 실행 트레이스 — LangGraph 노드 흐름 + RAG 검색 과정을 per-run 저장(Phoenix식 관측).

기존 tool_logs/rag_logs는 챗 그래프가 직접 도구를 호출해 채워지지 않으므로, 매 /chat 실행의
최종 상태에서 노드별 입출력을 재구성해 agent_traces에 저장한다. AI 동작 검증 화면이 이를 읽는다.
"""
import json
import uuid
from datetime import datetime

from db.database import get_connection
from tools.common import q


def ensure_trace_table() -> None:
    conn = get_connection()
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS agent_traces (
            run_id TEXT PRIMARY KEY, session_id TEXT, query TEXT, intent TEXT, confidence REAL,
            rag_required INTEGER, answerable INTEGER, sufficiency REAL, retries INTEGER,
            abstain INTEGER, approval_required INTEGER, steps_json TEXT, final_response TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
        conn.commit()
    finally:
        conn.close()


def build_steps(state: dict) -> list[dict]:
    """최종 상태에서 노드 실행 경로를 논리적으로 재구성."""
    steps = [{"node": "Router", "label": "의도 분류(LLM)",
              "out": {"intent": state.get("intent"), "confidence": state.get("intent_confidence"),
                      "parameters": state.get("parameters", {})}}]
    missing = state.get("missing_parameters") or []
    steps.append({"node": "Param Extractor", "label": "필수 파라미터 검증",
                  "out": {"missing_parameters": missing}})
    if missing:
        steps.append({"node": "Response Generator", "label": "되묻기(clarify)",
                      "out": {"final_response": state.get("final_response")}})
        return steps
    steps.append({"node": "Planner", "label": "실행 계획", "out": {"plan": state.get("plan", [])}})
    tr = state.get("tool_results", {}) or {}
    steps.append({"node": "Tool Executor", "label": "도구 실행",
                  "out": {"tools": [k for k in tr.keys() if not k.startswith("_")],
                          "error": state.get("error")}})
    steps.append({"node": "Verifier", "label": "결과 검증",
                  "out": {"verification_results": state.get("verification_results", {})}})
    rag_req = bool(state.get("rag_required"))
    steps.append({"node": "RAG Decision", "label": "문서검색 필요 판단", "out": {"rag_required": rag_req}})
    if rag_req:
        suff = state.get("_rag_sufficiency") or {}
        steps.append({"node": "RAG Retriever", "label": "검색·PRISM 리랭크·충분성 게이트",
                      "out": {"evidence": state.get("rag_context", []),
                              "answerable": state.get("rag_context_sufficient"),
                              "sufficiency_score": suff.get("context_sufficiency_score"),
                              "missing_evidence_types": suff.get("missing_evidence_types", []),
                              "retries": state.get("rag_retry_count"),
                              "abstain": bool(state.get("_rag_abstain"))}})
    steps.append({"node": "Response Generator", "label": "응답 생성(LLM)",
                  "out": {"final_response": state.get("final_response")}})
    steps.append({"node": "Approval Gate", "label": "승인 게이트(HITL)",
                  "out": {"approval_required": bool(state.get("approval_required")),
                          "draft_actions": state.get("draft_actions", [])}})
    return steps


def save(state: dict, session_id: str | None = None, query: str | None = None) -> str:
    ensure_trace_table()
    run_id = "R-" + uuid.uuid4().hex[:8]
    suff = state.get("_rag_sufficiency") or {}
    steps = build_steps(state)
    conn = get_connection()
    try:
        conn.execute("""INSERT INTO agent_traces(run_id,session_id,query,intent,confidence,rag_required,
            answerable,sufficiency,retries,abstain,approval_required,steps_json,final_response,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (run_id, session_id, query or state.get("user_query"), state.get("intent"),
                      state.get("intent_confidence"), 1 if state.get("rag_required") else 0,
                      1 if state.get("rag_context_sufficient") else 0,
                      suff.get("context_sufficiency_score"), state.get("rag_retry_count"),
                      1 if state.get("_rag_abstain") else 0, 1 if state.get("approval_required") else 0,
                      json.dumps(steps, ensure_ascii=False, default=str), state.get("final_response"),
                      datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
    finally:
        conn.close()
    return run_id


def list_traces(limit: int = 40) -> list[dict]:
    ensure_trace_table()
    return q("""SELECT run_id, query, intent, confidence, rag_required, answerable, retries,
                abstain, approval_required, created_at FROM agent_traces
                ORDER BY created_at DESC, rowid DESC LIMIT ?""", (limit,))


def get_trace(run_id: str) -> dict | None:
    ensure_trace_table()
    rows = q("SELECT * FROM agent_traces WHERE run_id=?", (run_id,))
    if not rows:
        return None
    t = rows[0]
    t["steps"] = json.loads(t.pop("steps_json") or "[]")
    return t
