"""LLM-as-a-Judge 측정기 — Faithfulness / Relevance (docs/10_EVALUATION_PLAN §6 Groundedness).

경량 모델(router model)로 채점하고 JSON을 파싱한다. 채점 근거(context)는 응답 생성에 실제로
투입된 tool_results + rag_evidence(= agent 상태)로 한정한다. 즉 "응답의 모든 주장·수치가 그
근거로 뒷받침되는가"를 재현 가능한 규칙으로 정량화한다(수동 라벨 없이 자동 계측).
"""
import json

from config import settings
from llm import chat


def _judge_json(system: str, user: str) -> dict:
    raw = chat([{"role": "system", "content": system}, {"role": "user", "content": user}],
               model=settings.openai_router_model, temperature=0)
    s = (raw or "").strip()
    if s.startswith("```"):
        s = s.strip("`")
        if s[:4].lower() == "json":
            s = s[4:]
    i, j = s.find("{"), s.rfind("}")
    if i < 0 or j < 0:
        return {}
    try:
        return json.loads(s[i:j + 1])
    except Exception:
        return {}


def judge_faithfulness(query: str, response: str, context: dict) -> dict:
    """응답의 모든 사실·수치가 <근거>로 뒷받침되는가(환각 여부). 0~1 점수 + 미근거 항목."""
    system = (
        "너는 RAG 응답의 Faithfulness(충실도) 채점기다. 오직 제공된 <근거>만 참으로 간주한다.\n"
        "- 응답의 모든 사실·수치·날짜가 <근거>로 뒷받침되면 score=1.0.\n"
        "- <근거>에 없는 주장·수치가 있으면 그만큼 감점하고 unsupported에 나열한다.\n"
        "- '근거 부족합니다' 같은 정직한 회피(abstain) 응답은 환각이 아니므로 faithful=true, score=1.0.\n"
        "반드시 JSON만 출력: {\"faithful\": bool, \"score\": 0~1, \"unsupported\": [\"...\"], \"reason\": \"...\"}")
    # 근거 전체를 판정에 넣어야 정확(길이 부족 시 근거에 있는 값을 '미근거'로 오판). 12k로 확대.
    ctx = json.dumps(context, ensure_ascii=False)[:12000]
    user = f"<질문>\n{query}\n\n<근거>\n{ctx}\n\n<응답>\n{response}"
    j = _judge_json(system, user)
    return {"score": float(j.get("score", 0.0) or 0.0), "faithful": bool(j.get("faithful", False)),
            "unsupported": j.get("unsupported", []) or [], "reason": j.get("reason", "")}


def judge_relevance(query: str, response: str) -> dict:
    """응답이 질문의 요구를 직접 충족하는가(관련성). 0~1 점수."""
    system = (
        "너는 응답 Relevance(관련성) 채점기다.\n"
        "- 응답이 질문의 요구를 직접·충분히 충족하면 score=1.0.\n"
        "- 동문서답·핵심 누락·불필요한 확장은 감점.\n"
        "- 질문이 답할 수 없는 범위 밖이라 정중히 거절/회피한 응답은 relevant=true로 본다.\n"
        "반드시 JSON만 출력: {\"relevant\": bool, \"score\": 0~1, \"reason\": \"...\"}")
    user = f"<질문>\n{query}\n\n<응답>\n{response}"
    j = _judge_json(system, user)
    return {"score": float(j.get("score", 0.0) or 0.0), "relevant": bool(j.get("relevant", False)),
            "reason": j.get("reason", "")}
