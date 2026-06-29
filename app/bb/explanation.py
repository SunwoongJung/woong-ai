"""Explanation Agent — 자동 의사결정을 운영자용 한국어 1~2문장으로 설명.

LLM(llm.complete, node='Explanation')로 생성하고, 키 미설정·오류 시 템플릿으로 폴백한다.
설명은 blackboard_actions.explanation에 캐시(최초 조회 시 생성).
"""
import json

from bb import actions

_TYPE_LABEL = {
    "CREATE_PICKING_TASK": "피킹작업 생성", "CREATE_INBOUND_TASK": "입고 처리",
    "CREATE_PUTAWAY_TASK": "적치작업 생성", "CREATE_SHIPPING_TASK": "출고준비 생성",
    "ALLOCATE_WORKER": "작업자 배정", "REPRIORITIZE_PICKING_TASK": "피킹 우선순위 조정",
    "INVENTORY_RISK_ALERT": "결품 위험 경보", "PUTAWAY_BLOCKED": "적치 보류",
    "ADJUST_INVENTORY": "재고 보정",
}
_STATUS_LABEL = {
    "SUCCESS": "실행 완료", "POLICY_BLOCKED": "자동실행 보류", "FAILED": "실행 실패",
    "SKIPPED_DUPLICATE": "중복으로 생략", "PENDING": "대기", "READY": "실행 준비", "RUNNING": "실행 중",
}


def _ctx(a: dict) -> dict:
    """LLM/템플릿 공통 컨텍스트(민감/장황 필드 제거, 핵심만)."""
    def j(key):
        try:
            return json.loads(a.get(key) or "null")
        except Exception:
            return None
    return {
        "에이전트": a.get("agent_name"),
        "동작": a.get("action_type"),
        "대상": f"{a.get('target_type')}:{a.get('target_id')}",
        "상태": a.get("status"),
        "대상정보": j("payload_json"),
        "정책결과": j("policy_result_json"),
        "사전검증": j("precheck_result_json"),
        "실행결과": j("execution_result_json"),
        "근거": a.get("reason"),
        "오류": a.get("error_message"),
    }


def template(a: dict) -> str:
    """LLM 없이도 항상 동작하는 결정적 설명."""
    at = _TYPE_LABEL.get(a.get("action_type"), a.get("action_type") or "동작")
    st = _STATUS_LABEL.get(a.get("status"), a.get("status") or "")
    agent = a.get("agent_name") or "시스템"
    tgt = a.get("target_id") or "-"
    reason = a.get("reason") or ""
    if a.get("status") == "SUCCESS":
        body = f"{agent}가 대상 {tgt}에 대해 '{at}'을(를) 자동으로 수행해 {st}했습니다."
    elif a.get("status") == "POLICY_BLOCKED":
        body = f"{agent}의 '{at}'은(는) 정책/시뮬 판단으로 {st}되었습니다."
    elif a.get("status") == "FAILED":
        body = f"{agent}의 '{at}'이(가) {st}했습니다."
    elif a.get("status") == "SKIPPED_DUPLICATE":
        body = f"동일 작업이 이미 존재하여 '{at}'을(를) {st}했습니다."
    else:
        body = f"{agent}의 '{at}' — 현재 {st}."
    return f"{body} 근거: {reason}" if reason else body


def _llm(a: dict) -> str:
    import llm
    sys = ("너는 창고 자동운영(WMS) 시스템의 설명 담당이다. 주어진 자동 의사결정 1건을 "
           "운영자에게 한국어 1~2문장으로 간결히 설명하라. 어떤 에이전트가 무엇을, 왜(정책·사전검증·근거), "
           "어떤 결과로 처리했는지 포함하되 JSON·코드·영문 필드명은 노출하지 말고 자연스러운 업무 문장으로 써라.")
    user = "다음 의사결정을 설명해줘:\n" + json.dumps(_ctx(a), ensure_ascii=False, indent=2)
    resp = llm.complete([{"role": "system", "content": sys}, {"role": "user", "content": user}],
                        node="Explanation")
    text = (resp.choices[0].message.content or "").strip()
    if not text:
        raise ValueError("빈 응답")
    return text


def generate(a: dict, use_llm: bool = True) -> tuple[str, str]:
    """(설명, source) — source는 'llm' 또는 'template'."""
    if use_llm:
        try:
            return _llm(a), "llm"
        except Exception:
            pass
    return template(a), "template"


def explain(action_id: str, regenerate: bool = False, use_llm: bool = True) -> dict:
    a = actions.get(action_id)
    if not a:
        return {"error": "not found"}
    if a.get("explanation") and not regenerate:
        return {"action_id": action_id, "explanation": a["explanation"], "source": "cache"}
    text, source = generate(a, use_llm=use_llm)
    actions.update(action_id, explanation=text)
    return {"action_id": action_id, "explanation": text, "source": source}
