"""LangGraph 노드 구현 (docs/02 §5).

Router(LLM) → ParamExtractor(검증) → Planner(규칙) → ToolExecutor(핸들러) →
Verifier(규칙) → RAG Decision/Retriever/Sufficient → ResponseGenerator(LLM) → ApprovalGate.
계산은 Tool이, 설명은 LLM이 담당(docs/02 §8).
"""
import json
from datetime import datetime

from config import settings
from llm import complete
from rag import retriever
from sim import des, forecast, whatif
from tools import allocation, dead_stock, drafts, lookups, picking, replenishment, stocking
from tools.common import q

from agent.state import (RAG_INTENTS, REQUIRED_PARAMS, STATE_CHANGE_INTENTS)


def _json_chat(system: str, user: str, model: str, node: str | None = None) -> dict:
    resp = complete([{"role": "system", "content": system}, {"role": "user", "content": user}],
                    model=model, node=node, response_format={"type": "json_object"})
    try:
        return json.loads(resp.choices[0].message.content)
    except Exception:
        return {}


def _current_dt() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")   # 실제 '지금'(forecast·KPI와 동일 기준)


# ---------- 1. Router (intent + parameters, LLM) ----------
def router_node(state: dict) -> dict:
    system = (
        "당신은 WMS 운영 조수의 라우터입니다. 사용자 질의의 intent와 파라미터를 추출해 JSON으로만 답하세요.\n"
        "intent 정의:\n"
        "- policy_question: 창고 운영 '정책·규칙·SOP·산식'의 근거를 묻는 질문. 예: \"왜 Zone A야?\", "
        "\"왜 ORD001이 1순위야?\", \"소진일은 어떻게 계산해?\". "
        "단, 직전 답변에 나온 값·항목·용어의 '의미'를 되묻는 것은 policy_question이 아니라 smalltalk이다.\n"
        "- stocking_recommendation: 특정 입고건 적치 위치 추천. 예: \"INB003 적치 추천해줘\"\n"
        "- picking_recommendation: 피킹 순서/우선순위 추천. 예: \"오늘 피킹 순서 알려줘\"\n"
        "- inventory_risk: 재고 소진/위험 조회·보고. 특정 SKU면 parameters.sku를 채우고(\"SKU_A001 언제 소진돼?\"), "
        "SKU 없이 '위험재고 보고/전체 위험재고/위험한 재고 알려줘'면 sku 없이 두면 전체 위험 SKU를 스캔 보고한다.\n"
        "- kpi_query: 운영 KPI 조회. 예: \"Zone 점유율 보여줘\", \"출고 정시율 어때?\", \"zone A 점유율\". "
        "parameters.kpis는 반드시 표준키로 넣는다. 매핑: 존 점유율=zone_occupancy, 작업팀 가동률=team_utilization, "
        "출고지연=shipping_delay_count, 적치지연=putaway_delay_count, 포화 존 수=saturated_zone_count, "
        "목표초과 존 수=zone_over_target_count, 피킹 대기시간=picking_wait, 1주내 소진예상=stockout_within_week_count, "
        "품절=out_of_stock_count, 안전재고 미달=safety_stock_below_count, 출고 정시율=on_time_shipping_rate, "
        "결품 예상=expected_shortage_count, 체화재고=dead_stock_count, 보충 필요=replenishment_needed_count, "
        "적치 완료율=stocking_completion_rate, 재고 자산가치=inventory_value. "
        "특정 존을 물으면 parameters.zone_id에 'ZONE_A' 형태로 채운다. "
        "'KPI 말고 다른 지표들/부가정보/보조지표'만의 현황을 물으면 kpi_query로 분류하고 parameters.kpis=['supplementary_all']. "
        "'KPI와 부가지표 다/전체 지표/모든 지표 현황'처럼 둘 다를 물으면 parameters.kpis=['all_metrics']. "
        "이는 daily_summary(처리 대기 업무·할 일)와 다르다.\n"
        "- kpi_advice: KPI(존 점유율·작업팀 가동률·출고지연·적치지연)를 '어떻게 개선/낮춰/높여', '왜 이런지', "
        "'무엇 때문인지', '개선 방법'을 물으면. 현재값이 아니라 원인·개선책을 원하는 질의다. "
        "예: \"zone A 점유율 어떻게 낮춰?\", \"가동률이 왜 100%야?\", \"출고지연 개선 방법\", \"적치지연 줄이려면?\". "
        "parameters.kpis(표준키)와 특정 존이면 zone_id를 채운다. 대상 KPI가 불명확하면 비워 전체 진단.\n"
        "- simulation_query: 창고상황 예측·What-if. 예: \"이번 주 예측\", \"작업자 1명 늘리면?\". "
        "'시뮬레이션 가능한 수정요소/조건/파라미터가 뭐야'처럼 바꿀 수 있는 항목을 물으면 parameters.mode='options'"
        "(시뮬 실행 없이 목록 답변). 실행 지시면 parameters.scenario에 언급된 키만 채운다. 작업자/지게차는 두 방식 구분: "
        "'~로 설정/~명으로/~로 맞춰' 같은 절대값이면 worker_count·forklift_count(정수), "
        "'~명 늘려/증원/줄여' 같은 증감이면 worker_delta·forklift_delta(정수). "
        "그 외 키: demand_multiplier(실수), inbound_delay_days(정수), zone_capa_multiplier({존:배수}). "
        "예: \"작업자수를 4로 설정\" → scenario={\"worker_count\":4}; \"작업자 3명 늘려\" → scenario={\"worker_delta\":3}. "
        "작업자수와 작업팀은 다름(작업팀=작업자//2와 지게차 중 작은 값)이니 사용자가 말한 대상을 그대로 반영한다. "
        "직전에 시뮬레이션 결과(KPI 증감)를 답한 뒤, 사용자가 그 결과에 대해 (a)원인('왜 늘어/줄어/이렇게 나와') 또는 "
        "(b)회상·과거형('아까/방금/이전에 ~ 어떻게 변했었지/얼마였지/어땠어')을 물으면 parameters.mode='explain'로 분류한다. "
        "explain은 시뮬을 재실행하지 않고 직전 대화의 수치를 회상해 답하는 것이다(새 시뮬 실행 아님, 현재상태 kpi_advice도 아님). "
        "'아까 ~ 시뮬 다시 돌려'처럼 명시적 재실행 요청일 때만 scenario로 실제 실행한다.\n"
        "- workload_estimate: 적치·피킹·출고확정의 '완료 예상시간·소요시간·작업량', 가용 작업팀 수, "
        "'오늘 다 끝낼 수 있는지'. 예: \"적치대기 완료 예상시간\", \"피킹 얼마나 걸려\", \"오늘 물량 다 처리 가능?\", "
        "\"가용 작업팀 몇 조야?\". parameters.scope에 영역을 넣는다(stocking|picking|shipping|all). "
        "단, 작업량·완료시간이 아니라 '작업팀/작업자/지게차가 몇 개·몇 명·몇 대인지' 단순 수량만 물으면 "
        "parameters.mode='capacity'로 채운다(예: \"작업팀 수 몇개야\", \"작업자 몇 명이야\").\n"
        "- daily_summary: \"오늘 뭐 해야 돼?\" 류 종합. 특정 영역만 요약/정리 요청도 daily_summary로 분류하고 "
        "parameters.scope에 영역을 넣는다(all|inbound|outbound|picking|risk|shipping). "
        "예: \"입고 업무만 요약\"·\"적치대기만 정리\"→scope=inbound, \"출고만 정리\"→scope=outbound, "
        "\"피킹만\"→scope=picking, \"재고위험만\"→scope=risk. 영역 한정이 없으면 scope=all. "
        "단, 'KPI 외 지표/부가정보/보조지표의 현황'을 물으면 daily_summary가 아니라 kpi_query(supplementary_all)다.\n"
        "- inbound_query / outbound_query / shipping_pending_query: 데이터 '목록'을 그대로 보여달라는 단순 조회"
        "(\"입고예정 보여줘\"). '요약/정리/업무'는 조회가 아니라 daily_summary(scope)로 분류한다.\n"
        "- allocation_query: 고객 출고주문의 할당 현황·결품(주문=고객 출고주문). 예: \"결품 위험 주문 알려줘\", "
        "\"오늘 출고 할당 현황\", \"재고 모자란 주문 있어?\"\n"
        "- order_quantity_query: 부족/위험 SKU를 채우기 위한 '필요 발주량·주문량·보충 수량'(주문=발주/구매를 뜻함). "
        "예: \"위험 SKU 필요 주문량 얼마야\", \"얼마나 발주해야 해\", \"SKU별 보충 필요 수량\", \"주문할 물량\". "
        "특정 SKU를 물으면(\"SKU_A002 필요 주문량 얼마야\") parameters.sku를 채운다(그 SKU만 답). "
        "'주문'이 고객 출고주문 할당이면 allocation_query, 재고를 채우는 발주량이면 order_quantity_query.\n"
        "- order_create: 특정 SKU를 지정 수량만큼 실제로 발주/주문(상태변경 실행). 예: \"SKU_G045 100개 발주해\", "
        "\"SKU_A001 500개 주문해\", \"그거 200개 발주 넣어줘\". parameters.sku 와 parameters.qty(정수)를 채운다. "
        "여러 SKU를 한 번에 지시하면(\"a는 200개, g는 100개 주문해\") parameters.orders=[{\"sku\":..,\"qty\":..}, ...]로 "
        "각 건을 개별로 채운다(직전 답변의 SKU를 'a/g' 등으로 축약하면 그 맥락의 정확한 SKU 코드로 해소). "
        "수량 없이 '얼마나 주문해야 해'만 물으면 order_quantity_query(조회)이고, 수량을 지정해 '발주/주문해'라고 "
        "지시하면 order_create(실행).\n"
        "- allocation_create: 특정 출고 주문에 재고를 즉시 할당(승인 불필요, 피킹지시 시 자동 수행). 예: \"ORD005 할당해줘\"\n"
        "- dead_stock_query: 체화재고(저회전·장기 미출고·유통기한 임박) 조회. 예: \"체화재고 보여줘\", "
        "\"안 나가는 재고 뭐 있어?\", \"유통기한 임박 재고\"\n"
        "- replenishment_query: 피킹 로케이션 보충 필요 조회. 예: \"보충 필요한 거 알려줘\", "
        "\"피킹면 부족한 상품\"\n"
        "- replenish_create: 특정 SKU 피킹면 즉시 보충(승인 불필요, 적치지시 시 자동 수행). 예: \"SKU_A007 보충해줘\"\n"
        "- stocking_task_create / picking_instruction_create / shipping_confirm: 지시 생성·출고확정(상태변경)\n"
        "- risk_response_recommendation: \"부족하면 어떻게 대응?\" SOP 대응\n"
        "- smalltalk: 인사·잡담·자기소개·이름 등 개인정보 진술/질문, '기억해둬'·'방금 뭐라고 했어' 같은 "
        "대화·세션 기억 관련. 또한 직전 답변에 나온 값·항목·용어의 의미를 되묻는 질문(예: \"집중일이 뭐야\", "
        "\"그 날짜 뭐야\", \"방금 그 수치 무슨 뜻이야\", \"거기서 urgent가 뭐야\")도 smalltalk으로 분류하고 "
        "이전 대화 맥락으로 설명한다. 예: \"안녕 내 이름은 정선웅이야\", \"내 이름 뭐야?\", "
        "\"1번 오더 초긴급이야 기억해둬\", \"고마워\"\n"
        "- out_of_scope: WMS·창고 운영과 전혀 무관한 일반 지식/시사/날씨 등 사실 질문(예: \"오늘 날씨\"). "
        "단, 사용자 이름·개인정보·이전 발화 기억 요청은 out_of_scope가 아니라 smalltalk이다.\n"
        "규칙: 질의에 '왜', '이유', '어떻게 계산'이 있으면 policy_question 을 우선한다. "
        "단, KPI(점유율·가동률·출고지연·적치지연)의 개선·원인('왜 높아','어떻게 낮춰','개선 방법')은 "
        "policy_question이 아니라 kpi_advice로 분류한다. "
        "단, '뭐야/무슨 뜻이야'처럼 직전 답변·데이터 항목의 의미를 되묻는 것은 policy_question이 아니라 smalltalk이다. "
        "인사·감사·이름·기억 요청은 smalltalk(업무 목록을 나열하지 말 것).\n"
        "이전 대화가 제공되면 대명사·생략(그 주문, 거기, 그거 등)을 직전 맥락으로 해소해 "
        "parameters(order_no·sku 등)를 채운다.\n"
        "parameters 키(있을 때만): sku, inbound_no, order_no, location_id, zone_id, target_date, kpis, scenario, scope, qty, orders, mode. "
        "zone_id는 'ZONE_A'처럼 채운다.\n"
        '형식: {"intent":..,"confidence":0~1,"parameters":{..}}'
    )
    hist = state.get("history") or []
    prefix = ""
    if hist:
        lines = "\n".join(f"{'사용자' if h['role'] == 'user' else '조수'}: {str(h['content'])[:240]}"
                          for h in hist[-10:])
        prefix = f"[이전 대화]\n{lines}\n\n[현재 질문]\n"
    j = _json_chat(system, prefix + state["user_query"], settings.openai_router_model, node="Router")
    return {"intent": j.get("intent"), "intent_confidence": j.get("confidence"),
            "parameters": j.get("parameters", {}) or {}}


# ---------- 2. Parameter Extractor (필수값 검증) ----------
def param_extractor_node(state: dict) -> dict:
    intent = state.get("intent")
    params = state.get("parameters", {})
    if intent == "order_create":   # orders=[{sku,qty}..] 다건 지시면 단일 sku/qty 미검증
        orders = params.get("orders")
        if isinstance(orders, list) and any(
                isinstance(o, dict) and o.get("sku") and o.get("qty") for o in orders):
            return {"missing_parameters": []}
    req = REQUIRED_PARAMS.get(intent, [])
    missing = [p for p in req if not params.get(p)]
    return {"missing_parameters": missing}


# ---------- 3. Planner (규칙 기반) ----------
def planner_node(state: dict) -> dict:
    return {"plan": [state.get("intent") or "unknown"]}


# ---------- 4. Tool Executor (인텐트 핸들러) ----------
def _h_daily_summary(p):
    """오늘 할 일 종합 — 승인 액션 4종에 맞춘 4개 대기 버킷으로 답한다.

    ① 출고지시 대기(출고확정 승인) ② 피킹지시 대기(피킹지시 승인) ③ 적치지시 대기(적치지시 승인)
    ④ 주문 필요·부족재고(발주 승인). scope: all|shipping/outbound|picking|inbound|risk/order."""
    scope = p.get("scope") or "all"
    out = {"_scope": scope,
           "_format": "반드시 '출고지시 대기 / 피킹지시 대기 / 적치지시 대기 / 주문 필요(부족재고)' 4개 버킷으로 구분해 "
                      "각 건수와 핵심 목록을 제시할 것"}

    # ① 출고지시 대기 = 피킹 완료·출고확정 대기(주문 상태 SHIPPING_PENDING). 블랙보드 중단으로 남은 건도 포함.
    if scope in ("all", "shipping", "outbound"):
        rows = q("SELECT order_no FROM outbound_orders WHERE status='SHIPPING_PENDING' ORDER BY order_no")
        out["shipping_wait"] = {"label": "출고지시 대기(출고확정 승인 필요)", "count": len(rows),
                                "orders": [r["order_no"] for r in rows[:15]]}

    # ② 피킹지시 대기 = 접수(PLANNED) 주문. 피킹지시 승인이 필요한 건.
    if scope in ("all", "picking", "outbound"):
        planned = q("SELECT COUNT(*) n FROM outbound_orders WHERE status='PLANNED'")[0]["n"]
        prio = picking.recommend_picking(_current_dt(), forecast.risk_level_map())["recommendations"][:5]
        out["picking_wait"] = {"label": "피킹지시 대기(피킹지시 승인 필요)", "count": planned, "priority_top": prio}

    # ③ 적치지시 대기 = 입고완료(RECEIVED) 미적치. 적치지시 승인이 필요한 건.
    if scope in ("all", "inbound"):
        summ = stocking.summarize_backlog()      # 총계·날짜별·중복SKU (집계 수치 근거)
        waits = sorted(lookups.lookup_inbound_orders(["RECEIVED"])["orders"],
                       key=lambda o: (o.get("expected_date") or "", o.get("inbound_no") or ""))
        out["stocking_wait"] = {"label": "적치지시 대기(적치지시 승인 필요)", "count": summ["total_count"],
                                "summary": summ, "oldest_top": waits[:10]}
        if scope == "inbound":
            out["inbound_planned"] = lookups.lookup_inbound_orders(["PLANNED"])["orders"]

    # ④ 주문 필요(부족재고) = 미처리 출고+안전재고 대비 가용 부족분. 발주 승인이 필요한 건.
    if scope in ("all", "risk", "order"):
        rq = forecast.required_order_quantities(limit=15)
        out["order_needed"] = {"label": "주문 필요(부족재고 → 발주 승인 필요)", "count": rq["count"],
                               "total_required_qty": rq["total_required_qty"], "items": rq["items"]}
    return out


def _h_stocking_reco(p):
    return {"recommendation": stocking.recommend_stocking(p["inbound_no"])}


def _h_inventory_risk(p):
    sku = p.get("sku")
    if not sku:   # SKU 미지정 — '위험재고 보고' 류: 전체 위험 SKU 스캔 보고
        risks = forecast.scan_inventory_risk(["HIGH", "MEDIUM", "WATCH"])["risks"]
        return {"scope": "risk", "inventory_risk_count": len(risks), "inventory_risk": risks[:15]}
    skus = sku if isinstance(sku, list) else [sku]
    items = [{"sku": forecast._normalize_sku(s) or s,
              "forecast": forecast.inventory_forecast(forecast._normalize_sku(s) or s),
              "risk": forecast.calculate_inventory_risk(forecast._normalize_sku(s) or s)} for s in skus]
    if len(items) == 1:   # 단일 SKU는 기존 형태 유지
        return {"forecast": items[0]["forecast"], "risk": items[0]["risk"]}
    return {"items": items}


def _h_picking_reco(p):
    return {"recommendations": picking.recommend_picking(_current_dt(), forecast.risk_level_map())["recommendations"][:10]}


# KPI 탭 4종(핵심) + KPI 대시보드에 실제 표시되는 부가정보 카드 5종
_CORE_KPIS = ["zone_occupancy", "team_utilization", "shipping_delay_count", "putaway_delay_count"]
_SUPPLEMENTARY_KPIS = ["picking_wait", "zone_over_target_count", "out_of_stock_count",
                       "stockout_within_week_count", "inventory_value"]


def _kpi_targets() -> dict:
    """지표별 목표치(값 조회에 동봉해 초과/미달 판정 근거로). 목표 없는 지표는 None(참고 지표)."""
    from tools import dashboard_settings
    t = dashboard_settings.get_all()
    return {"zone_occupancy": float(t.get("kpi_target_zone_occupancy", 0.80)),
            "team_utilization": float(t.get("kpi_target_utilization", 0.90)),
            "shipping_delay_count": 0, "putaway_delay_count": 0,
            "out_of_stock_count": 0, "zone_over_target_count": 0,
            "stockout_within_week_count": 0, "picking_wait": 1800,   # 초(≤30분)
            "inventory_value": None}


def _h_kpi(p):
    raw = p.get("kpis") or _CORE_KPIS
    raw = raw if isinstance(raw, list) else [raw]
    joined = " ".join(str(x) for x in raw).lower()
    both = "all_metrics" in joined or ("kpi" in joined and ("부가" in joined or "보조" in joined))
    supp_only = (not both) and ("supplementary" in joined or "부가" in joined or "보조" in joined)

    zone_hint = p.get("zone_id") or p.get("zone")
    if both:
        res = lookups.query_operation_kpis(_CORE_KPIS + _SUPPLEMENTARY_KPIS)
        res["_note"] = "KPI 탭 핵심 4종 + 부가정보 5종 현황"
    elif supp_only:
        res = lookups.query_operation_kpis(_SUPPLEMENTARY_KPIS)
        res["_note"] = "KPI 탭 4종 외 부가정보 5종 현황"
    else:
        names = []
        for k in raw:                # 자유문/비표준명을 표준 KPI키로 정규화
            ks = str(k).lower()
            if "zone" in ks or "존" in ks or "점유" in ks:
                canon = "zone_occupancy"
                zone_hint = zone_hint or k
            elif "가동" in ks or "utilization" in ks or "workforce" in ks or "작업부하" in ks:
                canon = "team_utilization"
            elif ("출고" in ks and "지연" in ks) or "shipping" in ks or "정시" in ks:
                canon = "shipping_delay_count"
            elif "적치" in ks or "putaway" in ks or "stocking_delay" in ks:
                canon = "putaway_delay_count"
            else:
                canon = str(k)
            if canon not in names:
                names.append(canon)
        res = lookups.query_operation_kpis(names or ["zone_occupancy"], zone_id=zone_hint)
    res["targets"] = _kpi_targets()   # 모든 경로에 목표치 동봉
    return res


def _h_kpi_advice(p):
    from tools import dashboard_settings, kpi_advisor
    ks = p.get("kpis")
    kpi = str(ks[0]) if isinstance(ks, list) and ks else (str(ks) if ks else None)
    return kpi_advisor.diagnose(kpi=kpi or p.get("kpi"), zone_id=p.get("zone_id"),
                                targets=dashboard_settings.get_all())


# 시뮬 KPI 요약 대상(카드와 동일 핵심 4종) — (kpi_name, 라벨, 배수, 단위)
_SIM_CORE_KPIS = [("zone_occupancy", "Zone 점유율", 100, "%"),
                  ("resource_utilization_team", "작업팀 가동률", 100, "%"),
                  ("shipping_delay_count", "출고지연", 1, "건"),
                  ("putaway_delay_count", "적치지연", 1, "건")]


def _sim_kpi_values(res):
    out = []
    for name, label, scale, unit in _SIM_CORE_KPIS:
        k = next((x for x in res["kpis"] if x["kpi_name"] == name), {})
        v = k.get("mean")
        out.append({"kpi": label, "value": round(v * scale, 1) if v is not None else None, "unit": unit})
    return out


def _h_simulation(p):
    import resmgmt
    if p.get("mode") == "options":   # 시뮬 실행 없이 수정 가능 요소 안내
        r = resmgmt.get_resources()
        return {"simulation_options": {
                    "worker_delta": "작업자 증감(명) — 예: +3",
                    "forklift_delta": "지게차 증감(대)",
                    "demand_multiplier": "수요 배수 — 예: 1.3(30% 증가)",
                    "inbound_delay_days": "입고 지연(일)",
                    "zone_capa_multiplier": "존 용량 배수 — 예: {\"ZONE_A\": 0.8}",
                    "horizon_days": "시뮬레이션 기간(기본 7일)",
                    "replications": "반복 횟수(기본 10회)"},
                "current_resources": {"작업자": r["worker"], "지게차": r["forklift"],
                                      "팀": max(0, min(r["worker"] // 2, r["forklift"]))},
                "note": "팀 = 작업자2 + 지게차1. 증감 실행 예: '작업자 3명 늘려서 시뮬레이션 돌려줘'"}

    if p.get("mode") == "explain":   # 직전 시뮬 결과의 KPI 증감 원인 설명(재실행 없음)
        return {"simulation_model_facts": {
                    "팀 배정": "입고(적치)·출고(피킹)가 같은 팀 풀을 선착순(FIFO)으로 공유. 우선순위 없음. 팀=작업자2+지게차1.",
                    "출고지연": "마감이 도래한 출고 중 정시 출고 못한 건수(늦게 완료 + horizon 내 미처리 모두 포함). 팀↑→처리가 빨라져 정시가 늘고 지연 감소.",
                    "적치지연": "입고 당일 적치를 못 끝낸 건수. 적치 물량은 출고보다 작아, 여유 용량이 생기면 쉽게 0에 수렴.",
                    "피킹 대기시간": "주문이 팀을 얻기까지의 큐 대기. 팀↑→병목 완화로 급감.",
                    "가동률": "대기 물량이 팀 용량을 넘으면 100%(포화). 팀↑→여유가 생겨 하락.",
                    "한계": "백로그가 팀 용량을 여전히 초과하면 팀을 늘려도 마감 넘긴 주문이 남을 수 있음(완전 해소는 아님)."},
                "note": "직전 시뮬 결과(대화 맥락)의 실제 수치와 함께 각 KPI가 왜 오르내렸는지 설명할 것"}

    sc = p.get("scenario")
    if sc:
        r = resmgmt.get_resources()
        cw, cf, ct = des._apply_counts({}, r["worker"], r["forklift"])      # 현재 자원
        nw, nf, nt = des._apply_counts(sc, r["worker"], r["forklift"])      # 시나리오 적용 후
        base = des.run_des_simulation(horizon_days=7, replications=10, persist=False)  # 비교용(저장 baseline 유지)
        scen = whatif.simulate_operation_what_if(sc, horizon_days=7, replications=10)  # What-if은 저장(시뮬 탭 비교 가능)
        cmp = whatif.compare_simulation_scenarios(base, scen)["comparison"]
        rows = []
        for name, label, scale, unit in _SIM_CORE_KPIS:   # KPI 기준 증감(현재기준→What-if)
            row = next((c for c in cmp if c["kpi_name"] == name and c.get("baseline_mean") is not None), None)
            if row:
                rows.append({"kpi": label, "unit": unit,
                             "현재기준": round(row["baseline_mean"] * scale, 1),
                             "whatif": round(row["scenario_mean"] * scale, 1),
                             "증감": round(row["delta_mean"] * scale, 1)})
        return {"run_conditions": {"현재": {"작업자": cw, "지게차": cf, "작업팀": ct},
                                   "적용": {"작업자": nw, "지게차": nf, "작업팀": nt}},
                "kpi_comparison": rows, "whatif_version": scen.get("version_name"),
                "note": "시뮬레이션 탭 '비교 What-if'에서 이 버전을 선택하면 일별 추이로도 볼 수 있음"}

    base = des.run_des_simulation(horizon_days=7, replications=10, persist=False)
    return {"kpi_current_forecast": _sim_kpi_values(base),
            "note": "현재 자원 기준 7일 시뮬레이션의 KPI 예측(핵심 4종)"}


def _h_inbound_query(p):
    return lookups.lookup_inbound_orders(p.get("status") or ["PLANNED", "RECEIVED"], p.get("target_date"))


def _h_outbound_query(p):
    return lookups.lookup_outbound_orders(["PLANNED", "ALLOCATED"], p.get("target_date"))


def _h_shipping_pending(p):
    return lookups.lookup_shipping_pending()


def _h_risk_response(p):
    return {"risks": forecast.scan_inventory_risk(["HIGH", "MEDIUM"])["risks"]}


def _h_stocking_create(p):
    return {"draft": drafts.create_stocking_task_draft(p["inbound_no"], p["location_id"])}


def _h_picking_create(p):
    d = drafts.create_picking_instruction_draft(p["order_no"])
    return {"draft": d, "dry_run": drafts.dry_run_action(d["draft_id"]) if "draft_id" in d else None}


def _h_shipping_confirm(p):
    return {"draft": drafts.create_shipping_confirm_draft(p["order_no"])}


def _h_allocation_query(p):
    return allocation.scan_allocation(p.get("target_date"))


def _h_allocation_create(p):
    return {"result": allocation.apply_allocation(p["order_no"])}   # 승인 없이 즉시 할당(피킹 시 자동으로도 수행)


def _h_dead_stock_query(p):
    return dead_stock.scan_dead_stock(p.get("grades"))


def _h_replenishment_query(p):
    return replenishment.scan_replenishment()


def _h_workload_estimate(p):
    from tools import workload
    if p.get("mode") == "capacity":   # 단순 팀/작업자/지게차 수 질문 — 작업량 리포트 대신 팀 수만
        cap = workload.team_capacity()
        return {"team_capacity": cap,
                "note": "팀 = 작업자2 + 지게차1. 남는 작업자·지게차는 조 편성 불가."}
    return workload.estimate_workload(scope=p.get("scope") or "all", current_datetime=_current_dt())


def _h_order_quantity(p):
    return forecast.required_order_quantities(sku=p.get("sku"), limit=20)


def _h_order_create(p):
    """단건/다건 발주. orders=[{sku,qty}..] 또는 단일 sku+qty → SKU별 개별 Draft를 생성."""
    raw = p.get("orders")
    if not isinstance(raw, list) or not raw:
        raw = [{"sku": p.get("sku"), "qty": p.get("qty")}]
    out, seen = [], set()
    for it in raw:
        if not isinstance(it, dict):
            continue
        sku_in, qty = it.get("sku"), it.get("qty")
        norm = forecast._normalize_sku(sku_in)
        key = norm or f"?{sku_in}"
        if key in seen:                       # 같은 SKU 중복 지시는 1건만
            continue
        seen.add(key)
        if not norm:
            out.append({"error": f"{sku_in} — SKU를 찾을 수 없습니다", "input_sku": sku_in})
            continue
        out.append(drafts.create_purchase_order_draft(norm, qty))
    return {"drafts": out}


def _h_replenish_create(p):
    return {"result": replenishment.execute_for_sku(p["sku"])}   # 승인 없이 즉시 보충(적치 시 자동으로도 수행)


_HANDLERS = {
    "daily_summary": _h_daily_summary, "stocking_recommendation": _h_stocking_reco,
    "inventory_risk": _h_inventory_risk, "picking_recommendation": _h_picking_reco,
    "kpi_query": _h_kpi, "kpi_advice": _h_kpi_advice, "simulation_query": _h_simulation, "inbound_query": _h_inbound_query,
    "outbound_query": _h_outbound_query, "shipping_pending_query": _h_shipping_pending,
    "allocation_query": _h_allocation_query, "allocation_create": _h_allocation_create,
    "dead_stock_query": _h_dead_stock_query,
    "replenishment_query": _h_replenishment_query, "replenish_create": _h_replenish_create,
    "risk_response_recommendation": _h_risk_response, "stocking_task_create": _h_stocking_create,
    "picking_instruction_create": _h_picking_create, "shipping_confirm": _h_shipping_confirm,
    "workload_estimate": _h_workload_estimate, "order_quantity_query": _h_order_quantity,
    "order_create": _h_order_create,
    "policy_question": lambda p: {}, "smalltalk": lambda p: {},
    "greeting": lambda p: {}, "out_of_scope": lambda p: {},
}

# 대화/인사/세션 기억용 페르소나 — Tool 없이 history를 활용해 응답
_CONVERSATION_PERSONA = (
    "당신은 'WOONG AI', 창고 운영 Copilot입니다. 간결한 존댓말, 이모지·과장 금지.\n"
    "recent_dialogue(이전 대화)를 적극 활용해 사용자가 말한 이름·선호·지시('기억해둬' 등)를 "
    "그 세션 동안 기억하고 반영합니다.\n"
    "사용자가 이름을 알려주면 기억하고, 이름을 물으면 이전 대화에서 찾아 답합니다. 모르면 모른다고 합니다.\n"
    "단순 인사에는 간단히 인사로 답하고, 매번 기능 목록을 나열하지 않습니다.\n"
    "WMS·창고 운영과 무관한 일반 지식/날씨/시사 질문은 정중히 'WMS 운영 관련만 도와드린다'고 안내합니다. "
    "단, 이름·개인정보·이전 발화 기억 요청은 범위 밖이 아니라 정상 응대합니다.\n"
    "직전 대화에 등장한 표현·데이터 항목·용어(예: urgent, 집중일, 우선순위점수, 소진예정일 등)의 의미를 물으면 "
    "일반 사전 정의로 회피하지 말고 그 대화·운영 맥락에서 구체적으로 설명합니다."
)


def tool_executor_node(state: dict) -> dict:
    handler = _HANDLERS.get(state.get("intent"))
    if not handler:
        return {"tool_results": {}, "error": "지원하지 않는 intent"}
    try:
        return {"tool_results": handler(state.get("parameters", {}))}
    except Exception as e:  # noqa: BLE001
        return {"tool_results": {}, "error": f"Tool 실행 오류: {e}"}


# ---------- 5. Verifier (규칙 검증) ----------
def verifier_node(state: dict) -> dict:
    res, tr = {}, state.get("tool_results", {})
    rec = tr.get("recommendation")
    if rec and rec.get("recommended_location_id"):
        bd = rec.get("breakdown", {})
        res["score_in_range"] = all(0 <= bd.get(k, 0) <= 1 for k in bd)
    return {"verification_results": res}


# ---------- 6. RAG Decision / Retriever / Sufficient ----------
def rag_decision_node(state: dict) -> dict:
    return {"rag_required": state.get("intent") in RAG_INTENTS}


def rag_retriever_node(state: dict) -> dict:
    r = retriever.retrieve(state["user_query"], intent=state.get("intent"))
    return {"rag_context": r["evidence"], "rag_context_sufficient": r["answerable"],
            "rag_retry_count": r["retries"],
            "_rag_sufficiency": r.get("sufficiency"),
            "_rag_abstain": r["abstain"], "_rag_abstain_msg": r.get("abstain_message")}


# ---------- 7. Response Generator (LLM, gpt-5.4) ----------
_PERSONA = (
    "당신은 'WOONG AI', 창고 운영 Copilot입니다. 간결한 존댓말로 답합니다.\n"
    "원칙: 결론을 먼저, 그 다음 수치→근거/산식→권장조치 순. 모든 수치는 제공된 Tool 결과를 그대로 인용하고 "
    "임의 생성하지 않습니다('약','아마' 금지). HIGH 위험·출고임박은 첫머리에. 이모지·과장 금지.\n"
    "상태변경(적치/피킹지시·출고확정)은 반드시 '승인이 필요합니다'를 명시합니다.\n"
    "RAG 근거가 부족(abstain)하면 정책을 지어내지 말고 '문서 근거가 부족합니다'라고 답합니다.\n"
    "표현: 영문 필드명·수식 원문(projected_inventory 등)을 그대로 노출하지 말고 평문 한국어로 풀어 설명합니다.\n"
    "재고위험/소진일: 판정 기준은 '오늘(reference_date, 실시간)'입니다. 예상 소진일이 오늘보다 과거이거나 "
    "already_short=true이면, 이는 미처리 출고(backlog)가 누적된 결과이므로 '현재 가용 N개 대비 미처리 출고 M개로, "
    "이미 소진(결품) 상태이거나 소진되었어야 한다'는 식으로 현재 가용·미처리 수량을 들어 구체적으로 설명합니다. "
    "단순히 소진일 날짜만 반복하지 않습니다.\n"
    "KPI 개선(kpi_advice)은 ①현재값·목표 대비 ②원인(제공된 진단 데이터: 기여 SKU·재고일수·도착예정·백로그·팀수 등) "
    "③구체적 개선 레버(recommendations를 그대로 근거로) 순으로, 산수(재고일수·필요 팀수 등)를 포함해 설명합니다. "
    "recommendations에 없는 조치를 지어내지 말고 제공된 수치를 인용합니다. "
    "핵심 4개 KPI는 진단의 recommendations를, 그 외 보조지표는 current(현재값)와 KPI 정책문서(kpi_policy)의 개선 SOP를 근거로 답합니다.\n"
    "작업팀/작업자/지게차 수(team_capacity)를 물으면 작업량 리포트를 붙이지 말고 '현재 작업팀 N개(전체/사용중/가용), "
    "작업자 X명·지게차 Y대'를 바로 간결히 답합니다(팀=작업자2+지게차1).\n"
    "시뮬레이션 What-if 결과는 먼저 run_conditions로 기동 조건을 명시합니다"
    "(예: '작업자 4명·지게차 2대 = 작업팀 2개로 시뮬레이션을 실행했습니다. 현재는 작업자3·지게차2=팀1'). "
    "작업자수·지게차·작업팀은 각각 다른 개념(작업팀=작업자//2와 지게차 중 작은 값)이니 혼동하지 말고 구분해 씁니다. "
    "그 다음 kpi_comparison을 반드시 마크다운 표로 출력합니다(열: KPI | 현재기준 | What-if | 증감). "
    "끝에 whatif_version과 note(시뮬레이션 탭에서 일별 추이 확인)를 안내합니다. "
    "시뮬 원인 설명(simulation_model_facts)이 오면, 직전 대화의 시뮬 수치(증감)와 이 모델 사실을 결합해 "
    "각 KPI가 왜 늘고 줄었는지 인과로 설명합니다(팀 배정은 FIFO·우선순위 없음, 적치지연 감소는 용량효과·작은 물량 때문, "
    "백로그가 용량 초과면 완전 해소 안 됨 등). 현재상태 진단으로 흐르지 말고 직전 시뮬 결과에 한정해 답합니다. "
    "사용자가 특정 KPI(예: 적치지연)를 지목해 회상을 물으면 그 KPI의 값·증감을 결론 첫머리에 먼저 답하고 다른 KPI로 흐르지 않습니다. "
    "단, 회상 대상 시뮬레이션 결과(해당 조건·KPI 수치)가 이전 대화에 없으면 지어내지 말고 "
    "'직전 대화에서 해당 시뮬레이션 결과를 찾지 못했습니다. 지금 그 조건으로 시뮬레이션을 기동할까요?'라고 되묻습니다.\n"
    "KPI/부가지표 값 조회(kpi_query)는 '현재값 + 목표치 + 초과/미달'만 간결히 제시합니다(각 지표를 나열). "
    "묻지 않은 개선책·권고·경고 SOP·원인 분석은 덧붙이지 않습니다(개선은 사용자가 '어떻게 개선?'을 물을 때 kpi_advice가 답함). "
    "targets 값이 None인 지표(재고금액 등)는 '고정 목표 없는 참고 지표'로 표기하고 초과/미달을 단정하지 않습니다. "
    "kpi_query에서는 '권장조치' 섹션을 아예 만들지 않고 값·목표·초과/미달 나열로 끝냅니다(위 결론→수치 순 규칙보다 이 지침을 우선).\n"
    "오늘 할 일(daily_summary)은 반드시 4개 대기 버킷으로 구분해 각 건수와 핵심 목록을 제시합니다: "
    "①출고지시 대기(출고확정 승인) ②피킹지시 대기(피킹지시 승인) ③적치지시 대기(적치지시 승인) "
    "④주문 필요·부족재고(발주 승인). 각 버킷은 해당 승인 액션과 연결해 안내합니다.\n"
    "피킹 권장 시작: start_now=true(마감 지남/임박)면 과거 시각을 쓰지 말고 'start_guidance'(예: 즉시 시작(마감 지남))를 "
    "그대로 안내하고, minutes_overdue가 크면 '마감 N분 지남'을 함께 알립니다.\n"
    "도착 예정 입고: 위험/부족 SKU에 incoming_qty>0이면 반드시 별도로 '현재는 부족하지만 도착예정 N개"
    "(가장 이른 도착 incoming_eta)가 있어, 반영 시 순가용은 net_with_incoming' 식으로 함께 안내합니다. "
    "covered_by_incoming=true면 '도착예정 수량으로 부족분이 해소될 전망'이라고, "
    "shortfall_after_incoming>0이면 '도착예정을 반영해도 아직 그만큼 부족'이라고 구분해 설명합니다.\n"
    "recent_dialogue가 있으면 직전 맥락과 자연스럽게 이어지도록 답합니다(반복 인사·재설명 금지)."
)


def response_generator_node(state: dict) -> dict:
    intent = state.get("intent")
    if state.get("missing_parameters"):
        return {"final_response": f"다음 정보가 필요합니다: {', '.join(state['missing_parameters'])}"}
    if state.get("_rag_abstain") and intent == "policy_question":
        return {"final_response": state.get("_rag_abstain_msg") or "문서 근거가 부족합니다."}
    # 대화·인사·세션 기억: Tool 없이 history를 활용해 응답
    if intent in ("smalltalk", "greeting", "out_of_scope"):
        ctx = {"intent": intent, "user_query": state.get("user_query"),
               "recent_dialogue": (state.get("history") or [])[-8:]}
        user = ("아래 이전 대화(recent_dialogue)를 참고해 현재 질문(user_query)에 자연스럽게 답하세요. "
                "JSON 아님, 자연어.\n" + json.dumps(ctx, ensure_ascii=False, default=str)[:4000])
        resp = complete([{"role": "system", "content": _CONVERSATION_PERSONA},
                         {"role": "user", "content": user}],
                        model=settings.openai_chat_model, node="Response Generator")
        return {"final_response": resp.choices[0].message.content}
    tr = state.get("tool_results", {}) or {}
    dialogue = (state.get("history") or [])[-12:]     # 멀티턴 회상용(직전 시뮬 결과 등)
    scope = tr.get("_scope")
    scope_note = ""
    if state.get("intent") == "daily_summary" and scope and scope != "all":
        labels = {"inbound": "입고/적치대기", "outbound": "출고예정", "picking": "피킹",
                  "risk": "재고위험", "shipping": "출고확정대기"}
        scope_note = (f"[요약 범위] 이번 답변은 '{labels.get(scope, scope)}' 영역만 다루세요. "
                      "그 외 영역(피킹·출고·재고위험 등)은 언급하지 마세요.\n")
    # 대화는 상단에 전용 예산으로 항상 포함(잘려나가지 않게), Tool/RAG는 그 다음
    dlg_json = json.dumps(dialogue, ensure_ascii=False, default=str)[:6000]
    core_json = json.dumps({"intent": state.get("intent"), "tool_results": tr,
                            "rag_evidence": state.get("rag_context", [])},
                           ensure_ascii=False, default=str)[:7000]
    user = (scope_note + "아래 [이전 대화]와 [Tool/RAG]를 바탕으로 답하세요. JSON 아님, 자연어. "
            "이전 대화에 이미 나온 수치(예: 직전 시뮬레이션 결과의 특정 KPI 값·증감)를 물으면 그 값을 그대로 회상해 인용하고, "
            "질문한 대상 KPI를 정확히 골라 답합니다.\n[이전 대화]\n" + dlg_json + "\n[Tool/RAG]\n" + core_json)
    resp = complete([{"role": "system", "content": _PERSONA}, {"role": "user", "content": user}],
                    model=settings.openai_chat_model, node="Response Generator")
    return {"final_response": resp.choices[0].message.content}


# ---------- 8. Approval Gate ----------
def approval_gate_node(state: dict) -> dict:
    if state.get("intent") in STATE_CHANGE_INTENTS:
        tr = state.get("tool_results", {}) or {}
        lst = tr.get("drafts")                # 다건(order_create) 우선, 없으면 단건 draft
        if not isinstance(lst, list):
            d = tr.get("draft", {})
            lst = [d] if d else []
        valid = [d for d in lst if isinstance(d, dict) and d.get("draft_id")]
        return {"approval_required": bool(valid), "draft_actions": valid}
    return {"approval_required": False}
