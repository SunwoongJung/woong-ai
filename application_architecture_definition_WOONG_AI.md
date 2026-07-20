# Application Architecture Definition

> 이 문서는 애플리케이션의 소스 코드, 설정 파일, 인프라 구성 및 실행 흐름을 분석하여 작성한다.  
> 확인되지 않은 내용은 임의로 단정하지 않고 `미확인`, `추정`, `확인 필요`로 명시한다.

---

# 0. Document Information

| 항목 | 내용 |
|---|---|
| Application Name | `WOONG AI` — Warehouse Ops Orchestration & Navigation Governance AI |
| Repository / Project Path | `C:\workingdirectory\woong_ai` (`app/`이 실행 애플리케이션 루트) |
| Document Version | `1.0` |
| Analysis Date | `2026-07-14` |
| Analyzed Commit / Branch | `90b2cc477e009f077ed116dc2b2101da9f400f95` / `main`; 분석 시점 working tree에 수정·미추적 파일 존재 |
| Runtime Environment | `Local / POC` 확인. Development, Staging, Production 환경은 미확인 |
| Primary Language | Python 3.11.9, JavaScript(브라우저 SPA), SQL(SQLite DDL) |
| Main Framework | FastAPI 0.138.2, LangGraph 1.2.7, SimPy 4.1.2 |
| Deployment Type | 로컬 Python 프로세스 확인. VM/Docker/Kubernetes/Serverless 배포 정의는 없음 |
| Confidence Level | `Medium-High` — 논리·실행·데이터 구조는 코드에서 확인, 운영 배포·보안·외부 게이트웨이 정책은 미확인 |

---

# 1. Executive Summary

## 1.1 Application Purpose

WOONG AI는 창고 운영자가 자연어로 재고, 입고, 출고, 적치, 피킹, KPI 및 운영 위험을 질의하고, 계산 결과와 정책 근거를 함께 확인하며, 필요한 상태 변경을 승인 가능한 Draft로 실행하도록 지원하는 WMS 운영 Copilot이다. 단순 조회뿐 아니라 수요예측, SimPy 기반 이산사건 시뮬레이션(DES), What-if 비교, RAG 기반 정책·SOP 설명, 실시간 가상 입출고 발생, Blackboard 기반 자동운영까지 하나의 애플리케이션에 포함한다.

핵심 설계 원칙은 LLM이 업무 수치를 직접 계산하지 않고 Router·설명 역할을 수행하며, 실제 조회·계산·상태 변경은 Python Tool과 SQLite 트랜잭션이 담당하도록 책임을 분리하는 것이다. 사용자 주도 상태 변경은 `Draft → Dry Run → Approval → Execution`을 거치고, 자동운영은 별도의 Policy Check, Pre-check, 논리 Lock, 트랜잭션 실행, Post-check 및 Audit Log를 거친다.

## 1.2 Primary Users

| 사용자 또는 시스템 | 사용 목적 | 접근 방식 |
|---|---|---|
| 창고 운영자 | 오늘 할 일, 입출고, 재고 위험, KPI 질의 및 적치·피킹·출고 Draft 승인 | 동일 Origin Web SPA, REST, SSE |
| 창고 관리자 | 자원 수, KPI 목표, 시뮬레이션, 자동운영 설정과 실행 이력 확인 | Web SPA, REST |
| 개발·평가 담당자 | Agent Trace, RAG 근거, 토큰, 결정성·품질 평가 확인 | Trace API, `python -m eval.run` |
| 시스템/데모 운영자 | 실시간 가상 입출고 생성 및 Blackboard Auto Mode 기동 | Web SPA, REST/SSE |
| 외부 호출자 | 공개된 FastAPI Endpoint 직접 호출 | REST; 인증은 구현되어 있지 않음 |

## 1.3 Core Capabilities

| ID | 기능 | 설명 |
|---|---|---|
| CAP-001 | 자연어 창고 운영 질의 | 26개 Intent로 질문을 분류하고 Tool, RAG, 응답 생성 흐름을 실행 |
| CAP-002 | 운영 조회·추천 | 입출고, 재고, 적치 위치, 피킹 순서, 할당, 체화재고, 보충, KPI 조회 |
| CAP-003 | 수요예측·재고위험 | Linear Regression 또는 이동평균 fallback으로 수요와 예상 소진 위험 산출 |
| CAP-004 | DES 및 What-if | 인력·지게차·Zone CAPA·수요 조건을 반영한 확률적 KPI(P50/P90 등) 산출 |
| CAP-005 | Agentic RAG | FAISS 검색, PRISM식 LLM rerank, 충분성 판정, 최대 2회 재검색, abstain |
| CAP-006 | 승인 기반 상태 변경 | 적치·피킹·출고확정·발주 Draft 생성, Dry Run, 승인/거절, 실행 |
| CAP-007 | Blackboard 자동운영 | 이벤트 수집, 6개 도메인 Agent 제안, 우선순위, Simulation/Policy Gate, Lock, 실행 |
| CAP-008 | 실시간 데모 이벤트 | 가상 입고·출고를 SQLite와 Blackboard에 저장하고 SSE로 UI에 알림 |
| CAP-009 | 관측성과 평가 | Agent 단계, RAG 충분성, 토큰, Blackboard 감사, 실행 순서 및 60개 평가 Check 기록 |

## 1.4 Architecture Summary

브라우저용 Vanilla JavaScript SPA가 FastAPI 애플리케이션과 동일 Origin REST/SSE로 통신한다. FastAPI는 정적 파일을 제공하면서 Chat, Session, WMS 조회, KPI, Simulation, Approval, Realtime, Trace 및 `/api` Blackboard Endpoint를 노출한다. Chat 요청은 LangGraph의 `Router → Parameter Extractor → Planner → Tool Executor → Verifier → RAG Decision → Retriever(조건부) → Response Generator → Approval Gate` 순서로 처리된다. Router, RAG rerank/충분성 판정, 최종 응답은 회사 Azure OpenAI 호환 Gateway 또는 표준 OpenAI Client를 통해 외부 모델을 호출한다. 업무 계산은 `tools/`, Forecast와 DES는 `sim/`, 정책 검색은 `rag/`가 담당한다. 운영 데이터, 세션, Draft, Simulation 결과, Trace, Blackboard 이벤트·Action·Lock·Audit는 하나의 로컬 SQLite 파일에 저장된다. RAG 문서는 저장소의 Markdown 7개이며, 임베딩과 메타데이터는 로컬 FAISS Index와 JSON 파일에 저장된다. 실시간 수요와 Auto Mode는 각각 프로세스 내부 asyncio Task와 daemon Thread를 사용하므로 단일 프로세스 POC에는 적합하지만 다중 Replica 상태 공유는 지원하지 않는다.

---

# 2. Scope and Boundaries

## 2.1 Included Scope

- `app/api/main.py`의 FastAPI와 동일 Origin SPA
- `app/agent/` LangGraph 기반 Chat Agent
- `app/tools/` WMS 조회·추천·Draft·KPI Tool
- `app/rag/` 및 저장소 루트 `rag/`의 정책 검색 파이프라인
- `app/sim/` Forecast, DES, What-if, Simulation Version
- `app/bb/` Blackboard 이벤트·Agent·Control Loop·Policy·Lock·Executor
- SQLite Schema, Seed, Session, Trace, Audit, Evaluation Harness
- 로컬 실행 및 외부 OpenAI/Azure OpenAI 호환 Gateway 연결
- 보조/레거시 Streamlit UI의 존재와 직접 모듈 호출 구조

## 2.2 Excluded Scope

- 실제 WMS/ERP/OMS/TMS 외부 연동: 구현 없음
- 실제 SSO, IAM, 인증 서버와 사용자·조직 Master: 구현 및 정의 없음
- Production VM, Container, Kubernetes, Reverse Proxy, TLS 종료, DNS, 방화벽: 배포 파일 없음
- 회사 LLM Gateway 내부 구성, SLA, Retry, 보존 정책: 저장소 외부로 미확인
- 실제 현장 센서, 바코드, 작업자 단말, 설비 연결: 구현 없음
- UI 이미지·CSS의 시각적 품질 및 전체 사용자 시나리오 검수: 아키텍처 분석 범위에서 제외

## 2.3 System Boundary

| 구분 | 대상 |
|---|---|
| 내부 구성요소 | Web SPA, FastAPI, LangGraph Agent, Tool Engine, RAG, Forecast/DES, Draft/Approval, Blackboard Auto Mode, Realtime Generator, Session/Trace, SQLite/FAISS 접근 코드 |
| 외부 구성요소 | Azure OpenAI 호환 사내 Gateway 또는 OpenAI API; 사용자의 Browser |
| 사용자 접점 | `/` SPA, REST API, SSE `/chat/stream`, SSE `/events`, 선택적 Streamlit UI, 평가·Seed CLI |

---

# 3. Technology Stack

## 3.1 Application Stack

분석 환경의 설치 버전과 `requirements.txt`의 최소 요구 버전을 함께 기록한다.

| 영역 | 기술 | 버전 | 사용 목적 | 근거 |
|---|---|---:|---|---|
| Language | Python | 3.11.9 | API, Agent, Tool, Simulation, DB | `.venv` runtime 확인 |
| API Framework | FastAPI / Uvicorn | 0.138.2 / 0.49.0 | REST, SSE, 정적 SPA 제공 | `app/api/main.py`, `requirements.txt` |
| Validation | Pydantic / pydantic-settings | 2.13.4 / 2.14.2 | 요청 DTO, `.env` 설정 로딩 | `app/api/main.py`, `app/config.py` |
| Agent Workflow | LangGraph | 1.2.7 | 상태 기반 조건 분기 Workflow | `app/agent/graph.py` |
| LLM SDK | OpenAI Python SDK | 2.44.0 | Chat Completion, Embedding, Azure 호환 Client | `app/llm.py` |
| LLM | `gpt-5.4`, `gpt-4.1-mini` 기본값 | Deployment 명 기준 | 응답/추론, Router/Rerank/Judge | `app/config.py` |
| Embedding | `text-embedding-3-small` | 모델 명 | RAG 문서·질의 Embedding | `app/config.py`, `app/rag/index.py` |
| Database | SQLite | Python stdlib 연동 | WMS, Session, Draft, Simulation, Trace, Blackboard 저장 | `app/db/database.py`, Schema |
| Vector DB | FAISS `IndexFlatIP` | faiss-cpu 1.14.3 | 정규화 내적 기반 Local Vector Search | `app/rag/index.py` |
| Simulation | SimPy / NumPy / scikit-learn | 4.1.2 / 2.4.6 / 1.9.0 | DES, 확률 표본, Linear Regression | `app/sim/` |
| Frontend | Vanilla JavaScript, HTML, CSS | Build 없음 | 주 SPA와 REST/SSE 통신 | `app/web/` |
| Optional UI | Streamlit / Plotly | 1.58.0 / 6.8.0 | 직접 Python 모듈을 호출하는 보조 UI | `app/ui/app.py`, `app/ui/charts.py` |
| Test | Custom Harness / pytest dependency | pytest 9.1.1 | 격리 DB 평가와 LLM Judge | `app/eval/`; pytest Test Case는 없음 |
| Message Queue | 없음 | 해당 없음 | 프로세스 내부 asyncio Queue와 SQLite Blackboard Event 사용 | `app/realtime.py`, `app/bb/events.py` |

## 3.2 Infrastructure Stack

| 영역 | 기술 | 용도 | 근거 |
|---|---|---|---|
| Runtime | Local Python Process | FastAPI/Uvicorn 실행 | `app/api/main.py` 주석 |
| Storage | Local Disk | `wms.db`, FAISS Index, Chunk Metadata | `app/config.py` |
| Monitoring | 자체 SQLite Trace/Audit | Agent 단계·토큰·Action 감사 기록 | `app/trace_store.py`, `app/bb/audit.py` |
| CI/CD | 미확인 | Pipeline 정의 없음 | Docker/CI/Kubernetes Manifest 검색 결과 없음 |
| Container | 미확인 | Dockerfile/Compose 없음 | 저장소 검색 결과 없음 |
| Secret Store | Local `.env` | API Key와 Gateway URL 주입 | `app/config.py`, `.gitignore`, `.env.example` |

---

# 4. Repository Structure

## 4.1 Directory Overview

```text
woong_ai/
├─ app/
│  ├─ api/                 # FastAPI 진입점
│  ├─ agent/               # LangGraph, AgentState, Node
│  ├─ tools/               # 업무 조회·계산·추천·Draft
│  ├─ rag/                 # Chunker, FAISS Index, Retriever
│  ├─ sim/                 # Forecast, DES, What-if, Animation, Version
│  ├─ bb/                  # Blackboard Auto Mode와 도메인 Agent
│  │  └─ agents/
│  ├─ db/                  # SQLite 연결과 Schema
│  ├─ seed/                # 결정적 Demo Seed 생성
│  ├─ eval/                # 격리 평가, Harness, LLM Judge
│  ├─ web/                 # 주 HTML/JavaScript/CSS SPA
│  ├─ ui/                  # 선택적 Streamlit UI
│  ├─ config.py            # 환경설정
│  ├─ llm.py               # LLM/Embedding Client
│  ├─ chat_store.py        # Session/Message 영속화
│  ├─ trace_store.py       # Agent Trace와 Token 계측
│  └─ realtime.py          # 가상 실시간 입출고와 SSE
├─ docs/                    # PRD와 설계·평가 문서
├─ rag/                     # RAG 대상 정책/SOP Markdown 7종
├─ package.json             # 발표자료 생성용 Node 의존성; App Runtime과 무관
└─ application_architecture_*.md
```

## 4.2 Directory Responsibilities

| 경로 | 역할 | 주요 파일 |
|---|---|---|
| `app/api` | HTTP 진입, DTO, SPA 제공 | `main.py` |
| `app/agent` | Chat Workflow와 Intent/State | `graph.py`, `nodes.py`, `state.py` |
| `app/tools` | 결정적 업무 기능 | `lookups.py`, `stocking.py`, `picking.py`, `drafts.py`, `kpi_*.py` 등 |
| `app/rag` | 정책 청킹, Index, 검색·충분성 | `chunker.py`, `index.py`, `retriever.py` |
| `rag` | 검색 원문 | 7개 Markdown 정책·SOP·용어 문서 |
| `app/sim` | Forecast, DES, What-if, 시각화 데이터 | `forecast.py`, `des.py`, `whatif.py`, `animation.py`, `versions.py` |
| `app/bb` | 자동운영 Event/Action/Policy/Lock/Execution | `control_loop.py`, `executor.py`, `simulation_agent.py`, `zone_scheduler.py` |
| `app/db` | Connection과 DDL | `database.py`, `schema.sql` |
| `app/web` | 주 사용자 UI | `index.html`, `static/app.js`, `static/styles.css` |
| `app/eval` | 60 Check 평가와 Latency Benchmark | `run.py`, `harness.py`, `judge.py` |
| `docs` | 설계 의도와 평가 결과 | `01_PRD.md` ~ `13_VISUALIZATION_DESIGN.md` |

## 4.3 Application Entry Points

| 실행 유형 | 진입점 | 실행 명령 또는 호출 방식 | 근거 |
|---|---|---|---|
| Web/API | `api.main:app` | `uvicorn api.main:app --reload` (Port는 명시하지 않아 Uvicorn 설정에 따름) | `app/api/main.py` |
| Optional UI | `ui/app.py` | `streamlit run ui/app.py` | `app/ui/app.py` |
| Agent CLI | `agent/graph.py` | `python -m agent.graph "질문"` | `app/agent/graph.py` |
| Seed | `seed/generate.py` | `python -m seed.generate` | `app/seed/generate.py` |
| RAG Index | `rag/index.py` | `python -m rag.index` | `app/rag/index.py` |
| DES CLI | `sim/des.py` | `python -m sim.des [replications]` | `app/sim/des.py` |
| Evaluation | `eval/run.py` | `python -m eval.run` | `app/eval/run.py` |
| Worker/Scheduler | 별도 프로세스 없음 | `/api/auto-mode/loop/start`가 FastAPI 프로세스 내부 daemon Thread 시작 | `app/bb/control_loop.py`, `app/bb/routes.py` |

---

# 5. System Context

## 5.1 Actors and External Systems

| ID | 유형 | 이름 | 역할 | 애플리케이션과의 관계 |
|---|---|---|---|---|
| ACT-001 | User | 창고 운영자 | 운영 질의, Draft 승인/거절, KPI·시뮬 확인 | Browser에서 WOONG AI 사용 |
| ACT-002 | User | 관리자/데모 운영자 | 자원·Auto Mode·Realtime 설정 | 보호되지 않은 관리 API 호출 |
| ACT-003 | User | 개발·평가 담당자 | Seed, Index, 평가 Harness, Trace 점검 | CLI와 Trace UI 사용 |
| EXT-001 | External System | Azure OpenAI 호환 사내 Gateway 또는 OpenAI API | Chat Completion과 Embedding 제공 | `openai_base_url` 유무에 따라 Client 선택 |
| EXT-002 | External System | 실제 WMS/ERP/OMS | 미구현 | 설계 문서상 향후 범위이며 현재 연결 없음 |

## 5.2 Context Relationships

| From | To | 방향 | 목적 | 프로토콜 | 데이터 |
|---|---|---|---|---|---|
| ACT-001/002 | CMP-001 | 양방향 | 운영 UI 사용 | Browser HTTP(S), 실제 TLS 미확인 | 질문, 설정, 승인, 조회 결과 |
| CMP-001 | CMP-002 | 양방향 | REST 요청과 SSE 수신 | HTTP/JSON, `text/event-stream` | DTO, Agent 단계, 실시간 이벤트 |
| CMP-002/CMP-003/CMP-005 | EXT-001 | 양방향 | Router, 응답, Rerank, 충분성, Embedding | OpenAI SDK over HTTP(S) | Prompt, 문서 근거, Embedding |
| CMP-002~CMP-011 | DS-001 | 양방향 | 업무·세션·Trace·자동운영 저장 | SQLite File API | SQL Row, JSON Text |
| CMP-005 | DS-002/DS-003 | 단방향 Read | 정책 후보 검색 | Local File/FAISS | Embedding Vector, Chunk Metadata |

## 5.3 System Context Diagram Definition

```yaml
diagram:
  id: system-context
  title: WOONG AI System Context
  direction: left-to-right

actors:
  - id: ACT-001
    name: Warehouse Operator
    description: 운영 질의와 상태 변경 승인
  - id: ACT-002
    name: Administrator
    description: 자원·시뮬레이션·자동운영 설정

systems:
  - id: SYS-001
    name: WOONG AI
    type: internal
    description: Agentic WMS Operations Copilot
  - id: EXT-001
    name: OpenAI-compatible LLM Gateway
    type: external
    description: Chat Completion and Embedding

relationships:
  - from: ACT-001
    to: SYS-001
    label: 질문, 조회, Draft 승인
    protocol: HTTP(S)/REST/SSE
  - from: ACT-002
    to: SYS-001
    label: 설정, Simulation, Auto Mode
    protocol: HTTP(S)/REST
  - from: SYS-001
    to: EXT-001
    label: Prompt and Embedding Request
    protocol: OpenAI SDK over HTTP(S)
```

---

# 6. Logical Architecture

## 6.1 Architecture Layers

| Layer ID | 계층 | 책임 | 주요 구성요소 |
|---|---|---|---|
| LAYER-01 | Client Layer | 사용자 상호작용과 시각화 | CMP-001 SPA, CMP-012 Streamlit UI |
| LAYER-02 | API Layer | REST/SSE, DTO, 정적 파일, HTTP 오류 | CMP-002 FastAPI Server |
| LAYER-03 | Application Layer | 세션, Agent Workflow, 승인, 실시간 수요 | CMP-003, CMP-007, CMP-009, CMP-010 |
| LAYER-04 | Domain / Agent Layer | 업무 계산, RAG, Simulation, 자동운영 | CMP-004, CMP-005, CMP-006, CMP-008 |
| LAYER-05 | Data Layer | SQLite/FAISS/Markdown 접근 | CMP-011, DS-001, DS-002, DS-003 |
| LAYER-06 | External Integration | 외부 LLM과 Embedding | EXT-001, `app/llm.py` |

## 6.2 Component Inventory

| Component ID | 이름 | 계층 | 유형 | 책임 | 입력 | 출력 | 근거 |
|---|---|---|---|---|---|---|---|
| CMP-001 | Web SPA | Client | Frontend | Chat, KPI, Simulation, Approval, Trace, Auto Mode UI | 사용자 입력, REST/SSE | JSON 요청, 렌더링 | `app/web/` |
| CMP-002 | FastAPI Server | API | API Server | HTTP Endpoint, DTO, SPA 제공 | HTTP/JSON | JSON/SSE/File | `app/api/main.py`, `app/bb/routes.py` |
| CMP-003 | LangGraph Agent Orchestrator | Application | Workflow/Agent | 질의 분류부터 승인 게이트까지 상태 흐름 | `AgentState` 입력 | 최종 State | `app/agent/` |
| CMP-004 | WMS Tool Engine | Domain | Domain Service | 조회·추천·Forecast 보조·KPI·업무 계산 | Intent Parameter | 결정적 Dict | `app/tools/` |
| CMP-005 | Agentic RAG Pipeline | Domain | Retrieval Service | Chunk Search, rerank, 충분성, retry, abstain | Query, Intent | Evidence/판정 | `app/rag/` |
| CMP-006 | Forecast & Simulation Engine | Domain | Simulation Service | 수요 Forecast, DES, What-if, Version 저장 | SKU/Scenario/자원 | KPI 분포·Timeline | `app/sim/` |
| CMP-007 | Draft & Approval Service | Application | Domain Service | Draft, Dry Run, 승인/거절, 상태 변경 | Draft 요청/승인 | 실행 결과 | `app/tools/drafts.py` |
| CMP-008 | Blackboard Auto Operation | Domain | Scheduler/Agent/Executor | Event→Agent 제안→Gate/Lock→Action 실행 | Blackboard Event | 상태 변경·Audit | `app/bb/` |
| CMP-009 | Realtime Demand Service | Application | Scheduler/Event | 가상 입출고 생성 및 SSE Broadcast | 설정/Timer | DB Row, BB Event, SSE | `app/realtime.py` |
| CMP-010 | Session & Trace Service | Application | State/Observability | 대화 영속화, 최근 History, Token/단계 Trace | Chat State | Session/Trace Row | `app/chat_store.py`, `app/trace_store.py` |
| CMP-011 | Data Access Layer | Data | Repository/DB | SQLite Connection과 SQL 실행 | SQL/Parameter | Row/Commit | `app/db/database.py`, `tools/common.py` |
| CMP-012 | Legacy Streamlit UI | Client | Frontend | Python 모듈 직접 호출형 보조 UI | 사용자 입력 | Streamlit/Plotly UI | `app/ui/app.py` |

## 6.3 Component Details

### CMP-001 — Web SPA

| 항목 | 내용 |
|---|---|
| Responsibility | 7개 주요 화면, Chat Streaming, Realtime SSE, 데이터 Polling, Draft 승인, Auto Mode 조작 |
| Source Location | `app/web/index.html`, `app/web/static/app.js`, `styles.css` |
| Entry Method | Browser `GET /` |
| Input | 사용자 Form, Button, Query |
| Output | REST JSON, SSE 구독, DOM/Chart 렌더 |
| Dependencies | CMP-002 |
| State Change | Browser 메모리 상태; 서버 상태는 API 호출로 변경 |
| External Calls | 없음; 동일 Origin API만 호출 |
| Timeout | `fetch()` 명시 Timeout 없음 |
| Retry | 대부분 `.catch()`로 실패 흡수; 명시 Retry 없음 |
| Error Handling | 일부 호출은 null/빈 객체 fallback; 사용자 오류 표시는 기능별 상이 |
| Observability | Browser Console 수준; 서버 Trace 화면 제공 |
| Confidence | Confirmed |

#### Processing Logic

1. `/`에서 HTML/CSS/JS를 로드한다.
2. `fetch()`로 KPI, 데이터, Simulation, Session, Draft, Trace를 조회한다.
3. Chat은 `/chat/stream`, 실시간 알림은 `/events`를 사용한다.
4. UI의 기본 User ID는 `operator01`로 고정되어 있으며 인증된 Identity가 아니다.

#### Evidence

- `app/web/static/app.js`: `fetch()`, `EventSource()`, Chat/Approval/Auto Mode Handler
- `app/web/index.html`: 화면 Tab과 User 표시

### CMP-002 — FastAPI Server

| 항목 | 내용 |
|---|---|
| Responsibility | 49개 Root API Route와 `/api` Blackboard Route, SSE, Static Serving |
| Source Location | `app/api/main.py`, `app/bb/routes.py` |
| Entry Method | `app = FastAPI(...)`, `uvicorn api.main:app --reload` |
| Input | Pydantic DTO, Query/Path Parameter |
| Output | JSON, SSE, `FileResponse` |
| Dependencies | CMP-003~CMP-011 |
| State Change | Import 시 Schema 초기화와 Timestamp Trigger 보장; API별 DB/Task 변경 |
| External Calls | Agent 실행을 통해 EXT-001 호출 |
| Timeout | 애플리케이션 수준 HTTP Timeout 미확인 |
| Retry | 없음 |
| Error Handling | 일부 404 `HTTPException`; 다수 내부 함수의 오류 Dict 또는 예외가 그대로 전달될 수 있음 |
| Observability | Agent Trace 및 Blackboard Audit; 일반 Access Log는 Uvicorn 기본 동작에 의존 |
| Confidence | Confirmed |

#### Processing Logic

1. Module Import 시 Blackboard Router를 포함한다.
2. `init_db()`와 `ensure_row_timestamps()`를 실행한다.
3. REST/SSE 요청을 동기 함수 또는 async Generator로 Domain Component에 위임한다.
4. 마지막에 SPA와 Static Asset Route를 Mount한다.

#### Evidence

- `app/api/main.py`: `app`, `include_router`, `init_db`, Endpoint
- `app/bb/routes.py`: `APIRouter(prefix="/api")`

### CMP-003 — LangGraph Agent Orchestrator

| 항목 | 내용 |
|---|---|
| Responsibility | Intent, Parameter, Tool, 검증, RAG, 응답, 승인 상태 흐름 |
| Source Location | `app/agent/graph.py`, `nodes.py`, `state.py` |
| Entry Method | `agent.graph.run()`, `stream_run()` |
| Input | `user_query`, `user_id`, 최근 History |
| Output | 누적 `AgentState` |
| Dependencies | CMP-004, CMP-005, CMP-006, CMP-007, CMP-010, EXT-001 |
| State Change | 요청 State는 메모리; Tool이 Draft/DB를 변경 가능 |
| External Calls | Router와 Response가 EXT-001 호출 |
| Timeout | 미확인 |
| Retry | Graph 수준 Retry 없음 |
| Error Handling | Tool Executor는 Exception을 `error` 문자열로 변환; LLM Exception은 상위로 전파 |
| Observability | Thread-local Token/세부 Event, 종료 후 SQLite Trace |
| Confidence | Confirmed |

#### Processing Logic

1. 경량 LLM Router가 Intent와 Parameter를 JSON으로 반환한다.
2. 필수 Parameter가 없으면 Response Generator로 분기해 되묻는다.
3. Planner는 현재 Intent 하나를 Plan으로 기록한다.
4. Handler Registry가 Tool을 실행하고 Verifier가 제한된 규칙을 확인한다.
5. RAG Intent만 CMP-005를 거친다.
6. 메인 LLM이 Tool/RAG/History에 근거해 답변한다.
7. 상태변경 Intent의 유효 Draft를 Approval Gate가 노출한다.

#### Evidence

- `app/agent/graph.py`: `build_graph()`, `run()`, `stream_run()`
- `app/agent/nodes.py`: `router_node()` ~ `approval_gate_node()`
- `app/agent/state.py`: `INTENTS`, `RAG_INTENTS`, `STATE_CHANGE_INTENTS`

### CMP-004 — WMS Tool Engine

| 항목 | 내용 |
|---|---|
| Responsibility | WMS 조회, 적치/피킹 점수, 할당, 체화재고, 보충, KPI, 작업량 계산 |
| Source Location | `app/tools/` |
| Entry Method | Agent `_HANDLERS`, FastAPI Endpoint, 직접 Python 호출 |
| Input | 업무 Parameter와 DB 상태 |
| Output | Dict/List 결과, 일부 상태 변경 |
| Dependencies | CMP-011, CMP-006, CMP-007 |
| State Change | 조회 Tool은 없음; Allocation/Replenishment/Draft 등은 DB 변경 |
| External Calls | 없음 |
| Timeout | SQLite 10초 Connection Timeout, Busy Timeout 8초 |
| Retry | Tool 공통 Retry 없음 |
| Error Handling | `run_tool()`은 실패 Log 후 재발생; Agent Handler는 예외를 Error State로 변환 |
| Observability | `tool_logs` 지원. 단 Chat Agent Handler는 대부분 `run_tool()` Wrapper를 사용하지 않음 |
| Confidence | Confirmed |

#### Processing Logic

1. Parameter를 정규화하고 SQLite에서 업무 데이터를 읽는다.
2. Python 규칙과 산식으로 추천·KPI·위험을 계산한다.
3. 상태 변경 기능은 자체 트랜잭션 또는 CMP-007을 사용한다.

#### Evidence

- `app/tools/common.py`: `q()`, `run_tool()`
- `app/tools/stocking.py`, `picking.py`, `allocation.py`, `replenishment.py`

### CMP-005 — Agentic RAG Pipeline

| 항목 | 내용 |
|---|---|
| Responsibility | 정책 Chunk 검색, LLM rerank, 충분성 판단, Query 보강, 근거/abstain 반환 |
| Source Location | `app/rag/chunker.py`, `index.py`, `retriever.py` |
| Entry Method | `retriever.retrieve(query, intent, k=5)` |
| Input | 사용자 Query, Intent |
| Output | 상위 Evidence 3건, Sufficiency, Retry Count, Abstain |
| Dependencies | DS-002, DS-003, EXT-001, CMP-010 |
| State Change | Process-local FAISS Cache; Trace Event 발생 |
| External Calls | Query Embedding, 각 Attempt의 rerank와 충분성 LLM 호출 |
| Timeout | 미확인 |
| Retry | 최대 2회 재검색, 즉 최대 3 Attempt |
| Error Handling | JSON Parse 실패 시 빈 Dict → 낮은 점수/answerable false; Index/File/LLM 예외는 상위 전파 |
| Observability | `trace_store.emit()`로 search/rerank/sufficiency/retry/abstain 발생 |
| Confidence | Confirmed |

#### Processing Logic

1. Markdown를 `##` Heading 단위로 Chunk하고 Intent Metadata를 부여한다.
2. FAISS `IndexFlatIP`에서 `k*3` 후보를 조회하고 Intent로 Filter한다.
3. 경량 LLM이 relevance, contribution, evidence span을 반환한다.
4. 별도 LLM이 충분성을 판정한다.
5. 부족하면 Missing Evidence Type을 Query에 붙여 최대 2회 재검색한다.
6. 최종 부족 시 정책 질문은 근거 없이 abstain한다.

#### Evidence

- `app/rag/retriever.py`: `MAX_RETRIES`, `retrieve()`
- `app/rag/index.py`: `build_index()`, `search()`
- `app/rag/chunker.py`: `FILE_META`, `SECTION_MAP`

### CMP-006 — Forecast & Simulation Engine

| 항목 | 내용 |
|---|---|
| Responsibility | Demand Forecast, 재고위험, DES, What-if 비교, 결과 Version 저장 |
| Source Location | `app/sim/` |
| Entry Method | `inventory_forecast()`, `run_des_simulation()`, `simulate_operation_what_if()` |
| Input | WMS DB, Horizon, Near Days, Replications, Scenario |
| Output | KPI, Inventory Projection, Events, Movement, Version |
| Dependencies | CMP-011, DS-001 |
| State Change | Simulation Run/KPI/Event 저장; Baseline 저장 시 이전 Baseline 제거 |
| External Calls | 없음 |
| Timeout | 없음; 동기 연산 |
| Retry | 없음 |
| Error Handling | 직접 API는 예외 전파; Blackboard Simulation Agent는 예외를 Cache에 기록하고 fail-open |
| Observability | Simulation Version과 KPI/Event DB 저장 |
| Confidence | Confirmed |

#### Processing Logic

1. 30일 이상은 Linear Regression, 14/7일은 이동평균, 7일 미만은 예측 불가로 처리한다.
2. 확정 입출고와 Far Future 가상 수요를 DES Event로 구성한다.
3. 기본 200회 반복하여 출고지연, 비용, 대기, 자원가동률, Zone 점유, 소진일을 집계한다.
4. What-if는 Baseline과 Scenario KPI Key를 맞춰 Delta를 생성한다.

#### Evidence

- `app/sim/forecast.py`: `fit_demand()`, `inventory_forecast()`
- `app/sim/des.py`: `run_des_simulation()`, `_persist()`
- `app/sim/whatif.py`: `compare_simulation_scenarios()`

### CMP-007 — Draft & Approval Service

| 항목 | 내용 |
|---|---|
| Responsibility | STOCKING/PICKING/SHIPPING/ORDER Draft, Dry Run, 승인/거절, 실행 |
| Source Location | `app/tools/drafts.py` |
| Entry Method | `create_*_draft()`, `approve_action()` |
| Input | 업무 식별자, 승인 Boolean, `user_id` |
| Output | Draft/변경 예상/실행 결과 |
| Dependencies | CMP-004, CMP-011 |
| State Change | `action_drafts`, WMS Order/Task/Inventory 변경 |
| External Calls | 없음 |
| Timeout | SQLite 설정 외 없음 |
| Retry | 없음 |
| Error Handling | 다수 Validation은 Error Dict. 승인과 실행 전체를 묶는 단일 Transaction은 없음 |
| Observability | Draft Timestamp와 Status; 승인 사용자 ID는 별도 저장하지 않음 |
| Confidence | Confirmed |

#### Processing Logic

1. 대상 존재와 기본 입력을 확인하고 `PENDING_APPROVAL` Draft를 저장한다.
2. Dry Run이 예상 Table/Field 변경과 Warning을 저장한다.
3. 거절이면 `REJECTED`, 승인이면 먼저 `APPROVED`로 저장한다.
4. Action Type별 실행 함수를 호출하고 성공 후 `EXECUTED`로 저장한다.

#### Evidence

- `app/tools/drafts.py`: `dry_run_action()`, `approve_action()`, `issue_*()`, `confirm_shipping()`
- `app/db/schema.sql`: `action_drafts`

### CMP-008 — Blackboard Auto Operation

| 항목 | 내용 |
|---|---|
| Responsibility | DB Event 소비, Agent 제안, Priority Sort, Simulation/Policy Gate, Lock, 실행·검증·감사 |
| Source Location | `app/bb/` |
| Entry Method | `control_loop.run_once()`, `start()` |
| Input | `blackboard_events`, System Setting, WMS 상태 |
| Output | `blackboard_actions`, 업무 상태 변경, Audit/Execution Log |
| Dependencies | CMP-004, CMP-006, CMP-011 |
| State Change | Event/Action/Lock/Reservation/Order/Task 등 다수 |
| External Calls | Action 설명 생성 시 EXT-001 선택 사용 |
| Timeout | Lock TTL 60초; 주기 기본 15초 |
| Retry | Lock 경합 시 PENDING 유지 후 다음 Cycle 재시도; 명시 최대 횟수 없음 |
| Error Handling | Policy/Pre/Post Check; Transaction Rollback; Simulation 오류는 fail-open |
| Observability | Audit Phase, Dispatch Score, Route, Cycle Action 순서 Log |
| Confidence | Confirmed |

#### Processing Logic

1. Auto Mode와 Simulation Cache를 확인하고 첫 Cache Warm-up 전에는 Event를 보존한다.
2. ZoneScheduler가 완료→시작→팀배정 순으로 진행한다.
3. Event를 Agent Registry에 전달하고 제안 Action을 `base + priority_score`로 정렬한다.
4. Simulation Gate와 Policy Check를 통과한 Action에 Lock을 획득한다.
5. Handler를 Transaction 안에서 실행하고 Post-check 후 Commit한다.
6. 실패는 Rollback하고 Audit와 Action Status에 기록한다.

#### Evidence

- `app/bb/control_loop.py`: `run_once()`
- `app/bb/executor.py`: `execute()`
- `app/bb/policy.py`, `locks.py`, `simulation_agent.py`

### CMP-009 — Realtime Demand Service

| 항목 | 내용 |
|---|---|
| Responsibility | 주기적으로 가상 입고/출고 생성, Blackboard Event 적재, SSE Broadcast |
| Source Location | `app/realtime.py` |
| Entry Method | `start()`, `emit_once()`, `/events` |
| Input | Interval, Outbound Ratio, Quantity Range |
| Output | WMS DB Row, Blackboard Event, SSE Message |
| Dependencies | CMP-002, CMP-008, CMP-011 |
| State Change | Process-local `_state`, `_task`, Subscriber Set 및 DB |
| External Calls | 없음 |
| Timeout | 없음; Interval 최소 2초 |
| Retry | Loop 오류는 Error SSE 후 다음 Interval에서 계속 |
| Error Handling | DB 성공 후 Blackboard 적재 실패는 광범위 Exception으로 무시 |
| Observability | UI SSE와 Count; 별도 구조화 Log 없음 |
| Confidence | Confirmed |

### CMP-010 — Session & Trace Service

| 항목 | 내용 |
|---|---|
| Responsibility | Session/Message 저장, 최근 12개 Message 주입, Agent Trace/Token 저장 |
| Source Location | `app/chat_store.py`, `app/trace_store.py` |
| Entry Method | `/chat`, `/chat/stream`, `/sessions`, `/traces` |
| Input | Query, Response, State, Token Usage |
| Output | Session/History/Trace Row |
| Dependencies | CMP-011 |
| State Change | SQLite와 Thread-local Trace Sink/Token Counter |
| External Calls | 없음 |
| Timeout/Retry | SQLite 설정 외 없음 |
| Error Handling | DB 예외 전파; 세부 Trace Event Sink 오류는 무시 |
| Observability | 자체가 관측성 저장소 역할 |
| Confidence | Confirmed |

### CMP-011 — Data Access Layer

| 항목 | 내용 |
|---|---|
| Responsibility | Connection 생성, FK 활성화, Busy Timeout, Schema 초기화, Query Helper |
| Source Location | `app/db/database.py`, `app/tools/common.py` |
| Entry Method | `get_connection()`, `init_db()`, `q()` |
| Input | SQL, Parameter |
| Output | `sqlite3.Row`, Commit/Rollback |
| Dependencies | DS-001 |
| State Change | 모든 DB 변경 |
| External Calls | 없음 |
| Timeout | Connection 10초, `busy_timeout=8000ms` |
| Retry | SQLite 내부 Busy 대기 외 애플리케이션 Retry 없음 |
| Error Handling | `finally`에서 Connection Close, 호출자가 Transaction 처리 |
| Observability | SQL별 공통 Trace 없음 |
| Confidence | Confirmed |

### CMP-012 — Legacy Streamlit UI

| 항목 | 내용 |
|---|---|
| Responsibility | Agent Chat, KPI, Simulation, Approval의 보조 UI |
| Source Location | `app/ui/app.py` |
| Entry Method | `streamlit run ui/app.py` |
| Input/Output | Streamlit Widget / Plotly |
| Dependencies | CMP-003, CMP-004, CMP-006, CMP-007 직접 Import |
| State Change | `st.session_state`, Tool 직접 호출에 따른 DB 변경 |
| External Calls | Agent 경유 LLM 호출 |
| Timeout/Retry | 미확인 |
| Error Handling | Streamlit 기본 동작에 의존 |
| Observability | 주 SPA의 Session/Trace 저장 경로를 우회함 |
| Confidence | Confirmed |

## 6.4 Component Relationships

| From Component | To Component | 호출 방식 | 동기 여부 | 전달 데이터 | 조건 | 근거 |
|---|---|---|---|---|---|---|
| CMP-001 | CMP-002 | REST/SSE | Sync/Async | JSON, SSE | 사용자 동작 | `web/static/app.js` |
| CMP-002 | CMP-003 | `run()/stream_run()` | Sync/Thread | Query, User, History | Chat 요청 | `api/main.py` |
| CMP-003 | CMP-004 | Handler Registry | Sync | Intent Parameter | 대부분 업무 Intent | `agent/nodes.py` |
| CMP-003 | CMP-005 | `retrieve()` | Sync | Query, Intent | `RAG_INTENTS` |
| CMP-003 | CMP-007 | Draft Handler | Sync | 대상 ID/수량 | 상태변경 Intent |
| CMP-003/CMP-005 | EXT-001 | OpenAI SDK | Sync Network | Prompt/Embedding | LLM/RAG 단계 |
| CMP-004 | CMP-006 | Python 함수 | Sync CPU | SKU/Scenario | Forecast/Simulation 요청 |
| CMP-002 | CMP-009 | asyncio Task/SSE | Async | Realtime Config/Event | start/subscribe |
| CMP-009 | CMP-008 | DB Event Insert | Sync | NEW_INBOUND/OUTBOUND | Event 생성 성공 후 |
| CMP-008 | CMP-006 | Cached DES Gate | Async Refresh + Sync Read | WMS Snapshot | Simulation Required |
| CMP-008 | CMP-011 | Transaction/SQL | Sync | Event/Action/Lock/업무 Row | Auto Mode Cycle |
| CMP-003 | CMP-010 | Trace/Session 함수 | Sync | State, Message, Token | Chat 종료 |
| CMP-004~CMP-010 | CMP-011 | SQL 함수 | Sync | Parameterized SQL | 데이터 접근 |

## 6.5 Logical Architecture Diagram Definition

```yaml
diagram:
  id: logical-architecture
  title: WOONG AI Logical Architecture
  direction: left-to-right

groups:
  - id: client-layer
    name: Client Layer
  - id: api-layer
    name: API Layer
  - id: application-layer
    name: Application and Agent Layer
  - id: domain-layer
    name: Domain Services
  - id: data-layer
    name: Data Layer
  - id: external-layer
    name: External Integration

components:
  - { id: CMP-001, name: Web SPA, group: client-layer, type: frontend }
  - { id: CMP-002, name: FastAPI Server, group: api-layer, type: api }
  - { id: CMP-003, name: LangGraph Agent, group: application-layer, type: workflow }
  - { id: CMP-007, name: Draft and Approval, group: application-layer, type: service }
  - { id: CMP-009, name: Realtime Demand, group: application-layer, type: scheduler }
  - { id: CMP-010, name: Session and Trace, group: application-layer, type: state-manager }
  - { id: CMP-004, name: WMS Tool Engine, group: domain-layer, type: service }
  - { id: CMP-005, name: Agentic RAG, group: domain-layer, type: retrieval }
  - { id: CMP-006, name: Forecast and DES, group: domain-layer, type: simulator }
  - { id: CMP-008, name: Blackboard Auto Operation, group: domain-layer, type: scheduler }
  - { id: CMP-011, name: Data Access Layer, group: data-layer, type: repository }
  - { id: DS-001, name: SQLite, group: data-layer, type: database }
  - { id: DS-002, name: FAISS Index, group: data-layer, type: vector-store }
  - { id: DS-003, name: Policy Markdown, group: data-layer, type: document-store }
  - { id: EXT-001, name: LLM Gateway, group: external-layer, type: external-api }

relationships:
  - { from: CMP-001, to: CMP-002, label: REST and SSE, protocol: HTTP(S), mode: synchronous }
  - { from: CMP-002, to: CMP-003, label: Chat Query, protocol: Python call, mode: synchronous }
  - { from: CMP-003, to: CMP-004, label: Tool invocation, protocol: Python call, mode: synchronous }
  - { from: CMP-003, to: CMP-005, label: Conditional retrieval, protocol: Python call, mode: synchronous }
  - { from: CMP-003, to: CMP-007, label: State-change draft, protocol: Python call, mode: synchronous }
  - { from: CMP-002, to: CMP-009, label: Realtime control, protocol: Python async, mode: asynchronous }
  - { from: CMP-009, to: CMP-008, label: Blackboard event, protocol: SQLite, mode: asynchronous }
  - { from: CMP-004, to: CMP-006, label: Forecast and simulation, protocol: Python call, mode: synchronous }
  - { from: CMP-003, to: EXT-001, label: Router and response, protocol: OpenAI API, mode: synchronous }
  - { from: CMP-005, to: EXT-001, label: Embedding, rerank, sufficiency, protocol: OpenAI API, mode: synchronous }
  - { from: CMP-004, to: CMP-011, label: SQL, protocol: sqlite3, mode: synchronous }
  - { from: CMP-011, to: DS-001, label: CRUD, protocol: SQLite file, mode: synchronous }
  - { from: CMP-005, to: DS-002, label: Vector search, protocol: Local FAISS, mode: synchronous }
  - { from: CMP-005, to: DS-003, label: Index source, protocol: Local file, mode: synchronous }
```

---

# 7. Runtime Processing Flows

## 7.1 Flow Inventory

| Flow ID | 흐름명 | 시작점 | 종료점 | 설명 |
|---|---|---|---|---|
| FLOW-001 | 자연어 Chat 및 RAG | `POST /chat` 또는 `/chat/stream` | 응답·Trace·Message 저장 | Agent Workflow 대표 흐름 |
| FLOW-002 | Draft 승인 및 실행 | 상태변경 질문/직접 Draft API | WMS 상태 변경 또는 거절 | Human-in-the-loop 흐름 |
| FLOW-003 | DES What-if | `POST /simulate` | KPI 비교와 Version 저장 | 확률적 운영 시나리오 분석 |
| FLOW-004 | 실시간 수요와 Auto Mode | Realtime Timer/수동 Emit | 자동 Action 성공/차단/실패 | Event-driven 자동운영 흐름 |

## 7.2 FLOW-001 — 자연어 Chat 및 조건부 RAG

### Trigger

```text
사용자가 SPA에서 질문을 전송하여 POST /chat/stream 또는 POST /chat을 호출한다.
```

### Preconditions

- FastAPI Process가 실행되고 SQLite Schema가 초기화되어 있어야 한다.
- LLM 단계가 필요한 요청에는 유효한 OpenAI Key와 Endpoint가 필요하다.
- RAG Intent에는 FAISS Index와 `chunks.json`이 존재해야 한다.

### Main Flow

| Step | From | To | 처리 내용 | 입력 | 출력 | 동기 여부 |
|---:|---|---|---|---|---|---|
| 1 | ACT-001 | CMP-001 | 질문 입력 | 자연어 | ChatReq | Sync |
| 2 | CMP-001 | CMP-002 | `/chat/stream` 요청 | query/user/session | SSE 연결 | Async |
| 3 | CMP-002 | CMP-010 | Session 생성/최근 History 조회 | session_id | 최근 12 Message | Sync |
| 4 | CMP-002 | CMP-003 | `stream_run()`을 Thread Pool에서 실행 | Query, History | Node Update | Async Wrapper |
| 5 | CMP-003 | EXT-001 | Router JSON 호출 | System Prompt, Query/History | Intent, Parameter | Sync Network |
| 6 | CMP-003 | CMP-004 | Intent Handler 실행 | Parameter | Tool Result | Sync |
| 7 | CMP-003 | CMP-005 | 필요 시 RAG 실행 | Query, Intent | Evidence, Sufficiency | Sync Network/CPU |
| 8 | CMP-003 | EXT-001 | 근거 기반 응답 생성 | History, Tool, Evidence | 자연어 답변 | Sync Network |
| 9 | CMP-003 | CMP-002 | Approval Gate 포함 최종 State | State | `final` Event | Async Queue |
| 10 | CMP-002 | CMP-010 | Trace와 User/Assistant Message 저장 | State, Token | run_id/session_id | Sync |
| 11 | CMP-002 | CMP-001 | `done` SSE 전송 | 응답, 근거, Draft, Error | UI 렌더 | Async |

### Decision Points

| Decision ID | 위치 | 조건 | True 경로 | False 경로 |
|---|---|---|---|---|
| DEC-001 | Parameter Extractor | 필수 Parameter 누락 | 즉시 되묻기 Response | Planner 진행 |
| DEC-002 | RAG Decision | Intent가 `RAG_INTENTS`에 포함 | CMP-005 실행 | Response로 직행 |
| DEC-003 | RAG Retriever | Context가 충분 | Evidence 반환 | 최대 2회 Query 보강 후 abstain |
| DEC-004 | Approval Gate | 상태변경 Intent이고 유효 Draft 존재 | `approval_required=true` | false |

### Alternative Flows

| Alternative ID | 발생 조건 | 처리 |
|---|---|---|
| ALT-001 | `/chat` 사용 | Streaming 없이 Graph `invoke()` 후 단일 JSON 반환 |
| ALT-002 | smalltalk/greeting/out_of_scope | Tool/RAG 없이 최근 History 기반 LLM 응답 |
| ALT-003 | RAG 부족 + KPI Intent | `abstain=true`여도 KPI Tool 값의 보조 근거는 유지 |

### Error Flows

| Error ID | 발생 위치 | 오류 조건 | 처리 방식 | 사용자 영향 |
|---|---|---|---|---|
| ERR-001 | Tool Executor | Handler Exception | `error="Tool 실행 오류"`, 빈 Tool Result | 응답 성공 Flag false 가능 |
| ERR-002 | Worker | Graph/LLM/RAG Exception | SSE `error` Event 전송 | Chat 종료, Message/Trace 저장이 생략될 수 있음 |
| ERR-003 | RAG JSON Parse | LLM이 비정상 JSON 반환 | 빈 판정 → 재검색/abstain 방향 | 근거 부족 응답 가능 |

### Final Result

```text
Session과 Agent Trace가 SQLite에 저장되고, 사용자에게 intent, response, draft_actions,
rag_sources, tool_results, token usage, error가 반환된다.
```

### Sequence Diagram Definition

```yaml
sequence:
  id: FLOW-001
  title: Chat with Conditional RAG
participants:
  - { id: ACT-001, name: Warehouse Operator, type: actor }
  - { id: CMP-001, name: Web SPA, type: component }
  - { id: CMP-002, name: FastAPI Server, type: component }
  - { id: CMP-010, name: Session and Trace, type: component }
  - { id: CMP-003, name: LangGraph Agent, type: component }
  - { id: CMP-004, name: WMS Tool Engine, type: component }
  - { id: CMP-005, name: Agentic RAG, type: component }
  - { id: EXT-001, name: LLM Gateway, type: external }
steps:
  - { order: 1, from: ACT-001, to: CMP-001, message: Natural language query, mode: synchronous }
  - { order: 2, from: CMP-001, to: CMP-002, message: POST /chat/stream, protocol: HTTP/SSE, mode: asynchronous }
  - { order: 3, from: CMP-002, to: CMP-010, message: Load recent history, mode: synchronous }
  - { order: 4, from: CMP-002, to: CMP-003, message: stream_run(query, history), mode: asynchronous }
  - { order: 5, from: CMP-003, to: EXT-001, message: Route intent and parameters, mode: synchronous }
  - { order: 6, from: CMP-003, to: CMP-004, message: Execute intent handler, mode: synchronous }
  - order: 7
    type: alt
    condition: intent in RAG_INTENTS
    true_flow: CMP-003 calls CMP-005; CMP-005 calls EXT-001 for embedding/rerank/sufficiency
    false_flow: proceed directly to response generation
  - { order: 8, from: CMP-003, to: EXT-001, message: Generate grounded response, mode: synchronous }
  - { order: 9, from: CMP-003, to: CMP-002, message: Final AgentState, mode: asynchronous }
  - { order: 10, from: CMP-002, to: CMP-010, message: Save messages and trace, mode: synchronous }
  - { order: 11, from: CMP-002, to: CMP-001, message: done SSE, mode: asynchronous }
```

## 7.3 FLOW-002 — Draft 승인 및 실행

### Trigger

상태변경 Intent 또는 직접 Draft API 호출 후 사용자가 `POST /approve`를 호출한다.

### Preconditions

- 대상 주문/입고/SKU가 존재한다.
- Draft Status가 `PENDING_APPROVAL`이다.

### Main Flow

| Step | From | To | 처리 내용 | 입력 | 출력 | 동기 여부 |
|---:|---|---|---|---|---|---|
| 1 | CMP-003/CMP-002 | CMP-007 | Draft 생성 | 대상 ID/수량 | draft_id | Sync |
| 2 | CMP-007 | DS-001 | `PENDING_APPROVAL` 저장 | payload_json | Draft Row | Sync |
| 3 | CMP-007 | DS-001 | Dry Run 결과 저장 | 변경 예상 | warnings/changes | Sync |
| 4 | ACT-001 | CMP-002 | 승인/거절 | draft_id, approved, user_id | 요청 접수 | Sync |
| 5 | CMP-002 | CMP-007 | `approve_action()` | 승인 값 | Status | Sync |
| 6 | CMP-007 | DS-001 | APPROVED 또는 REJECTED 저장 | status | Row 갱신 | Sync |
| 7 | CMP-007 | DS-001 | Type별 실제 업무 변경 | Draft Payload | Task/Order/Inventory | Sync |
| 8 | CMP-007 | DS-001 | EXECUTED 저장 | Timestamp | 완료 Status | Sync |

### Decision Points

| Decision ID | 위치 | 조건 | True 경로 | False 경로 |
|---|---|---|---|---|
| DEC-201 | Approval | approved=false | REJECTED, 실행 없음 | APPROVED 후 Dispatch |
| DEC-202 | Draft Type | STOCKING/PICKING/SHIPPING/ORDER | Type별 Handler | 미정의 Type은 KeyError 가능 |

### Alternative Flows

| Alternative ID | 발생 조건 | 처리 |
|---|---|---|
| ALT-201 | Allocation/Replenishment | 현재 정책상 승인 없이 직접 실행 가능 |
| ALT-202 | Todo `hold` | Draft를 승인 대기 목록에 유지 |

### Error Flows

| Error ID | 발생 위치 | 오류 조건 | 처리 방식 | 사용자 영향 |
|---|---|---|---|---|
| ERR-201 | Draft Validation | 대상 없음/잘못된 수량 | Error Dict | Draft 미생성 |
| ERR-202 | 승인 후 실행 | Handler Exception | Exception 전파; Draft가 APPROVED에 남을 수 있음 | 수동 확인 필요 |
| ERR-203 | Shipping | 재고 부족 | Shortfall 기록 후 주문을 SHIPPED로 갱신 | 부분 출고 의미 불일치 위험 |

### Final Result

승인된 업무 변경과 Draft 상태가 SQLite에 저장된다. 승인자 `user_id`는 API 입력이지만 Draft Schema에 보존되지 않는다.

### Sequence Diagram Definition

```yaml
sequence:
  id: FLOW-002
  title: Draft Approval and Execution
participants:
  - { id: ACT-001, name: Warehouse Operator, type: actor }
  - { id: CMP-001, name: Web SPA, type: component }
  - { id: CMP-002, name: FastAPI Server, type: component }
  - { id: CMP-007, name: Draft and Approval, type: component }
  - { id: DS-001, name: SQLite, type: database }
steps:
  - { order: 1, from: CMP-002, to: CMP-007, message: Create draft and dry-run, mode: synchronous }
  - { order: 2, from: CMP-007, to: DS-001, message: Save PENDING_APPROVAL, mode: synchronous }
  - { order: 3, from: ACT-001, to: CMP-001, message: Approve or reject, mode: synchronous }
  - { order: 4, from: CMP-001, to: CMP-002, message: POST /approve, protocol: HTTP, mode: synchronous }
  - order: 5
    type: alt
    condition: approved
    true_flow: CMP-007 changes WMS state and marks EXECUTED
    false_flow: CMP-007 marks REJECTED without execution
```

## 7.4 FLOW-003 — DES What-if

### Trigger

`POST /simulate`에 Horizon, Replications 및 선택적 Scenario를 전달한다.

### Preconditions

- Resource, Process Time, WMS Seed/운영 데이터가 SQLite에 존재한다.

### Main Flow

| Step | From | To | 처리 내용 | 입력 | 출력 | 동기 여부 |
|---:|---|---|---|---|---|---|
| 1 | CMP-001 | CMP-002 | Simulation 요청 | Scenario | DTO | Sync |
| 2 | CMP-002 | CMP-006 | Baseline DES | WMS Snapshot | Baseline KPI | Sync CPU |
| 3 | CMP-002 | CMP-006 | Scenario DES | 변경 조건 | Scenario KPI | Sync CPU |
| 4 | CMP-006 | DS-001 | Scenario Result 저장 | JSON/KPI/Event | Version | Sync |
| 5 | CMP-006 | CMP-002 | KPI Key별 Delta | Baseline/Scenario | Comparison | Sync |
| 6 | CMP-002 | CMP-001 | 결과 반환 | JSON | Chart/Replay | Sync |

### Decision Points

| Decision ID | 위치 | 조건 | True 경로 | False 경로 |
|---|---|---|---|---|
| DEC-301 | API | Scenario 존재 | 임시 Baseline + 저장 What-if + 비교 | Baseline 단독 저장 |
| DEC-302 | Forecast | History 30/14/7일 기준 | LR/MA14/MA7 | 7일 미만 예측 불가 |

### Error Flows

| Error ID | 발생 위치 | 오류 조건 | 처리 방식 | 사용자 영향 |
|---|---|---|---|---|
| ERR-301 | DES | 잘못된 Scenario/DB/연산 오류 | 직접 API에는 명시 Fallback 없음 | 5xx 가능 |
| ERR-302 | 장기 연산 | 큰 Replication/Horizon | Timeout/Cancel 정의 없음 | 응답 지연 또는 Worker 점유 |

### Final Result

Baseline 또는 What-if Version, KPI 분포, Timeline, Inventory Projection, Movement가 반환·저장된다.

### Sequence Diagram Definition

```yaml
sequence:
  id: FLOW-003
  title: DES What-if Simulation
participants:
  - { id: CMP-001, name: Web SPA, type: component }
  - { id: CMP-002, name: FastAPI Server, type: component }
  - { id: CMP-006, name: Forecast and DES, type: component }
  - { id: DS-001, name: SQLite, type: database }
steps:
  - { order: 1, from: CMP-001, to: CMP-002, message: POST /simulate, mode: synchronous }
  - { order: 2, from: CMP-002, to: CMP-006, message: Run baseline, mode: synchronous }
  - order: 3
    type: alt
    condition: scenario is present
    true_flow: run What-if, persist version, compare deltas
    false_flow: persist baseline only
  - { order: 4, from: CMP-006, to: DS-001, message: Save run/KPIs/events, mode: synchronous }
  - { order: 5, from: CMP-002, to: CMP-001, message: Simulation result, mode: synchronous }
```

## 7.5 FLOW-004 — 실시간 수요와 Blackboard Auto Mode

### Trigger

Realtime Task가 주기적으로 Event를 생성하거나 `/realtime/emit`이 호출되고, Auto Mode Thread가 Cycle을 수행한다.

### Preconditions

- Realtime/Auto Mode가 각각 시작되어야 한다.
- 첫 Simulation Gate Cache가 준비되어야 한다.

### Main Flow

| Step | From | To | 처리 내용 | 입력 | 출력 | 동기 여부 |
|---:|---|---|---|---|---|---|
| 1 | CMP-009 | DS-001 | 가상 입고/출고 저장 | Random 설정 | Order Row | Sync |
| 2 | CMP-009 | CMP-008 | Blackboard Event 저장 | NEW_* Event | Event ID | Sync |
| 3 | CMP-009 | CMP-001 | SSE Broadcast | Event | Toast | Async |
| 4 | CMP-008 | DS-001 | NEW Event 조회 | Cycle Budget | Event List | Sync |
| 5 | CMP-008 | CMP-006 | Simulation Cache Gate | WMS 상태 | Labor/Space 판정 | Sync Read/Async Refresh |
| 6 | CMP-008 | CMP-008 | Domain Agent 제안과 Priority Sort | Event | Action Spec | Sync |
| 7 | CMP-008 | DS-001 | Policy/Precheck/Lock/Transaction/Postcheck | Action | Status/업무 변경 | Sync |
| 8 | CMP-008 | DS-001 | Audit/Exec/Route/Dispatch 저장 | 실행 결과 | Log | Sync |

### Decision Points

| Decision ID | 위치 | 조건 | True 경로 | False 경로 |
|---|---|---|---|---|
| DEC-401 | Control Loop | Auto Mode Enabled | Cycle 진행 | 즉시 종료 |
| DEC-402 | Simulation Gate | 첫 Cache 없음 | Event 보존 후 Warm-up 대기 | 제안 진행 |
| DEC-403 | Policy | 허용 Type, Risk 이하 | Lock/Precheck | POLICY_BLOCKED |
| DEC-404 | Lock | 모든 Lock 획득 | 실행 | PENDING 유지, 다음 Cycle 재시도 |
| DEC-405 | Post-check | 결과 일관 | Commit | Rollback/FAILED |

### Error Flows

| Error ID | 발생 위치 | 오류 조건 | 처리 방식 | 사용자 영향 |
|---|---|---|---|---|
| ERR-401 | Realtime→Blackboard | Event 적재 오류 | Exception 무시, WMS Row와 SSE는 유지 | 자동운영 누락 가능 |
| ERR-402 | Simulation Gate | DES 오류 | Error Cache 후 fail-open | 예측 없이 자동 Action 진행 가능 |
| ERR-403 | Executor | Handler/Postcheck 오류 | Rollback, FAILED, Audit | 해당 Action 미실행 |
| ERR-404 | Control Thread | Cycle 예외 | Audit 후 다음 주기 계속 | 일시 Cycle 실패 |

### Final Result

Event가 PROCESSED되고 Action은 SUCCESS, POLICY_BLOCKED, FAILED 또는 PENDING 상태가 되며 모든 주요 단계가 Audit에 저장된다.

### Sequence Diagram Definition

```yaml
sequence:
  id: FLOW-004
  title: Realtime Demand to Blackboard Auto Operation
participants:
  - { id: CMP-009, name: Realtime Demand, type: scheduler }
  - { id: DS-001, name: SQLite, type: database }
  - { id: CMP-008, name: Blackboard Auto Operation, type: scheduler }
  - { id: CMP-006, name: Forecast and DES, type: simulator }
  - { id: CMP-001, name: Web SPA, type: component }
steps:
  - { order: 1, from: CMP-009, to: DS-001, message: Insert inbound/outbound and blackboard event, mode: synchronous }
  - { order: 2, from: CMP-009, to: CMP-001, message: SSE realtime event, mode: asynchronous }
  - { order: 3, from: CMP-008, to: DS-001, message: Poll NEW events, mode: synchronous }
  - { order: 4, from: CMP-008, to: CMP-006, message: Read simulation gate; refresh if stale, mode: asynchronous }
  - { order: 5, from: CMP-008, to: DS-001, message: Policy, lock, transactional action, audit, mode: synchronous }
```

---

# 8. Data Architecture

## 8.1 Data Store Inventory

| Data Store ID | 이름 | 유형 | 저장 데이터 | 접근 컴포넌트 | 영속성 | 근거 |
|---|---|---|---|---|---|---|
| DS-001 | `wms.db` | SQLite RDB | WMS 12개 핵심 Entity, Draft, Simulation, Session, Trace, Blackboard 등 총 34 Table | CMP-002~CMP-011 | Permanent Local File; 보존 정책 미정 |
| DS-002 | `faiss.index` + `chunks.json` | Local Vector Store/Metadata | 정책 Chunk Vector와 Metadata | CMP-005 | Rebuild 전까지 영속 |
| DS-003 | Root `rag/*.md` | Local Document Store | 정책·SOP·산식·용어·KPI 문서 7종 | CMP-005 | Source-controlled Text |
| DS-004 | Process Memory | In-memory State/Cache | Compiled Graph, RAG Cache, Simulation Gate, Realtime Task/Subscriber, Thread-local Trace | CMP-003,005,008,009,010 | Process Lifetime |

## 8.2 Core Data Objects

| Data Object ID | 이름 | 설명 | 생성 주체 | 사용 주체 | 저장 위치 |
|---|---|---|---|---|---|
| DATA-001 | AgentState | 단일 Chat Run의 Workflow State | CMP-003 | CMP-003, CMP-010 | 메모리, 요약은 `agent_traces` |
| DATA-002 | Chat Session/Message | 멀티턴 대화와 사용자 입력 | CMP-010 | CMP-003, CMP-001 | DS-001 |
| DATA-003 | WMS Operational Entity | Product, Zone, Location, Inventory, In/Outbound, Task, Resource | Seed/Tool/Auto Mode | 대부분 컴포넌트 | DS-001 |
| DATA-004 | Action Draft | 사용자 승인 대기 변경안과 Dry Run | CMP-007 | CMP-001, CMP-007 | DS-001 `action_drafts` |
| DATA-005 | RAG Evidence | Source/Section/Span/Relevance/Contribution | CMP-005 | CMP-003, CMP-010 | Run 중 메모리, Message/Trace 일부 저장 |
| DATA-006 | Simulation Result | Run 조건, KPI, Projection, Event, Movement | CMP-006 | CMP-001, CMP-008 | DS-001 JSON/KPI/Event |
| DATA-007 | Blackboard Event/Action | 자동운영 입력과 실행 단위 | CMP-009/CMP-008 | CMP-008 | DS-001 |
| DATA-008 | Trace/Audit | Agent 단계·토큰·Action 단계 | CMP-010/CMP-008 | CMP-001/운영자 | DS-001 |

## 8.3 Data Object Structure

### DATA-001 — AgentState

```json
{
  "user_query": "오늘 위험 재고 알려줘",
  "user_id": "operator01",
  "history": [{"role": "user", "content": "..."}],
  "intent": "inventory_risk",
  "intent_confidence": 0.95,
  "parameters": {},
  "missing_parameters": [],
  "plan": ["inventory_risk"],
  "tool_results": {},
  "verification_results": {},
  "rag_required": true,
  "rag_context": [],
  "rag_context_sufficient": true,
  "rag_retry_count": 0,
  "draft_actions": [],
  "approval_required": false,
  "final_response": "...",
  "error": null
}
```

| Field | Type | Required | Description | Source |
|---|---|---|---|---|
| `user_query` | str | Y | 현재 질문 | API |
| `history` | list[dict] | N | 최근 최대 12개 Message | CMP-010 |
| `intent/parameters` | str/dict | N | Router 결과 | CMP-003 Router |
| `tool_results` | dict | N | 업무 Handler 결과 | CMP-004 |
| `rag_context*` | list/bool/int | N | Evidence와 충분성 | CMP-005 |
| `draft_actions` | list | N | 승인 대상 Draft | CMP-007/Approval Gate |
| `final_response/error` | str | N | 최종 결과 | CMP-003 |

### DATA-004 — Action Draft

```json
{
  "draft_id": "DRF-PCK-xxxxxx",
  "action_type": "PICKING",
  "target_id": "ORD001",
  "payload_json": {"order_no": "ORD001"},
  "dry_run_result_json": {"changes": [], "warnings": []},
  "status": "PENDING_APPROVAL",
  "approved_at": null,
  "executed_at": null
}
```

| Field | Type | Required | Description | Source |
|---|---|---|---|---|
| `draft_id` | TEXT | Y | Draft 식별자 | CMP-007 |
| `action_type` | TEXT | Y | STOCKING/PICKING/SHIPPING/ORDER | CMP-007 |
| `payload_json` | TEXT(JSON) | Y | 실행 입력 | CMP-007 |
| `dry_run_result_json` | TEXT(JSON) | N | 예상 변경과 Warning | CMP-007 |
| `status` | TEXT | Y | PENDING_APPROVAL/APPROVED/REJECTED/EXECUTED | CMP-007 |

### DATA-007 — Blackboard Action

```json
{
  "action_id": "A-xxxxxxxxxx",
  "event_id": "E-...",
  "agent_name": "PickingAgent",
  "action_type": "CREATE_PICKING_TASK",
  "payload_json": {},
  "priority_score": 0.0,
  "risk_score": 0.0,
  "idempotency_key": "...",
  "status": "PENDING",
  "policy_result_json": null,
  "precheck_result_json": null,
  "execution_result_json": null,
  "postcheck_result_json": null
}
```

### DATA-006 — Simulation Result

```json
{
  "sim_run_id": "SIM-xxxxxx",
  "version_name": "VYYYYMMDD-HHMMSS",
  "run_type": "BASELINE|WHATIF",
  "scenario": {"worker_delta": 1},
  "params": {"worker_count": 4, "forklift_count": 2, "team_count": 2},
  "kpis": [{"kpi_name": "shipping_delay_count", "mean": 1.2, "p90": 3}],
  "zone_occupancy_timeseries": [],
  "inventory_projection": [],
  "bottleneck_events": [],
  "movement": {}
}
```

## 8.4 Data Lifecycle

| Data | 생성 | 조회 | 수정 | 삭제 | 보존 기간 |
|---|---|---|---|---|---|
| WMS Master/Order | Seed, Realtime, Tool | API/Tool/Simulation | Tool/Approval/Auto Mode | 명시 일반 삭제 API 없음 | 미확인 |
| Chat Session | `/sessions`, `/chat` | Session API | Message 추가/제목/updated_at | Session Delete API | 자동 만료 없음 |
| Draft | Agent/Direct API | `/drafts` | 승인·거절·실행 | 완료 Draft Delete API | 미확인 |
| Simulation | `/simulate` | Version API | Baseline 교체 | 새 Baseline 저장 시 이전 Baseline만 삭제 | What-if 보존 기간 미확인 |
| Agent Trace | Chat 완료 | Trace API | 수정 없음 | 삭제 기능 없음 | 미확인 |
| Blackboard Event/Action/Audit | Realtime/Control Loop | `/api/blackboard/*` | Status 전이 | 삭제 기능 없음 | 미확인 |
| Lock | Executor | Executor | 없음 | 실행 종료 또는 TTL 만료 정리 | 60초 TTL |
| FAISS Index | CLI Build | RAG Search | 전체 Rebuild | 수동 | 정책 변경 시 수동 Rebuild |

## 8.5 Data Flow Definition

```yaml
data_flow:
  - id: DF-001
    data: Chat Query and AgentState
    from: CMP-001
    to: CMP-003
    operation: Create/Transform
    storage: DS-001 chat_messages and agent_traces
    contains_sensitive_data: unknown
  - id: DF-002
    data: Tool Query Result
    from: DS-001
    to: CMP-004
    operation: Read/Transform
    storage: none or tool_logs when wrapper used
    contains_sensitive_data: no
  - id: DF-003
    data: Policy Evidence
    from: DS-002
    to: CMP-005
    operation: Read/Rank
    storage: message sources and trace summary
    contains_sensitive_data: no
  - id: DF-004
    data: Prompt with history/tool/evidence
    from: CMP-003
    to: EXT-001
    operation: Transform
    storage: external retention unknown
    contains_sensitive_data: unknown
  - id: DF-005
    data: Simulation Result
    from: CMP-006
    to: DS-001
    operation: Create
    storage: simulation_runs/kpis/events
    contains_sensitive_data: no
  - id: DF-006
    data: Blackboard Event and Action
    from: CMP-009
    to: CMP-008
    operation: Create/Update
    storage: DS-001
    contains_sensitive_data: no
```

---

# 9. API and Interface Architecture

## 9.1 Inbound APIs

인증 Column은 코드상 전 Endpoint 공통으로 `없음`이다.

| API ID | Method | Path | 호출 주체 | 요청 | 응답 | 인증 | 구현 위치 |
|---|---|---|---|---|---|---|---|
| API-001 | GET | `/health` | Browser/Monitor | 없음 | `{status}` | 없음 | `api/main.py:health` |
| API-002 | GET/POST | `/resources`, `/resources/update` | SPA/Admin | Query worker/forklift | 자원/팀/재고 | 없음 | `api/main.py` |
| API-003 | GET | `/data/snapshot`, `/data/{dataset}` | SPA | Dataset, filter, limit≤500 | Row Page | 없음 | `api/main.py` |
| API-004 | POST | `/chat` | Client | `ChatReq` | Agent 결과 JSON | 없음 | `api/main.py:chat` |
| API-005 | POST | `/chat/stream` | SPA | `ChatReq` | Node/Substep/Done SSE | 없음 | `api/main.py:chat_stream` |
| API-006 | GET/POST/DELETE | `/sessions`, `/sessions/{session_id}` | SPA | user/session | Session/Message | 없음 | `api/main.py` |
| API-007 | GET | `/inbound`, `/outbound`, `/shipping/pending` | SPA/API | Status/Date | Order 목록 | 없음 | `api/main.py` |
| API-008 | GET | `/allocation/scan`, `/deadstock/scan`, `/replenishment/scan` | SPA/API | Filter | 분석 결과 | 없음 | `api/main.py` |
| API-009 | POST | `/recommend/stocking`, `/recommend/picking` | SPA/API | Inbound/Datetime | 추천 | 없음 | `api/main.py` |
| API-010 | POST | `/forecast`, `/risk/scan` | SPA/API | SKU/Days/Risk | Forecast/Risk | 없음 | `api/main.py` |
| API-011 | POST | `/simulate` | SPA/API | `SimulateReq` | Baseline/Scenario/Comparison | 없음 | `api/main.py` |
| API-012 | GET | `/twin/zones` | SPA | 없음 | Zone 상세 | 없음 | `api/main.py` |
| API-013 | GET | `/simulation/versions*`, `/simulation/compare` | SPA | Version Name | 저장 Result/Delta | 없음 | `api/main.py` |
| API-014 | POST/GET | `/kpi`, `/kpi/dashboard`, `/kpi/targets`, `/kpi/trend/*` | SPA | KPI/Target/Days | KPI/Trend | 없음 | `api/main.py` |
| API-015 | POST | `/stocking/draft`, `/picking/draft`, `/shipping/draft` | SPA/Agent | 업무 ID | Draft | 없음 | `api/main.py` |
| API-016 | POST | `/allocation/apply`, `/replenishment/apply` | SPA/API | Order/SKU | 즉시 실행 결과 | 없음 | `api/main.py` |
| API-017 | GET/POST/DELETE | `/drafts*`, `/approve` | SPA | Draft/Approve | 승인·실행·삭제 | 없음 | `api/main.py` |
| API-018 | GET/POST | `/todo`, `/todo/{bucket}`, `/todo/act` | SPA | Bucket/Decision | 오늘 할 일/처리 | 없음 | `api/main.py` |
| API-019 | GET | `/events` | SPA | SSE Subscribe | Realtime Event | 없음 | `api/main.py` |
| API-020 | POST/GET | `/realtime/start|stop|status|config|emit` | SPA/Admin | Realtime Config | Process 상태/Event | 없음 | `api/main.py` |
| API-021 | GET | `/traces`, `/traces/{run_id}`, `/trace/{run_id}` | SPA/Developer | Run/Session | Agent/Tool/RAG Trace | 없음 | `api/main.py` |
| API-022 | GET/POST | `/api/auto-mode*` | SPA/Admin | Setting/On/Off | Auto Mode 상태 | 없음 | `bb/routes.py` |
| API-023 | GET/POST | `/api/blackboard/events*`, `/actions*`, `/audit-logs` | SPA/Admin | Filter/Event | Blackboard Row | 없음 | `bb/routes.py` |
| API-024 | POST/GET | `/api/blackboard/run-once`, `/api/auto-mode/loop/*` | SPA/Admin | Force/Start/Stop | Cycle/Thread 상태 | 없음 | `bb/routes.py` |
| API-025 | GET/POST | `/api/blackboard/simulation*`, `/capacity` | SPA/Admin | Run | Gate/Capacity | 없음 | `bb/routes.py` |
| API-026 | GET/POST | `/api/blackboard/requests*`, `/awaiting-orders`, `/availability/{sku}` | SPA/Admin | Request/Order/SKU | Trace/보충/가용성 | 없음 | `bb/routes.py` |
| API-027 | GET | `/api/blackboard/dispatch-log`, `/route-log`, `/exec-log` | SPA/Admin | limit | 의사결정 Log | 없음 | `bb/routes.py` |
| API-028 | GET | `/`, `/static/*` | Browser | 없음 | SPA File | 없음 | `api/main.py` |

## 9.2 Outbound APIs

| Integration ID | 대상 시스템 | Endpoint 또는 Client | 목적 | Timeout | Retry | 인증 | 근거 |
|---|---|---|---|---|---|---|---|
| INT-001 | OpenAI/Azure OpenAI 호환 Gateway | `OpenAI` 또는 `AzureOpenAI` Client | Chat Completion | 명시 설정 없음 | 명시 설정 없음; SDK 기본은 문서에서 확정하지 않음 | API Key | `app/llm.py` |
| INT-002 | OpenAI/Azure OpenAI 호환 Gateway | `client.embeddings.create()` | Query/Document Embedding | 명시 설정 없음 | 명시 설정 없음 | API Key | `app/llm.py:embed` |

## 9.3 Events and Messages

| Event ID | 이름 | Producer | Consumer | Payload | Broker | 전달 보장 |
|---|---|---|---|---|---|---|
| EVT-001 | Realtime SSE Event | CMP-009 | CMP-001 Subscriber | kind/id/sku/qty/ts/message | 프로세스 내부 asyncio Queue | 연결 중 Best effort; 영속 재전송 없음 |
| EVT-002 | Blackboard Event | CMP-009/Manual API/Executor | CMP-008 Domain Agents | event_type/target/payload/severity/source/status | DS-001 `blackboard_events` | DB 영속; 상태 기반 재처리, Broker 보장 모델 아님 |
| EVT-003 | Chat Step/Substep | CMP-003/CMP-010 | CMP-001 | node/kind/out/token | Request별 asyncio Queue/SSE | 연결 중 Best effort; 최종 Trace는 DB 저장 |
| EVT-004 | Follow-up Blackboard Event | CMP-008 Executor | CMP-008 다음 Cycle/Pass | TASK_CREATED, NEED_PUTAWAY 등 | DS-001 | 동일 Cycle Budget 내 소비 가능 |

## 9.4 Interface Contracts

### Chat

```json
{
  "request_example": {
    "query": "SKU_A001 언제 소진돼?",
    "user_id": "operator01",
    "session_id": "S-xxxxxxxx"
  },
  "response_example": {
    "success": true,
    "intent": "inventory_risk",
    "session_id": "S-xxxxxxxx",
    "run_id": "R-xxxxxxxx",
    "approval_required": false,
    "response": "...",
    "draft_actions": [],
    "rag_sources": [],
    "tokens": {"prompt": 0, "completion": 0, "total": 0, "calls": 0},
    "tool_results": {},
    "error": null
  }
}
```

### Simulation

```json
{
  "request_example": {
    "horizon_days": 7,
    "near_future_days": 3,
    "replications": 50,
    "scenario": {"worker_delta": 1, "demand_multiplier": 1.3}
  },
  "response_example": {
    "baseline": {"sim_run_id": "SIM-...", "kpis": []},
    "scenario": {"sim_run_id": "SIM-...", "version_name": "V...", "kpis": []},
    "comparison": []
  }
}
```

### Approval

```json
{
  "request_example": {"draft_id": "DRF-PCK-xxxxxx", "approved": true, "user_id": "operator01"},
  "response_example": {"status": "EXECUTED", "executed_action": {}}
}
```

### Blackboard Event

```json
{
  "request_example": {
    "event_type": "NEW_OUTBOUND_ORDER",
    "target_type": "order",
    "target_id": "ORD001",
    "payload_json": {"sku": "SKU_A001", "qty": 10},
    "severity": "normal",
    "source": "manual"
  },
  "response_example": {"event_id": "E-..."}
}
```

---

# 10. State and Session Management

## 10.1 State Inventory

| State ID | 상태명 | 범위 | 생성 주체 | 저장 위치 | 만료 조건 |
|---|---|---|---|---|---|
| STATE-001 | AgentState | Request | CMP-003 | 메모리, Trace 요약 | Run 종료 |
| STATE-002 | Chat Session | Session | CMP-010 | DS-001 | 자동 만료 없음; 명시 삭제 |
| STATE-003 | Draft State | Business Transaction | CMP-007 | DS-001 | 완료 후에도 보존; 명시 삭제 가능 |
| STATE-004 | Blackboard Event State | Workflow | CMP-008 | DS-001 | 삭제 없음 |
| STATE-005 | Blackboard Action State | Workflow | CMP-008 | DS-001 | 삭제 없음 |
| STATE-006 | Blackboard Lock | Resource Lock | CMP-008 | DS-001 | 60초 TTL 또는 실행 종료 |
| STATE-007 | Realtime State | Process Global | CMP-009 | 메모리 | Process 종료/stop |
| STATE-008 | Auto Loop State | Process Global | CMP-008 | 메모리+설정 DB | Thread stop/Process 종료 |
| STATE-009 | Simulation Gate Cache | Process Global | CMP-008 | 메모리+Lock | 기본 30초 Stale |
| STATE-010 | RAG/Graph Cache | Process Global | CMP-003/CMP-005 | 메모리 | Process 종료/Index Rebuild 후 `_cache` reset |

## 10.2 State Transition

| Current State | Trigger | Processing Component | Next State | Stored Data |
|---|---|---|---|---|
| Draft 없음 | Draft 생성 | CMP-007 | PENDING_APPROVAL | payload, dry-run |
| PENDING_APPROVAL | Reject | CMP-007 | REJECTED | status |
| PENDING_APPROVAL | Approve | CMP-007 | APPROVED | approved_at |
| APPROVED | Handler 성공 | CMP-007 | EXECUTED | 업무 상태, executed_at |
| BB Event NEW | Cycle 수집 | CMP-008 | PROCESSING | status |
| BB Event PROCESSING | 모든 제안 처리 | CMP-008 | PROCESSED | processed_at |
| BB Action PENDING | Policy 실패 | CMP-008 | POLICY_BLOCKED | reason/policy result |
| BB Action PENDING | Lock 실패 | CMP-008 | PENDING | retry reason |
| BB Action PENDING | Lock 성공 | CMP-008 | RUNNING | started_at |
| BB Action RUNNING | Commit/Postcheck 성공 | CMP-008 | SUCCESS | execution/postcheck |
| BB Action RUNNING | 오류/Postcheck 실패 | CMP-008 | FAILED | error/reason |

## 10.3 Concurrency Considerations

- SQLite Connection은 호출마다 생성하며 `timeout=10`, `busy_timeout=8000`, FK ON이다.
- WAL Mode는 코드에서 설정하지 않는다. FastAPI, Realtime Task, Auto Mode Thread, Simulation Refresh Thread가 동일 파일에 쓰므로 Writer 경합 가능성이 있다.
- Blackboard는 DB Unique Idempotency Key, App-level Lock(60초 TTL), Transaction/Postcheck로 일부 경쟁을 제어한다.
- Chat Streaming의 Trace Sink와 Token Counter는 `threading.local()`이므로 Thread 간 오염을 방지한다.
- Realtime `_state`, Subscriber Set, asyncio Task, Auto Mode `_running`/Thread, Simulation Cache는 프로세스 로컬이다. 다중 Uvicorn Worker/Replica에서는 상태가 분리되고 Auto Loop가 중복 실행될 수 있다.
- RAG Index/Compiled Graph는 Process Cache이며 멀티 Process 간 공유되지 않는다.
- Draft 승인은 Status 확인 후 별도 Connection에서 APPROVED 저장, 이후 별도 실행·EXECUTED 갱신을 수행한다. 동시 승인과 부분 실패를 원자적으로 묶는 Transaction이 없다.

## 10.4 State Diagram Definition

```yaml
states:
  - { id: draft_pending, name: PENDING_APPROVAL }
  - { id: draft_approved, name: APPROVED }
  - { id: draft_rejected, name: REJECTED }
  - { id: draft_executed, name: EXECUTED }
  - { id: action_pending, name: BB PENDING }
  - { id: action_blocked, name: BB POLICY_BLOCKED }
  - { id: action_running, name: BB RUNNING }
  - { id: action_success, name: BB SUCCESS }
  - { id: action_failed, name: BB FAILED }
transitions:
  - { from: draft_pending, to: draft_rejected, trigger: User rejects }
  - { from: draft_pending, to: draft_approved, trigger: User approves }
  - { from: draft_approved, to: draft_executed, trigger: Type handler succeeds }
  - { from: action_pending, to: action_blocked, trigger: Policy or simulation gate blocks }
  - { from: action_pending, to: action_running, trigger: Precheck and lock succeed }
  - { from: action_running, to: action_success, trigger: Transaction and postcheck succeed }
  - { from: action_running, to: action_failed, trigger: Handler or postcheck fails }
```

---

# 11. Deployment Architecture

## 11.1 Environments

| Environment | 목적 | 실행 위치 | 데이터 저장소 | 외부 연동 |
|---|---|---|---|---|
| Local | 개발·POC·데모 | Windows Workspace의 Python venv | Local SQLite/FAISS/Markdown | 사내 Gateway 또는 OpenAI |
| Development | 미확인 | 미확인 | 미확인 | 미확인 |
| Production | 미확인 | 미확인 | 미확인 | 미확인 |

## 11.2 Deployment Units

| Deployment ID | 이름 | 유형 | Runtime | Port | Replica | Resource |
|---|---|---|---|---:|---:|---|
| DEP-001 | WOONG AI FastAPI | Local Process | Python 3.11/Uvicorn | 코드에 미지정 | 미지정; 구조상 1 권장 | 미정 |
| DEP-002 | Optional Streamlit UI | Local Process | Python 3.11/Streamlit | 코드에 미지정 | 미정 | 미정 |
| DEP-003 | Auto Mode Thread | In-process daemon Thread | DEP-001 내부 | 해당 없음 | Process당 최대 1 | 미정 |
| DEP-004 | Realtime Task | In-process asyncio Task | DEP-001 내부 | 해당 없음 | Process당 최대 1 | 미정 |

## 11.3 Network Structure

| Source | Destination | Port | Protocol | Direction | Purpose |
|---|---|---:|---|---|---|
| Browser | DEP-001 | 미지정 | HTTP 또는 HTTPS | Inbound | SPA/REST/SSE |
| DEP-001 | EXT-001 | Endpoint에 따름 | HTTPS로 추정, 강제 여부 미확인 | Outbound | Chat/Embedding |
| DEP-001 | DS-001/002/003 | 해당 없음 | Local File I/O | Local | DB/Vector/Document |

## 11.4 Configuration and Secrets

| 설정 | 저장 위치 | 주입 방식 | 민감정보 여부 | 기본값 |
|---|---|---|---|---|
| `OPENAI_API_KEY` | `app/.env` | pydantic-settings ENV | Y | 빈 문자열 |
| `OPENAI_BASE_URL` | `app/.env` | ENV | N/환경정보 | 빈 문자열 |
| `OPENAI_API_VERSION` | `app/.env` | ENV | N | `2024-12-01-preview` |
| `OPENAI_CHAT_MODEL` | `.env`/config | ENV | N | `gpt-5.4` |
| `OPENAI_ROUTER_MODEL` | `.env`/config | ENV | N | `gpt-4.1-mini` |
| `OPENAI_EMBED_MODEL` | `.env`/config | ENV | N | `text-embedding-3-small` |
| `DB_PATH` | ENV/config | ENV | N | `app/db/wms.db` |
| `BASE_DATE` | ENV/config | ENV | N | `2026-06-15` |
| `DES_REPLICATIONS` | ENV/config | ENV | N | `200` |
| Auto Mode Setting | `system_settings` | 관리 API/DB | N | `bb/settings.py DEFAULTS` |

민감한 실제 값은 분석하지 않았고 문서에 기록하지 않았다. `.env`와 DB/Index는 `.gitignore` 대상이다.

## 11.5 Deployment Diagram Definition

```yaml
diagram:
  id: deployment-architecture
  title: Confirmed Local Deployment
  direction: left-to-right
zones:
  - { id: client-zone, name: User Workstation Browser }
  - { id: application-zone, name: Local Python Runtime }
  - { id: storage-zone, name: Local Workspace Storage }
  - { id: external-zone, name: External AI Service }
nodes:
  - { id: user-pc, name: Browser, zone: client-zone, type: client }
  - { id: app-process, name: Uvicorn FastAPI Process, zone: application-zone, type: process }
  - { id: auto-thread, name: Auto Mode Thread, zone: application-zone, type: thread }
  - { id: realtime-task, name: Realtime Async Task, zone: application-zone, type: task }
  - { id: sqlite-file, name: wms.db, zone: storage-zone, type: database }
  - { id: faiss-files, name: FAISS Index and Chunks, zone: storage-zone, type: vector-store }
  - { id: llm-gateway, name: OpenAI-compatible Gateway, zone: external-zone, type: external-api }
deployments:
  - { component: CMP-001, node: user-pc }
  - { component: CMP-002, node: app-process }
  - { component: CMP-003, node: app-process }
  - { component: CMP-008, node: auto-thread }
  - { component: CMP-009, node: realtime-task }
  - { component: DS-001, node: sqlite-file }
  - { component: DS-002, node: faiss-files }
connections:
  - { from: user-pc, to: app-process, protocol: HTTP(S)/REST/SSE, port: unknown }
  - { from: app-process, to: sqlite-file, protocol: SQLite file I/O, port: none }
  - { from: app-process, to: faiss-files, protocol: Local file I/O, port: none }
  - { from: app-process, to: llm-gateway, protocol: OpenAI API over HTTP(S), port: endpoint-dependent }
```

---

# 12. Security Architecture

## 12.1 Authentication and Authorization

| 구간 | 인증 방식 | 인가 방식 | 구현 위치 | 미확인 사항 |
|---|---|---|---|---|
| User → Application | 없음 | 없음 | FastAPI 전 Route에 Security Dependency 없음 | 운영 배포 전 SSO/API 인증 필요 |
| User → Session | `user_id` 문자열 신뢰 | Session ID를 아는 누구나 조회/삭제 가능 | `chat_store.py`, Session API | 소유권 검증 없음 |
| User → Approval | 요청의 `user_id` 신뢰, 기본 `operator01` | Draft 권한 검증 없음 | `ApproveReq`, `approve_action()` | 승인자 보존도 없음 |
| App → LLM Gateway | API Key | Gateway 정책에 의존 | `app/llm.py` | Key Rotation, Scope 미확인 |
| Admin API | 없음 | 없음 | `/resources/update`, `/api/auto-mode*`, `/realtime/*` | 관리자 보호 없음 |

## 12.2 Sensitive Data

| 데이터 | 민감도 | 저장 여부 | 암호화 | 마스킹 | 접근 주체 |
|---|---|---|---|---|---|
| API Key | High | `.env` | File 암호화 미확인 | 문서에는 미출력 | Application Process |
| Chat Content | Medium/Unknown | SQLite | Application-level 암호화 없음 | 없음 | 모든 API 호출자 |
| 사용자 이름 등 대화 내 개인정보 | Medium | Chat Message 및 외부 LLM 전송 가능 | 미확인 | 없음 | Application/LLM Gateway |
| WMS Demo 데이터 | Low~Medium | SQLite | 없음 | 없음 | 모든 API 호출자 |
| Trace/Prompt 근거 | Medium | SQLite | 없음 | 없음 | Trace API 호출자 |

## 12.3 Security Controls

- Secret은 `.env`로 분리하고 `.gitignore`에 포함한다. 실제 Secret Store 연동은 없다.
- Pydantic이 기본 Type Validation을 제공한다.
- 일반 SQL Parameter는 `?` Binding을 사용한다. `/data/{dataset}`의 Table/Column은 서버 내부 Allowlist에서 선택한다.
- State-changing Chat Intent는 Draft와 Approval Gate를 사용한다.
- Blackboard Auto Mode는 Action Type Allowlist, Risk Threshold, Pre/Post Check, Lock을 사용한다.
- Prompt Injection 관련 System Prompt와 평가 Case는 있으나, 입력 Sanitization/Content Filter/Tool Permission Boundary는 없다.
- TLS, Rate Limit, CSRF, Security Header, Audit User Identity, 접근 로그 보존은 미확인이다.
- 파일 업로드와 Presigned URL 기능은 존재하지 않는다.

## 12.4 Identified Security Risks

| Risk ID | 위험 | 영향 | 현재 통제 | 개선 필요 |
|---|---|---|---|---|
| SEC-001 | 전 API 인증·인가 부재 | Session/Trace/WMS 데이터 노출 및 상태 변경 | 없음 | High: SSO/JWT 또는 Gateway 인증, RBAC |
| SEC-002 | Approval API도 무인증 | 공격자가 Draft 승인/실행 가능 | Draft Status Check만 존재 | High: 승인자 인증·권한·서명·감사 저장 |
| SEC-003 | 즉시 실행·관리 API 공개 | Allocation, Replenishment, Resource, Auto Mode 조작 | 일부 Business Validation | High: 역할별 Endpoint 인가와 운영망 제한 |
| SEC-004 | Chat/개인정보 평문 저장 및 외부 전송 | 개인정보·운영정보 유출 | `.env` Secret 분리 | High: 데이터 분류, 마스킹, 보존/삭제, Gateway 계약 확인 |
| SEC-005 | Prompt Injection 방어가 Prompt 중심 | 잘못된 Intent/설명 또는 Draft 생성 유도 | 상태변경 일부 Approval Gate | Medium: 입력/출력 Policy, Tool Scope, 구조화 검증, Red Team 확대 |
| SEC-006 | TLS/Rate Limit/CSRF 미정 | 도청, 남용, DoS 가능 | 배포계층 미확인 | High: Reverse Proxy 보안 기준 정의 |
| SEC-007 | Session ID 기반 접근 | ID 노출 시 타 세션 조회/삭제 | UUID 단축 ID | High: User 소유권 Filter 강제 |

---

# 13. Error Handling and Resilience

## 13.1 Error Handling Matrix

| Component | Failure Type | Detection | Retry | Fallback | Final Behavior |
|---|---|---|---|---|---|
| CMP-003 Router/Response | LLM Network/SDK 오류 | Exception | 없음 | 없음 | `/chat` 5xx 또는 `/chat/stream` error SSE |
| CMP-003 Tool Executor | Tool Exception | try/except | 없음 | 빈 Tool Result | `error`가 State에 저장 |
| CMP-005 RAG JSON | 비정상 JSON | JSON Parse | Retrieval 최대 2회 | abstain | 정책 질문은 근거 부족 응답 |
| CMP-005 Index/File | Index 없음/불일치 | Exception | 없음 | 없음 | Chat 실패 가능 |
| CMP-006 Forecast | History 부족 | Row Count | 해당 없음 | MA14/MA7/insufficient_data | UNKNOWN 또는 제한 결과 |
| CMP-006 Direct DES | 연산/DB 오류 | Exception | 없음 | 없음 | 5xx 가능 |
| CMP-008 Simulation Gate | DES 오류 | Exception | Refresh 주기 재시도 가능 | fail-open | 예측 없이 Auto Action 가능 |
| CMP-008 Lock | Lock 경합 | Insert IntegrityError | 다음 Cycle, 최대 없음 | PENDING 유지 | 지연 |
| CMP-008 Executor | Pre/Post/Handler 실패 | Check/Exception | Action 자동 Retry 없음 | Rollback | FAILED + Audit |
| CMP-009 Realtime Loop | 생성 오류 | Exception | 다음 Interval 계속 | Error SSE | 해당 Event 누락 |
| CMP-011 SQLite | Busy/Lock | sqlite3 | Busy wait 8초 | 없음 | 예외 전파 |

## 13.2 Timeout and Retry Policy

| Integration | Timeout | Max Retry | Backoff | Retry Condition |
|---|---:|---:|---|---|
| SQLite Connection | 10초 | SDK 수준 없음 | Busy Wait 8초 | DB Lock |
| LLM Chat/Embedding | 미확인 | 미확인 | 미확인 | Client 기본 정책은 코드에 명시 없음 |
| RAG Retrieval Loop | 외부 호출 Timeout 미확인 | 2회 재검색 | Backoff 없음 | Context insufficient |
| Blackboard Lock | TTL 60초 | 무제한 Cycle 가능 | Cycle 기본 15초 | Lock 경합 |
| Realtime Generator | 없음 | Loop 계속 | Interval 기본 8초 | 생성 예외 후 다음 Iteration |

## 13.3 Single Points of Failure

| SPOF ID | 대상 | 장애 영향 | 현재 대응 | 권장 개선 |
|---|---|---|---|---|
| SPOF-001 | 단일 SQLite 파일 | 전체 조회·상태·세션·Trace 중단 | Busy Timeout만 존재 | PostgreSQL, Backup/Restore, Migration |
| SPOF-002 | 외부 LLM Gateway | Chat Router/RAG/응답 중단 | Tool-only API는 가능, Chat fallback 없음 | Timeout/Circuit Breaker/Degraded Mode |
| SPOF-003 | 단일 FastAPI Process | UI/API/Task/Thread 모두 중단 | 미확인 | 프로세스 관리와 외부 Scheduler; 상태 분리 |
| SPOF-004 | Local FAISS Index | 정책 근거 질의 실패 | abstain은 검색 성공 후 부족일 때만 적용 | Index Health/자동 Rebuild/Versioning |
| SPOF-005 | Process-local Auto/Realtime State | 재시작 시 상태 소실, Multiworker 중복 | 설정 일부는 DB | 전용 Worker/Leader Election/Message Broker |

## 13.4 Data Consistency

- Transaction 경계: Tool/Executor별 SQLite Connection 단위. Blackboard Handler는 Precheck 이후 Handler+Postcheck를 하나의 Connection Transaction으로 묶는다.
- 중복 요청 처리: Blackboard Action은 Unique `idempotency_key`와 기존 SUCCESS 검사로 방지한다. 사용자 Draft는 동일 대상 중복 Draft를 일반적으로 방지하지 않는다.
- Idempotency: Blackboard에 명시 구현. 일반 REST, Approval, Simulation에는 Idempotency Key가 없다.
- 부분 실패 처리: Blackboard는 Rollback한다. Draft Approval은 APPROVED 저장과 실제 실행/EXECUTED 저장이 분리되어 부분 상태가 가능하다.
- 보상 처리: Blackboard Schema에 `compensation_result_json`이 있으나 일반 실행 흐름에서 명시 보상 로직은 제한적/미확인이다.
- Shipping Confirm은 재고 Shortfall을 결과에 기록하면서 Order를 SHIPPED로 설정할 수 있어 Business Consistency 검토가 필요하다.

## 13.5 Error and Fallback Flow Definition

```yaml
diagram:
  id: error-fallback-flow
  title: Error and Fallback Flow
  direction: top-to-bottom
nodes:
  - { id: ERR-N1, name: Request or Event, type: start }
  - { id: ERR-N2, name: LLM or Tool Call, type: process }
  - { id: ERR-N3, name: RAG Sufficiency, type: decision }
  - { id: ERR-N4, name: Query Rewrite Retry max 2, type: process }
  - { id: ERR-N5, name: Abstain, type: fallback }
  - { id: ERR-N6, name: Blackboard Policy and Precheck, type: decision }
  - { id: ERR-N7, name: Acquire Lock, type: decision }
  - { id: ERR-N8, name: Transaction and Postcheck, type: decision }
  - { id: ERR-N9, name: Rollback and FAILED Audit, type: fallback }
  - { id: ERR-N10, name: SUCCESS, type: end }
relationships:
  - { from: ERR-N1, to: ERR-N2, label: process }
  - { from: ERR-N2, to: ERR-N3, label: RAG required and call succeeded }
  - { from: ERR-N3, to: ERR-N4, label: insufficient and retry remains }
  - { from: ERR-N4, to: ERR-N3, label: rewritten query }
  - { from: ERR-N3, to: ERR-N5, label: insufficient after max retry }
  - { from: ERR-N1, to: ERR-N6, label: blackboard action }
  - { from: ERR-N6, to: ERR-N9, label: blocked or precheck fail }
  - { from: ERR-N6, to: ERR-N7, label: allowed }
  - { from: ERR-N7, to: ERR-N1, label: lock conflict; keep PENDING for next cycle }
  - { from: ERR-N7, to: ERR-N8, label: lock acquired }
  - { from: ERR-N8, to: ERR-N9, label: exception or postcheck fail }
  - { from: ERR-N8, to: ERR-N10, label: commit succeeds }
```

---

# 14. Observability and Operations

## 14.1 Logging

| Log Type | 생성 위치 | 포함 정보 | 저장 위치 | 보존 기간 |
|---|---|---|---|---|
| Agent Trace | `trace_store.save()` | Intent, RAG, Step, Response, Token | `agent_traces` | 미확인 |
| Live Agent Event | `trace_store.emit()` | Search/Rerank/Sufficiency/Token | Thread-local Sink→SSE | 연결/Run 기간 |
| Tool Log | `tools.common.run_tool()` | Input/Output/Success/Error | `tool_logs` | 미확인 |
| RAG Log | Schema 존재 | Query/Source/Top K | `rag_logs` | 현재 Chat Retriever 직접 기록은 확인되지 않음 |
| Blackboard Audit | `bb.audit.log()` | Phase, Before/After, Result, Message | `blackboard_audit_logs` | 미확인 |
| Dispatch/Route/Exec Log | Scheduler/Route/Control Loop | Score, Route, 실행 순서·차단 사유 | 전용 Table | 미확인 |
| Application Log | Uvicorn/Exception | Access/Error | Console 추정 | 미확인 |

## 14.2 Metrics

| Metric ID | 메트릭 | 생성 위치 | 목적 | Alert 기준 |
|---|---|---|---|---|
| METRIC-001 | Token/LLM Call Count | `llm.complete()`, `trace_store` | 비용·호출 추적 | 정의 없음 |
| METRIC-002 | RAG Sufficiency/Retry/Abstain | Retriever/Trace | 검색 품질 | 정의 없음 |
| METRIC-003 | WMS KPI 16종 내외 | `tools/kpi_dashboard.py`, lookup | 운영 상태 | Target는 일부 DB 설정 |
| METRIC-004 | Simulation KPI | `sim/des.py` | What-if와 병목 판단 | Auto Mode Util/Zone Threshold |
| METRIC-005 | Action Success/Blocked/Failed | Blackboard Action/Audit | 자동운영 품질 | Alert 정의 없음 |
| METRIC-006 | Latency/LLM Calls/Tokens | `eval.harness.bench_latency()` | 성능 실측 | CI Alert 정의 없음 |

## 14.3 Distributed Tracing

- Trace 도구: 외부 APM 없음. Phoenix식 자체 SQLite Trace.
- Trace ID 전달 방식: Chat 종료 후 `R-xxxxxxxx` 생성; Tool의 `run_id`와 자동 연결되지 않는다.
- LLM 호출 추적: Thread-local Token Counter와 Node Name.
- DB 호출 추적: 공통 SQL Span/Duration 계측 없음.
- Blackboard는 Agent Chat Trace와 별도 Audit ID/Action ID 체계를 사용한다.

## 14.4 Health Checks

| Endpoint 또는 Check | 대상 | 정상 조건 | 실패 시 처리 |
|---|---|---|---|
| `GET /health` | FastAPI Process | 항상 `{status:"ok"}` 반환 | 외부 처리 미정 |
| DB Health | 미구현 | 미확인 | `/health`가 SQLite 접근을 확인하지 않음 |
| LLM Health | 미구현 | 미확인 | 실제 요청 시 발견 |
| FAISS Health | 미구현 | 미확인 | RAG 요청 시 발견 |
| Auto Loop Status | `/api/auto-mode/loop/status` | running/enabled | UI 표시 |
| Realtime Status | `/realtime/status` | running/count/subscribers | UI 표시 |

## 14.5 Operational Procedures

- 애플리케이션 시작 방법: `app/`에서 venv 활성화 후 `uvicorn api.main:app --reload`.
- 애플리케이션 종료 방법: Process 종료. Auto/Realtime Stop API는 각각 내부 Task/Thread만 중지.
- 장애 확인 방법: Uvicorn Console, `/traces`, `/api/blackboard/audit-logs`, 상태 Endpoint.
- 로그 확인 위치: `agent_traces`, `blackboard_audit_logs`, `action_exec_log`, `dispatch_scores`, `zone_routes`.
- 설정 변경 방법: `.env`, KPI Target API, `/api/auto-mode/settings`, Realtime Config API.
- 배포 및 롤백 방법: 미확인. Migration Tool과 Release Artifact 정의 없음.

---

# 15. Performance and Scalability

## 15.1 Performance-Critical Paths

| Path ID | 처리 경로 | 병목 가능 지점 | 현재 제한 |
|---|---|---|---|
| PERF-001 | Chat Router→Tool→RAG→Response | 다중 순차 LLM Gateway RTT | 실측 총 7.94~15.96초; 호출당 약 0.9초 추정 |
| PERF-002 | RAG | Embedding + Attempt당 rerank/충분성 2회 | 최대 3 Attempt, Backoff/Cache 없음 |
| PERF-003 | DES | Python/SimPy Replication | 기본 200회, API 동기 호출, Timeout 없음 |
| PERF-004 | Inventory Risk Scan | SKU별 다중 SQL과 Forecast | 150 SKU 기준 N+1 Query 형태 |
| PERF-005 | SQLite Write | API, Realtime, Auto Thread, Simulation 동시 쓰기 | 단일 Writer, WAL 미설정 |
| PERF-006 | SPA Polling | Data/Auto 상태 1초 Poll 포함 | Client 수 증가 시 API/DB 부하 증가 |

## 15.2 Resource-Intensive Operations

- Router, RAG rerank/충분성, 최종 응답의 외부 LLM 호출
- 정책 Query Embedding과 Index Build 시 전체 문서 Embedding
- 200회 기본 DES와 Movement/Time-series 생성
- 전체 SKU Risk Scan 및 KPI 진단의 반복 SQL
- Simulation Result 전체 JSON, Movement, Time-series의 SQLite 저장·API 전송

## 15.3 Scalability Characteristics

| Component | Stateless 여부 | Scale-out 가능 여부 | 제한 사항 |
|---|---|---|---|
| CMP-001 SPA | Y | Y | API Scale에 종속 |
| CMP-002 FastAPI | 부분적 | 제한적 | Local SQLite와 Process Task/Thread |
| CMP-003 LangGraph | Request State는 Y | 제한적 가능 | Compiled Graph Cache는 안전하나 Session/DB/LLM 병목 |
| CMP-005 RAG | Read 중심 | Process별 가능 | Local FAISS 복제, Index Version 동기화 필요 |
| CMP-006 DES | 계산상 Stateless | Worker 분리 시 가능 | 현재 동기 API와 Local DB 저장 |
| CMP-008 Auto Mode | N | 현재 불가 | Process-local Thread, Leader Election 없음 |
| CMP-009 Realtime | N | 현재 불가 | Process-local Task/Subscriber |
| DS-001 SQLite | N | Scale-out 부적합 | 단일 파일 Writer/공유 Volume 문제 |

## 15.4 Known Limits

| Limit ID | 제한 | 값 | 설정 위치 | 영향 |
|---|---|---:|---|---|
| LIMIT-001 | RAG 재검색 | 2회 | `rag/retriever.py` | 최대 3 Attempt |
| LIMIT-002 | Chat History | 12 Message | `chat_store.HISTORY_TURNS` | 장기 대화 누락 |
| LIMIT-003 | Data API Page | 최대 500 Row | `api/main.py:data_rows` | 대량 Export 불가 |
| LIMIT-004 | Session List | 기본/최대 함수 기준 50 | `chat_store.py` | 오래된 Session 미노출 |
| LIMIT-005 | DES Replication | 기본 200 | `config.py` | 정확도와 Latency Trade-off |
| LIMIT-006 | Auto Action/Cycle | 기본 20 | `bb/settings.py` | Backlog 처리량 제한 |
| LIMIT-007 | Auto Cycle | 기본 15초 | `bb/settings.py` | 의사결정 지연 |
| LIMIT-008 | Lock TTL | 60초 | `bb/executor.py` | 장기 Action Lock 만료 가능 |
| LIMIT-009 | Realtime Interval | 최소 2초, 기본 8초 | `realtime.py` | Demo Event 빈도 |
| LIMIT-010 | Prompt Context Slice | History 6000자, Tool/RAG 7000자 | `agent/nodes.py` | 큰 결과 잘림 |

---

# 16. Build, Test, and Delivery

## 16.1 Build Process

```text
1. app/에서 Python 3.11 venv 생성 및 활성화
2. pip install -r requirements.txt
3. .env.example을 .env로 복사하고 실제 Secret 주입
4. 필요 시 python -m seed.generate로 SQLite Seed 생성
5. 정책 변경 시 python -m rag.index로 FAISS Index 생성
6. uvicorn api.main:app --reload로 로컬 실행

별도 Python Package Build, Frontend Bundling, Container Image Build는 정의되어 있지 않다.
```

## 16.2 Test Structure

| Test Type | 위치 | 대상 | 실행 명령 | 상태 |
|---|---|---|---|---|
| Unit Test | `app/tests` | 없음 | `pytest` | `__init__.py`만 존재, 실 Test 없음 |
| Invariant/Integration | `app/eval/harness.py` | Tool, DES, Forecast, RAG, Agent, Guardrail | `python -m eval.harness --invariant` | 존재 |
| Isolated E2E | `app/eval/run.py` | Temp DB fresh seed + 전체 60 Check | `python -m eval.run` | 존재; 보고서상 60/60 |
| LLM Quality | `app/eval/judge.py` | Faithfulness/Relevance/Negative Control | Harness 내 실행 | 존재; 외부 LLM 필요 |
| Performance | `bench_latency()` | 총 지연, Call, Token, Gateway 추정 | 전체 Harness 후 실행 | 존재 |

## 16.3 CI/CD Flow

| Step | 작업 | 도구 | 설정 파일 |
|---:|---|---|---|
| 1 | 확인된 항목 없음 | CI/CD Pipeline 없음 | 미확인 |

---

# 17. Architecture Decisions

## ADR-001 — LLM과 결정적 Tool의 책임 분리

| 항목 | 내용 |
|---|---|
| Status | Accepted |
| Context | 운영 수치·재고·상태 변경을 LLM이 생성하면 환각과 데이터 불일치 위험이 큼 |
| Decision | LLM은 Router/설명, Tool은 조회·계산·변경 담당 |
| Rationale | 재현성, 검증성, 감사 가능성 |
| Alternatives | 순수 ReAct/LLM 계산 |
| Consequences | Tool 수와 Handler 관리 부담; 응답 근거 향상 |
| Evidence | `agent/nodes.py`, `tools/` |

## ADR-002 — LangGraph 조건부 Workflow

| 항목 | 내용 |
|---|---|
| Status | Accepted |
| Context | Clarification, RAG 조건 분기, 승인 State가 필요 |
| Decision | TypedDict State와 조건 Edge 사용 |
| Rationale | 명시적인 단계·분기와 Trace |
| Alternatives | 단일 Chain, 수동 if/else Pipeline |
| Consequences | 현재 Planner/Verifier 구현은 설계 잠재력보다 단순 |
| Evidence | `agent/graph.py`, `agent/state.py` |

## ADR-003 — Adaptive Agentic RAG와 Abstain

| 항목 | 내용 |
|---|---|
| Status | Accepted |
| Context | 모든 Query에 RAG를 적용하면 지연 증가, 근거 부족 시 환각 위험 |
| Decision | Intent 기반 RAG, rerank, 충분성, 최대 2회 재검색, abstain |
| Rationale | 비용/지연과 Grounding 균형 |
| Alternatives | 단순 Top-k RAG, 모든 Query RAG |
| Consequences | 추가 LLM 왕복이 주요 Latency 원인 |
| Evidence | `rag/retriever.py`, `agent/state.py` |

## ADR-004 — DES 기반 운영 가능성 검증

| 항목 | 내용 |
|---|---|
| Status | Accepted |
| Context | 수요량 예측만으로 자원·공간·납기 병목 판단 불가 |
| Decision | Regression/이동평균 수요를 SimPy DES에 넣고 반복 분포 산출 |
| Rationale | P50/P90과 What-if 제공 |
| Alternatives | 정적 산식, Forecast 단독 |
| Consequences | CPU/응답 시간 증가, Calibration 필요 |
| Evidence | `sim/forecast.py`, `sim/des.py` |

## ADR-005 — 사용자 변경과 자동운영 변경의 이중 안전모델

| 항목 | 내용 |
|---|---|
| Status | Accepted |
| Context | 사용자 요청과 자동 이벤트의 위험·운영 특성이 다름 |
| Decision | 사용자 흐름은 Draft/Approval, Auto Mode는 Policy/Lock/Pre/Postcheck |
| Rationale | HITL과 저위험 자동화를 동시에 지원 |
| Alternatives | 모든 변경 수동 승인, 모든 변경 자동화 |
| Consequences | 두 상태머신과 실행 경로의 일관성 관리 필요 |
| Evidence | `tools/drafts.py`, `bb/executor.py` |

## ADR-006 — SQLite와 FAISS Local POC 저장소

| 항목 | 내용 |
|---|---|
| Status | Inferred |
| Context | 단일 사용자 POC의 간단한 설치와 재현 가능한 Seed 필요 |
| Decision | 업무·로그 모두 SQLite, Vector는 Local FAISS |
| Rationale | 운영 인프라 없이 빠른 구현 |
| Alternatives | PostgreSQL/pgvector, Managed Vector DB |
| Consequences | 동시성, HA, Replica, 권한 분리 제한 |
| Evidence | `config.py`, `db/database.py`, `rag/index.py` |

## ADR-007 — Process 내부 Realtime/Auto Worker

| 항목 | 내용 |
|---|---|
| Status | Inferred |
| Context | Demo에서 즉시 수요와 자동운영 상태를 보여줄 필요 |
| Decision | asyncio Task와 daemon Thread를 FastAPI Process 내부에서 시작 |
| Rationale | 별도 Broker/Worker 없이 단순 데모 |
| Alternatives | Celery/RQ/Kafka/별도 Scheduler |
| Consequences | Multiworker 중복·상태 분리·재시작 취약성 |
| Evidence | `realtime.py`, `bb/control_loop.py` |

---

# 18. Architecture Review Findings

## 18.1 Confirmed Findings

| Finding ID | 내용 | 근거 |
|---|---|---|
| FIND-001 | FastAPI가 주 SPA와 REST/SSE를 단일 Process에서 제공 | `api/main.py` |
| FIND-002 | Chat은 9개 LangGraph Node와 2개 조건 분기를 사용 | `agent/graph.py` |
| FIND-003 | AgentState, 26 Intent, 7 RAG Intent, 4 승인 Intent가 코드에 정의 | `agent/state.py` |
| FIND-004 | RAG는 FAISS→LLM rerank→충분성→최대 2회 재검색→abstain 구조 | `rag/retriever.py` |
| FIND-005 | DES는 기본 200회 반복하고 KPI/이벤트/버전을 SQLite에 저장 | `config.py`, `sim/des.py` |
| FIND-006 | 사용자 상태변경은 Draft/Approval, Auto Mode는 Policy/Lock/Transaction/Postcheck 사용 | `tools/drafts.py`, `bb/executor.py` |
| FIND-007 | SQLite 실제 DB에는 분석 시점 34개 사용자 Table이 존재 | `wms.db` Schema Inspection |
| FIND-008 | Session 최근 12개 Message와 Agent Token/Step Trace를 저장 | `chat_store.py`, `trace_store.py` |
| FIND-009 | 인증·인가 Middleware/Dependency가 없음 | API/Router 전체 검색 |
| FIND-010 | Docker/CI/Kubernetes 정의가 없음 | 저장소 파일 검색 |

## 18.2 Ambiguities

| Issue ID | 불명확한 내용 | 관련 컴포넌트 | 확인이 필요한 이유 |
|---|---|---|---|
| AMB-001 | 실제 운영 Host, Port, TLS, Reverse Proxy | DEP-001 | 배포 정의 없음 |
| AMB-002 | 사내 LLM Gateway의 Timeout/Retry/SLA/보존 | EXT-001 | SDK 호출만 확인 |
| AMB-003 | 주 UI가 SPA로 확정인지 Streamlit 병행인지 | CMP-001/CMP-012 | 두 UI 모두 존재, 문서는 SPA 중심 |
| AMB-004 | 실제 WMS Data 민감도와 개인정보 포함 여부 | DS-001 | 현재 Seed는 Demo이나 운영 연동 계획 존재 |
| AMB-005 | Production에서 Uvicorn Worker 수 | CMP-002 | Process-local State에 직접 영향 |
| AMB-006 | Trace/Audit/Chat 보존과 삭제 정책 | CMP-010/DS-001 | 자동 정리 없음 |

## 18.3 Missing Definitions

| Issue ID | 누락 항목 | 영향 | 권장 확인 사항 |
|---|---|---|---|
| MISS-001 | 인증·인가·관리자 역할 | 무단 조회/변경 | SSO, Role, 승인 권한 Matrix |
| MISS-002 | LLM Timeout/Retry/Circuit Breaker | 요청 Hang/연쇄 실패 | Client Timeout와 오류 등급 |
| MISS-003 | Production 배포·Health·Rollback | 운영 불가 | Container/VM, Probe, Release 절차 |
| MISS-004 | DB Backup/Migration/Retention | 데이터 유실·Schema Drift | Alembic 등 Migration과 Backup |
| MISS-005 | API Rate Limit와 Simulation Job Control | 자원 고갈 | Queue, Quota, Cancel, Progress |
| MISS-006 | Observability Alert와 Log 보존 | 장애 대응 지연 | SLI/SLO, Alert, 외부 Monitoring |
| MISS-007 | 개인정보/Prompt Data Policy | 규정 위반 가능 | 분류·마스킹·외부 전송 승인 |
| MISS-008 | Draft 승인자 저장과 감사 계약 | 책임 추적 불가 | approver_id, role, request_id, hash |

## 18.4 Inconsistencies

| Issue ID | 위치 A | 위치 B | 충돌 내용 | 권장 기준 |
|---|---|---|---|---|
| INC-001 | `config.py` | `.env.example` | 기본 Chat/Router 모델이 `gpt-5.4/gpt-4.1-mini` vs `gpt-5/gpt-5-mini` | Config와 Example 단일화 |
| INC-002 | `requirements.txt`, README Comment | `llm.py`, `config.py` | Claude 생성 설명과 `anthropic` 의존성이 남아 있으나 실제 코드는 OpenAI 단일 Provider | 미사용 의존/문서 제거 또는 Provider 추상화 |
| INC-003 | `docs/02` 설계 | `agent/nodes.py:planner_node` | Planner가 Tool Sequence를 계획한다고 설명되나 구현은 `[intent]` 하나만 기록 | 문서 하향 조정 또는 Planner 구현 확대 |
| INC-004 | `docs/02` Verifier 설명 | `verifier_node` | CAPA·시간·일관성 검증 설계 대비 현재는 적치 Score Range만 확인 | 업무별 Verifier Contract 구현 |
| INC-005 | RAG의 `wms_terms.md` 목적 | Router Prompt | 직전 용어 의미 되묻기를 `smalltalk`로 강제해 RAG를 우회 | 도메인 용어 감지/Policy Route 우선순위 재정의 |
| INC-006 | DES `base_date=2026-06-15` | Forecast `date.today()` | Simulation/Seed와 실시간 위험판정 시간 기준이 다름 | Clock Provider와 기준일 명시 |
| INC-007 | `tool_logs/rag_logs` Schema | Agent 실행 코드 | Chat Handler/Retriever가 이 Table을 일관되게 기록하지 않고 Trace를 재구성 | 공통 Instrumentation 적용 |
| INC-008 | 안전한 상태변경 원칙 | 직접 `/allocation/apply`, `/replenishment/apply`, 관리 API | 승인 없는 변경 경로 존재 | 위험등급·권한별 정책 문서화 |

## 18.5 Technical Risks

| Risk ID | 위험 | 발생 가능성 | 영향도 | 근거 | 권장 조치 |
|---|---|---|---|---|---|
| RISK-001 | 무인증 상태변경·데이터 노출 | High | High | 모든 Route 인증 없음 | SSO/API Gateway/RBAC 우선 적용 |
| RISK-002 | Draft APPROVED 후 부분 실패 | Medium | High | 승인·실행·완료가 별도 Transaction | Outbox/단일 상태머신 Transaction/Recovery Job |
| RISK-003 | SQLite Writer 경합·SPOF | High | High | 여러 Thread/Task, 단일 File | PostgreSQL 전환, 부하/격리 Test |
| RISK-004 | Multiworker에서 Auto/Realtime 중복 | High | High | Process-local Thread/Task | 전용 Worker, Leader Lock, Broker |
| RISK-005 | LLM 호출 순차 지연·실패 전파 | High | Medium | Timeout/Retry 없음, 최대 다중 RAG 호출 | Fast Path, 병렬화, Cache, Timeout/Breaker |
| RISK-006 | 동기 DES 자원 고갈 | Medium | High | API에서 기본 200회 직접 실행 | Job Queue, 제한, Progress/Cancel |
| RISK-007 | Simulation 오류 fail-open | Medium | High | `simulation_agent.evaluate()` | 운영은 fail-closed 또는 Risk별 정책 |
| RISK-008 | Plaintext Chat/Trace와 외부 전송 | Medium | High | DB/Prompt에 원문 | 최소수집, 마스킹, 암호화, 보존정책 |
| RISK-009 | 검증기 구현 범위 부족 | High | Medium | Verifier가 Score Range만 검사 | Intent별 Schema/Invariant 검증 |
| RISK-010 | 시간 기준 혼용 | High | Medium | Fixed Base vs `date.today()` | Clock 추상화, Simulation 기준 표시 |
| RISK-011 | Lock 무제한 재시도와 TTL | Medium | Medium | PENDING 유지, 최대 횟수 없음 | Retry Count, Backoff, DLQ, Heartbeat |
| RISK-012 | Test가 외부 LLM과 Seed에 의존 | Medium | Medium | pytest Case 없음, Harness 중심 | Unit/Contract Test, Mock LLM, CI 분리 |

## 18.6 Improvement Opportunities

| Improvement ID | 현재 상태 | 개선 제안 | 기대 효과 | 우선순위 |
|---|---|---|---|---|
| IMP-001 | 인증·권한 없음 | OIDC/JWT, RBAC, Session 소유권, 관리자 API 분리 | 보안·감사 | High |
| IMP-002 | SQLite/Process State | PostgreSQL+pgvector, Worker/Broker, Leader Election | 동시성·Scale-out | High |
| IMP-003 | LLM Client 정책 없음 | Timeout, Retry Budget, Circuit Breaker, Model Fallback | 복원력·지연 제어 | High |
| IMP-004 | 승인 부분 Transaction | Approval State Machine, approver 저장, Idempotency Key, Recovery | 데이터 일관성 | High |
| IMP-005 | 동기 DES | Async Job Queue, 결과 Cache, Replication Budget | API 가용성 | High |
| IMP-006 | 단순 Planner/Verifier | Typed Plan, Tool Contract, 업무별 Invariant/Schema | 정확성과 설명가능성 | Medium |
| IMP-007 | Semantic-only Search | BM25+Embedding Hybrid, RRF, Metadata/Version/ACL, 용어 정규화 | 검색 Recall/Precision | Medium |
| IMP-008 | Trace 체계 분리 | OpenTelemetry Trace ID, LLM/DB/Tool Span 통합 | 장애 분석 | Medium |
| IMP-009 | N+1 Risk Scan | Batch SQL/Vectorized Forecast, Cache | 성능 | Medium |
| IMP-010 | 수동 Schema 진화 | Migration Tool, Schema Version, Backup/Restore | 운영 안정성 | High |
| IMP-011 | 평가 Harness 중심 | pytest Unit/Integration, LLM Mock, CI Gate | 회귀 방지 | Medium |
| IMP-012 | 지식·Tool 책임 혼재 | 정의/조건/예외/조치와 조회/계산/검증/실행 원자화 | APS/타 도메인 재사용 | Medium |

---

# 19. Assumptions and Open Questions

## 19.1 Assumptions

| Assumption ID | 추정 내용 | 추정 근거 | 신뢰도 | 검증 방법 |
|---|---|---|---|---|
| ASM-001 | 현 배포는 단일 Process Local POC이다 | Docker/CI 없음, SQLite/Process Thread | High | 실제 실행 Script/운영 환경 확인 |
| ASM-002 | 주 사용자 UI는 FastAPI가 제공하는 SPA이다 | API가 `/`에 SPA 제공, Manual이 SPA 화면 중심 | High | 제품 Owner 확인 |
| ASM-003 | `openai_base_url` 설정 시 사내 Azure 호환 Gateway를 사용한다 | `llm.get_client()` 분기 | High | 실제 `.env` 값은 노출 없이 운영자 확인 |
| ASM-004 | 현재 DB 데이터는 Demo/Seed이며 실제 개인정보는 제한적이다 | Seed Generator와 POC 문서 | Medium | Data Classification 확인 |
| ASM-005 | Uvicorn Port는 실행 옵션 또는 기본값에 따른다 | 코드에 Port 없음 | High | 실행 명령/서비스 파일 확인 |

## 19.2 Open Questions

| Question ID | 질문 | 필요한 담당자 또는 자료 | 중요도 |
|---|---|---|---|
| Q-001 | Production 인증·승인 권한 모델은 무엇인가? | Security/Product Owner | High |
| Q-002 | 실제 WMS/ERP API와 Transaction 책임 경계는 어디인가? | WMS Owner | High |
| Q-003 | LLM Gateway의 Timeout, Retry, 데이터 보존, Model Deployment 명은 무엇인가? | AI Platform Owner | High |
| Q-004 | Chat/Trace/Audit 보존 기간과 개인정보 처리 기준은 무엇인가? | Security/Legal | High |
| Q-005 | Auto Mode에서 Simulation 실패 시 fail-open이 허용되는가? | Operations/Risk Owner | High |
| Q-006 | Allocation/Replenishment를 승인 없이 실행하는 정책은 운영 승인되었는가? | Warehouse Process Owner | High |
| Q-007 | 다중 사용자·다중 창고·다중 Instance가 목표인가? | Product/Architecture | High |
| Q-008 | Fixed `base_date`와 실시간 Clock 중 운영 기준은 무엇인가? | Product/Data Owner | Medium |
| Q-009 | Streamlit UI는 유지·폐기·테스트 도구 중 어느 위치인가? | Product Owner | Low |
| Q-010 | RAG 정책 변경 승인, 버전, Index Rebuild 책임자는 누구인가? | Knowledge Owner | Medium |

---

# 20. Diagram Requirements

이 문서를 기반으로 생성해야 할 다이어그램을 정의한다.

| Diagram ID | 다이어그램 | 목적 | 주요 대상 | 권장 형식 |
|---|---|---|---|---|
| DIA-001 | System Context | 시스템 경계와 외부 관계 | ACT-001/002, SYS-001, EXT-001 | Mermaid |
| DIA-002 | Logical Architecture | 내부 계층과 컴포넌트 관계 | CMP-001~011, DS-001~003, EXT-001 | Mermaid 또는 draw.io |
| DIA-003 | Main Sequence | Chat와 조건부 RAG 실행 순서 | FLOW-001 참여자 | Mermaid |
| DIA-004 | Data Flow | Chat/Tool/RAG/Simulation/Event 데이터 이동 | DATA-001~008, DS-001~003 | Mermaid |
| DIA-005 | Deployment Architecture | 확인된 로컬 실행·저장·외부 연결 | DEP-001~004 | draw.io |
| DIA-006 | Error and Fallback Flow | RAG Retry/Abstain과 Auto Action 실패 | ERR-N1~N10 | Mermaid |

## 20.1 Common Diagram Rules

- 기본 흐름은 왼쪽에서 오른쪽으로 표현한다.
- 동일한 계층의 컴포넌트는 같은 영역에 배치한다.
- 외부 시스템과 내부 시스템의 경계를 구분한다.
- 컴포넌트 이름은 문서의 Component ID 및 이름과 일치시킨다.
- 동기 호출은 실선으로 표현한다.
- 비동기 호출은 점선으로 표현한다.
- 데이터 저장소는 별도의 저장소 형태로 표현한다.
- 연결선에는 프로토콜, 이벤트명 또는 핵심 데이터를 표시한다.
- 확인되지 않은 연결은 다이어그램에 확정적으로 포함하지 않는다.
- 선의 교차를 최소화한다.
- 한 장에 구현 클래스, 인프라, 데이터 모델을 모두 혼합하지 않는다.
- 세부 수준이 다른 내용은 별도의 다이어그램으로 분리한다.

### DIA-004 핵심 Data Flow Definition

```yaml
diagram:
  id: DIA-004
  title: Core Data Flow
  direction: left-to-right
nodes:
  - { id: CMP-001, name: Web SPA, type: frontend }
  - { id: CMP-002, name: FastAPI, type: api }
  - { id: CMP-003, name: LangGraph Agent, type: workflow }
  - { id: CMP-004, name: WMS Tools, type: service }
  - { id: CMP-005, name: Agentic RAG, type: retrieval }
  - { id: CMP-006, name: Forecast and DES, type: simulator }
  - { id: CMP-008, name: Blackboard Auto Operation, type: scheduler }
  - { id: DS-001, name: SQLite, type: database }
  - { id: DS-002, name: FAISS and Chunk Metadata, type: vector-store }
  - { id: EXT-001, name: LLM Gateway, type: external-api }
relationships:
  - { from: CMP-001, to: CMP-002, label: ChatReq/Scenario/Approval }
  - { from: CMP-002, to: CMP-003, label: Query and recent history }
  - { from: CMP-003, to: CMP-004, label: Intent parameters }
  - { from: CMP-004, to: DS-001, label: Operational SQL }
  - { from: CMP-003, to: CMP-005, label: RAG query }
  - { from: CMP-005, to: DS-002, label: Vector candidates }
  - { from: CMP-005, to: EXT-001, label: Embedding/rerank/sufficiency }
  - { from: CMP-004, to: CMP-006, label: Forecast/What-if input }
  - { from: CMP-006, to: DS-001, label: Run/KPI/Event result }
  - { from: DS-001, to: CMP-008, label: Blackboard event and state }
  - { from: CMP-008, to: DS-001, label: Transactional action and audit }
  - { from: CMP-003, to: CMP-002, label: Final AgentState }
  - { from: CMP-002, to: CMP-001, label: Response/SSE }
```

---

# 21. Evidence Index

| Evidence ID | 파일 경로 | 관련 영역 | 확인 내용 |
|---|---|---|---|
| EVD-001 | `app/api/main.py` | API/Entry | FastAPI, DTO, Root Route, SSE, SPA Mount |
| EVD-002 | `app/bb/routes.py` | API/Auto Mode | `/api` Blackboard Endpoint |
| EVD-003 | `app/agent/graph.py` | Workflow | LangGraph Node/Edge와 invoke/stream |
| EVD-004 | `app/agent/state.py` | State | AgentState, Intent, RAG/승인 대상 |
| EVD-005 | `app/agent/nodes.py` | Agent | Router Prompt, Handler, Verifier, RAG, Response, Approval |
| EVD-006 | `app/config.py` | Configuration | 모델, 경로, DES Default |
| EVD-007 | `app/llm.py` | External Integration | OpenAI/Azure Client와 Token 계측 |
| EVD-008 | `app/db/database.py` | Data | SQLite Connection, Timeout, Schema Init |
| EVD-009 | `app/db/schema.sql` | Data | WMS/Session/Trace/Simulation Table |
| EVD-010 | `app/tools/common.py` | Tool/Data | Query Helper와 Tool Log Wrapper |
| EVD-011 | `app/tools/drafts.py` | Approval | Draft, Dry Run, 승인, 실행 |
| EVD-012 | `app/rag/chunker.py` | RAG | 7문서 Metadata와 Heading Chunk |
| EVD-013 | `app/rag/index.py` | RAG | FAISS IndexFlatIP와 Intent Filter |
| EVD-014 | `app/rag/retriever.py` | RAG | Rerank, Sufficiency, Retry, Abstain |
| EVD-015 | `app/sim/forecast.py` | Forecast | LR/MA Fallback, Risk, Order Qty |
| EVD-016 | `app/sim/des.py` | Simulation | Replication, KPI, Persistence |
| EVD-017 | `app/sim/whatif.py` | Simulation | Scenario 실행과 Delta 비교 |
| EVD-018 | `app/bb/control_loop.py` | Auto Mode | Cycle, Priority, Gate, Agent Registry |
| EVD-019 | `app/bb/executor.py` | Auto Mode | Policy/Lock/Transaction/Postcheck |
| EVD-020 | `app/bb/policy.py`, `locks.py` | Safety | Allowlist, Risk, Lock TTL |
| EVD-021 | `app/bb/simulation_agent.py` | Resilience | Cached DES Gate와 fail-open |
| EVD-022 | `app/realtime.py` | Event/SSE | 가상 수요, DB→BB→SSE |
| EVD-023 | `app/chat_store.py` | Session | Message 영속화와 최근 12개 Context |
| EVD-024 | `app/trace_store.py` | Observability | Token, Step, Trace DB |
| EVD-025 | `app/web/static/app.js` | Client | REST/SSE, Polling, 고정 User ID |
| EVD-026 | `app/ui/app.py` | Optional UI | Streamlit 직접 모듈 호출 |
| EVD-027 | `app/eval/run.py`, `harness.py`, `judge.py` | Test | Temp DB, 60 Check, Judge, Latency |
| EVD-028 | `app/requirements.txt`, `.env.example`, `.gitignore` | Build/Security | Dependency, Setting Example, Secret 제외 |
| EVD-029 | `docs/02_AGENT_ARCHITECTURE.md`, `03_RAG_DESIGN.md`, `07_FORECAST_AND_SIMULATION.md` | Design | 설계 의도와 구현 비교 |
| EVD-030 | `docs/11_EVALUATION_REPORT.md` | Quality/Performance | 60/60과 실측 Latency 보고 |

---

# 22. Analysis Coverage

## 22.1 Analyzed Files

- 지시문과 템플릿: `application_architecture_analysis_instructions.md`, `application_architecture_definition_template.md`
- 실행·설정: `app/api/main.py`, `app/config.py`, `app/llm.py`, `.env.example`, `requirements.txt`, `.gitignore`
- Agent 전체 핵심: `app/agent/graph.py`, `state.py`, `nodes.py`
- RAG 전체: `app/rag/chunker.py`, `index.py`, `retriever.py`, Root `rag/*.md` 목록과 설계 문서
- Simulation 핵심: `app/sim/forecast.py`, `des.py`, `whatif.py`, `versions.py`, `animation.py` 구조
- Tool 핵심: `tools/common.py`, `drafts.py`, Lookup/Stocking/Picking/Allocation/Replenishment/KPI 관련 함수·Route 연결
- Blackboard 핵심: `bb/routes.py`, `control_loop.py`, `actions.py`, `executor.py`, `policy.py`, `locks.py`, `simulation_agent.py`, `settings.py`, Schema와 Agent Registry 구조
- 상태·관측: `chat_store.py`, `trace_store.py`, `realtime.py`
- DB: `db/database.py`, `db/schema.sql`, `bb/schema.sql`, 실제 SQLite Table/Column Metadata(민감 Row 값은 분석하지 않음)
- UI: `web/index.html`, `web/static/app.js` API 호출 구조, `ui/app.py`
- 평가: `eval/run.py`, `harness.py`, `judge.py`, `docs/10_EVALUATION_PLAN.md`, `docs/11_EVALUATION_REPORT.md`
- 저장소 구조, Git Branch/Commit/Dirty 상태, 배포·CI 파일 존재 여부

## 22.2 Unavailable or Unanalyzed Areas

- 실제 `.env`의 Secret 값: 민감정보 보호를 위해 분석·출력하지 않음
- 사내 LLM Gateway 내부 Architecture, TLS/SLA/Retention/Retry
- Production Infra, Reverse Proxy, Container, Kubernetes, CI/CD: 파일이 존재하지 않음
- 실제 WMS/ERP/OMS 외부 시스템: 연동 코드 없음
- 데이터 Row 내용과 사용자 개인정보: Architecture 분석상 불필요하여 열람하지 않음
- 모든 CSS/HTML 시각 요소와 모든 Tool 함수의 산식 상세: 주요 호출 관계와 Architecture에 필요한 범위만 분석
- 실행 중 외부 LLM을 사용하는 전체 평가 재수행: 비용·외부 의존성 때문에 이번 분석에서는 문서와 Harness 코드 근거를 사용

## 22.3 Final Confidence Assessment

| 영역 | 신뢰도 | 사유 |
|---|---|---|
| Logical Architecture | High | 주요 Entry, Import, Graph Edge, Handler와 Repository 호출을 직접 추적 |
| Runtime Flow | High | Chat, Approval, Simulation, Auto Mode 코드를 시간 순서로 확인 |
| Data Architecture | High | DDL과 실제 DB의 34개 Table/Column Metadata 확인 |
| API Architecture | High | FastAPI Decorator와 Pydantic DTO를 AST/코드로 확인 |
| Deployment Architecture | Low | 로컬 실행만 확인되고 운영 배포 파일 없음 |
| Security Architecture | Medium-High | 인증 부재와 Secret 방식은 확인; 외부망·Gateway·운영 통제는 미확인 |
| Performance | Medium-High | 코드 병목과 보고서 실측은 확인; 현 운영 부하·동시 사용자 수는 미확인 |
| Resilience | Medium | 코드상 Error/Retry는 확인; 외부 SDK/인프라 정책은 미확인 |
| Overall | Medium-High | 애플리케이션 내부는 상세 확인, 운영 인프라와 조직 정책은 확인 필요 |

---

# Appendix A. Terminology

| 용어 | 정의 |
|---|---|
| AgentState | LangGraph 한 Run의 질의·Intent·Tool·RAG·응답·승인 상태 |
| Adaptive RAG | Intent에 따라 문서 검색을 수행하거나 생략하는 방식 |
| PRISM Rerank | 후보별 relevance/contribution/evidence span을 LLM으로 산출하는 구현 명칭 |
| Sufficient Context | 검색 근거만으로 질문에 답할 수 있는지 판단하는 Gate |
| Abstain | 근거 부족 시 정책을 생성하지 않고 답변을 거부하는 동작 |
| Draft | 실제 상태 변경 전 저장되는 승인 대기 변경안 |
| Dry Run | 실행 전 예상 Table/Field 변경과 Warning을 산출하는 단계 |
| Blackboard | Event와 공유 DB State를 중심으로 여러 Domain Agent가 Action을 제안하는 구조 |
| DES | Discrete Event Simulation; 자원·공간·시간 제약을 Event로 모사 |
| P50/P90 | 반복 Simulation 결과의 중앙/보수적 Percentile 지표 |
| Idempotency Key | 동일 자동 Action의 중복 생성을 막는 Unique Key |
| Simulation Gate | 예측 가동률과 Zone 점유를 기준으로 자동 Action 실행 여부를 판단하는 단계 |

# Appendix B. Component ID Convention

```text
ACT   사용자 또는 Actor
EXT   외부 시스템
CMP   애플리케이션 컴포넌트
DS    데이터 저장소
DATA  데이터 객체
API   Inbound API
INT   외부 연동
EVT   이벤트 또는 메시지
FLOW  실행 흐름
DEC   분기 조건
ERR   오류 흐름
DEP   배포 단위
STATE 상태
DIA   다이어그램
```
