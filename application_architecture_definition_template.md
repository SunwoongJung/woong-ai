# Application Architecture Definition

> 이 문서는 애플리케이션의 소스 코드, 설정 파일, 인프라 구성 및 실행 흐름을 분석하여 작성한다.  
> 확인되지 않은 내용은 임의로 단정하지 않고 `미확인`, `추정`, `확인 필요`로 명시한다.

---

# 0. Document Information

| 항목 | 내용 |
|---|---|
| Application Name | `{애플리케이션 이름}` |
| Repository / Project Path | `{저장소 또는 분석 경로}` |
| Document Version | `1.0` |
| Analysis Date | `{YYYY-MM-DD}` |
| Analyzed Commit / Branch | `{커밋 ID 또는 브랜치}` |
| Runtime Environment | `{Local / Dev / Staging / Production}` |
| Primary Language | `{Python / Java / C# / JavaScript 등}` |
| Main Framework | `{FastAPI / Spring Boot / Langflow / .NET 등}` |
| Deployment Type | `{VM / Docker / Kubernetes / Serverless 등}` |
| Confidence Level | `{High / Medium / Low}` |

---

# 1. Executive Summary

## 1.1 Application Purpose

애플리케이션이 해결하는 비즈니스 또는 기술적 목적을 설명한다.

```text
{예시:
사용자가 자연어로 질문하면 질문 유형을 분류하고,
SQL Agent 또는 RAG Agent를 통해 데이터를 조회한 뒤
최종 답변을 생성하는 사내 AI Chat Application이다.}
```

## 1.2 Primary Users

| 사용자 또는 시스템 | 사용 목적 | 접근 방식 |
|---|---|---|
| `{사용자 유형}` | `{사용 목적}` | `{Web UI / API / Batch}` |

## 1.3 Core Capabilities

| ID | 기능 | 설명 |
|---|---|---|
| CAP-001 | `{기능명}` | `{기능 설명}` |
| CAP-002 | `{기능명}` | `{기능 설명}` |

## 1.4 Architecture Summary

애플리케이션의 전체 구조를 5~10문장으로 요약한다.

```text
{클라이언트, API, 핵심 처리 모듈, 데이터 저장소,
외부 시스템 및 주요 데이터 흐름을 요약한다.}
```

---

# 2. Scope and Boundaries

## 2.1 Included Scope

- `{분석에 포함되는 기능 또는 시스템}`
- `{분석에 포함되는 배포 환경}`
- `{분석에 포함되는 외부 인터페이스}`

## 2.2 Excluded Scope

- `{분석에서 제외된 기능}`
- `{확인할 수 없는 인프라}`
- `{별도 시스템에서 관리되는 기능}`

## 2.3 System Boundary

| 구분 | 대상 |
|---|---|
| 내부 구성요소 | `{애플리케이션이 직접 소유하거나 관리하는 구성요소}` |
| 외부 구성요소 | `{외부 API, DB, LLM, 인증 서버, 메시징 시스템 등}` |
| 사용자 접점 | `{Web UI, REST API, CLI, Scheduler 등}` |

---

# 3. Technology Stack

## 3.1 Application Stack

| 영역 | 기술 | 버전 | 사용 목적 | 근거 |
|---|---|---:|---|---|
| Language | `{기술}` | `{버전}` | `{목적}` | `{파일 경로}` |
| Framework | `{기술}` | `{버전}` | `{목적}` | `{파일 경로}` |
| Database | `{기술}` | `{버전}` | `{목적}` | `{파일 경로}` |
| Message Queue | `{기술}` | `{버전}` | `{목적}` | `{파일 경로}` |
| Vector DB | `{기술}` | `{버전}` | `{목적}` | `{파일 경로}` |
| LLM | `{모델 또는 서비스}` | `{버전}` | `{목적}` | `{파일 경로}` |
| Frontend | `{기술}` | `{버전}` | `{목적}` | `{파일 경로}` |

## 3.2 Infrastructure Stack

| 영역 | 기술 | 용도 | 근거 |
|---|---|---|---|
| Runtime | `{VM / Docker / Kubernetes}` | `{용도}` | `{파일 경로}` |
| Storage | `{S3 / NAS / Local Disk}` | `{용도}` | `{파일 경로}` |
| Monitoring | `{Phoenix / Prometheus 등}` | `{용도}` | `{파일 경로}` |
| CI/CD | `{Jenkins / GitLab CI 등}` | `{용도}` | `{파일 경로}` |

---

# 4. Repository Structure

## 4.1 Directory Overview

```text
{프로젝트의 주요 디렉터리 구조만 작성한다.

예시:
project/
├─ app/
│  ├─ api/
│  ├─ services/
│  ├─ agents/
│  └─ models/
├─ config/
├─ tests/
├─ deployment/
└─ requirements.txt
}
```

## 4.2 Directory Responsibilities

| 경로 | 역할 | 주요 파일 |
|---|---|---|
| `{경로}` | `{역할}` | `{파일 목록}` |

## 4.3 Application Entry Points

| 실행 유형 | 진입점 | 실행 명령 또는 호출 방식 | 근거 |
|---|---|---|---|
| Web/API | `{파일 또는 클래스}` | `{실행 명령}` | `{파일 경로}` |
| Batch | `{파일 또는 클래스}` | `{실행 명령}` | `{파일 경로}` |
| Worker | `{파일 또는 클래스}` | `{실행 명령}` | `{파일 경로}` |
| Scheduler | `{파일 또는 클래스}` | `{실행 명령}` | `{파일 경로}` |

---

# 5. System Context

## 5.1 Actors and External Systems

| ID | 유형 | 이름 | 역할 | 애플리케이션과의 관계 |
|---|---|---|---|---|
| ACT-001 | User | `{이름}` | `{역할}` | `{관계}` |
| EXT-001 | External System | `{이름}` | `{역할}` | `{관계}` |

## 5.2 Context Relationships

| From | To | 방향 | 목적 | 프로토콜 | 데이터 |
|---|---|---|---|---|---|
| `{시작점}` | `{도착점}` | `{단방향/양방향}` | `{목적}` | `{REST/JDBC 등}` | `{전달 데이터}` |

## 5.3 System Context Diagram Definition

아래 형식으로 다이어그램에 포함할 대상만 정의한다.

```yaml
diagram:
  id: system-context
  title: System Context
  direction: left-to-right

actors:
  - id: user
    name: "{사용자}"
    description: "{역할}"

systems:
  - id: target-system
    name: "{대상 애플리케이션}"
    type: internal
    description: "{주요 역할}"

  - id: external-system
    name: "{외부 시스템}"
    type: external
    description: "{주요 역할}"

relationships:
  - from: user
    to: target-system
    label: "{요청 내용}"
    protocol: "{HTTPS 등}"
```

---

# 6. Logical Architecture

## 6.1 Architecture Layers

| Layer ID | 계층 | 책임 | 주요 구성요소 |
|---|---|---|---|
| LAYER-01 | Client Layer | `{책임}` | `{구성요소}` |
| LAYER-02 | API Layer | `{책임}` | `{구성요소}` |
| LAYER-03 | Application Layer | `{책임}` | `{구성요소}` |
| LAYER-04 | Domain / Agent Layer | `{책임}` | `{구성요소}` |
| LAYER-05 | Data Layer | `{책임}` | `{구성요소}` |
| LAYER-06 | External Integration | `{책임}` | `{구성요소}` |

## 6.2 Component Inventory

모든 주요 컴포넌트에는 고유한 ID를 부여한다.

| Component ID | 이름 | 계층 | 유형 | 책임 | 입력 | 출력 | 근거 |
|---|---|---|---|---|---|---|---|
| CMP-001 | `{컴포넌트}` | `{계층}` | `{API/Service/Agent/DB}` | `{책임}` | `{입력}` | `{출력}` | `{파일 경로}` |

## 6.3 Component Details

### CMP-001 — `{Component Name}`

| 항목 | 내용 |
|---|---|
| Responsibility | `{주요 책임}` |
| Source Location | `{파일 또는 디렉터리 경로}` |
| Entry Method | `{함수, 클래스, API endpoint}` |
| Input | `{입력 데이터 또는 객체}` |
| Output | `{출력 데이터 또는 객체}` |
| Dependencies | `{의존 컴포넌트}` |
| State Change | `{상태 변경 내용 또는 없음}` |
| External Calls | `{외부 호출}` |
| Timeout | `{설정값 또는 미확인}` |
| Retry | `{설정값 또는 미확인}` |
| Error Handling | `{오류 처리 방법}` |
| Observability | `{로그, 메트릭, 트레이스}` |
| Confidence | `{Confirmed / Inferred / Unknown}` |

#### Processing Logic

1. `{처리 단계}`
2. `{처리 단계}`
3. `{처리 단계}`

#### Evidence

- `{파일 경로}:{라인 또는 함수명}`
- `{설정 파일 또는 코드 근거}`

> 위 컴포넌트 상세 형식을 모든 핵심 컴포넌트에 반복 적용한다.

## 6.4 Component Relationships

| From Component | To Component | 호출 방식 | 동기 여부 | 전달 데이터 | 조건 | 근거 |
|---|---|---|---|---|---|---|
| `{CMP-ID}` | `{CMP-ID}` | `{Method/API/Event}` | `{Sync/Async}` | `{데이터}` | `{분기 조건}` | `{파일 경로}` |

## 6.5 Logical Architecture Diagram Definition

```yaml
diagram:
  id: logical-architecture
  title: Logical Architecture
  direction: left-to-right

groups:
  - id: client-layer
    name: Client Layer

  - id: application-layer
    name: Application Layer

  - id: agent-layer
    name: Agent Layer

  - id: data-layer
    name: Data Layer

components:
  - id: CMP-001
    name: "{컴포넌트명}"
    group: client-layer
    type: frontend
    description: "{역할}"

  - id: CMP-002
    name: "{컴포넌트명}"
    group: application-layer
    type: service
    description: "{역할}"

relationships:
  - from: CMP-001
    to: CMP-002
    label: "{요청 또는 데이터}"
    protocol: "{REST 등}"
    mode: synchronous
```

---

# 7. Runtime Processing Flows

핵심 사용자 시나리오마다 별도의 Flow ID를 부여한다.

## 7.1 Flow Inventory

| Flow ID | 흐름명 | 시작점 | 종료점 | 설명 |
|---|---|---|---|---|
| FLOW-001 | `{흐름명}` | `{시작점}` | `{종료점}` | `{설명}` |

## 7.2 FLOW-001 — `{Flow Name}`

### Trigger

```text
{사용자 요청, API 호출, 스케줄 실행, 이벤트 발생 등}
```

### Preconditions

- `{선행 조건}`
- `{필요한 상태 또는 데이터}`

### Main Flow

| Step | From | To | 처리 내용 | 입력 | 출력 | 동기 여부 |
|---:|---|---|---|---|---|---|
| 1 | `{컴포넌트}` | `{컴포넌트}` | `{처리 내용}` | `{입력}` | `{출력}` | `{Sync/Async}` |

### Decision Points

| Decision ID | 위치 | 조건 | True 경로 | False 경로 |
|---|---|---|---|---|
| DEC-001 | `{컴포넌트}` | `{조건}` | `{경로}` | `{경로}` |

### Alternative Flows

| Alternative ID | 발생 조건 | 처리 |
|---|---|---|
| ALT-001 | `{조건}` | `{대체 처리}` |

### Error Flows

| Error ID | 발생 위치 | 오류 조건 | 처리 방식 | 사용자 영향 |
|---|---|---|---|---|
| ERR-001 | `{컴포넌트}` | `{오류}` | `{Retry/Fallback/Fail}` | `{영향}` |

### Final Result

```text
{정상 완료 시 생성되는 결과와 저장되는 상태}
```

### Sequence Diagram Definition

```yaml
sequence:
  id: FLOW-001
  title: "{Flow Name}"

participants:
  - id: user
    name: User
    type: actor

  - id: ui
    name: "{UI 이름}"
    type: component

  - id: api
    name: "{API 이름}"
    type: component

steps:
  - order: 1
    from: user
    to: ui
    message: "{사용자 요청}"
    mode: synchronous

  - order: 2
    from: ui
    to: api
    message: "{API 요청}"
    protocol: HTTPS
    mode: synchronous

  - order: 3
    type: alt
    condition: "{분기 조건}"
    true_flow: "{처리}"
    false_flow: "{처리}"
```

> 핵심 처리 흐름별로 위 섹션을 반복한다.

---

# 8. Data Architecture

## 8.1 Data Store Inventory

| Data Store ID | 이름 | 유형 | 저장 데이터 | 접근 컴포넌트 | 영속성 | 근거 |
|---|---|---|---|---|---|---|
| DS-001 | `{이름}` | `{RDB/Vector DB/Object Storage}` | `{데이터}` | `{컴포넌트}` | `{Permanent/Temporary}` | `{파일 경로}` |

## 8.2 Core Data Objects

| Data Object ID | 이름 | 설명 | 생성 주체 | 사용 주체 | 저장 위치 |
|---|---|---|---|---|---|
| DATA-001 | `{객체명}` | `{설명}` | `{컴포넌트}` | `{컴포넌트}` | `{저장소}` |

## 8.3 Data Object Structure

### DATA-001 — `{Data Object Name}`

```json
{
  "field_name": "{type 또는 예시}",
  "nested_object": {
    "field": "{value}"
  }
}
```

| Field | Type | Required | Description | Source |
|---|---|---|---|---|
| `{필드}` | `{타입}` | `{Y/N}` | `{설명}` | `{생성 컴포넌트}` |

## 8.4 Data Lifecycle

| Data | 생성 | 조회 | 수정 | 삭제 | 보존 기간 |
|---|---|---|---|---|---|
| `{데이터}` | `{주체}` | `{주체}` | `{주체}` | `{주체}` | `{기간/미확인}` |

## 8.5 Data Flow Definition

```yaml
data_flow:
  - id: DF-001
    data: "{데이터 이름}"
    from: "{생성 컴포넌트}"
    to: "{수신 컴포넌트}"
    operation: "{Create/Read/Update/Delete/Transform}"
    storage: "{저장 위치 또는 없음}"
    contains_sensitive_data: "{yes/no/unknown}"
```

---

# 9. API and Interface Architecture

## 9.1 Inbound APIs

| API ID | Method | Path | 호출 주체 | 요청 | 응답 | 인증 | 구현 위치 |
|---|---|---|---|---|---|---|---|
| API-001 | `{GET/POST}` | `{경로}` | `{호출자}` | `{요청 모델}` | `{응답 모델}` | `{인증}` | `{파일 경로}` |

## 9.2 Outbound APIs

| Integration ID | 대상 시스템 | Endpoint 또는 Client | 목적 | Timeout | Retry | 인증 | 근거 |
|---|---|---|---|---|---|---|---|
| INT-001 | `{외부 시스템}` | `{주소 또는 client}` | `{목적}` | `{값}` | `{값}` | `{방식}` | `{파일 경로}` |

## 9.3 Events and Messages

| Event ID | 이름 | Producer | Consumer | Payload | Broker | 전달 보장 |
|---|---|---|---|---|---|---|
| EVT-001 | `{이벤트}` | `{생성자}` | `{소비자}` | `{Payload}` | `{Kafka 등}` | `{At least once 등}` |

## 9.4 Interface Contracts

각 주요 API 또는 이벤트의 실제 스키마를 작성한다.

```json
{
  "request_example": {},
  "response_example": {}
}
```

---

# 10. State and Session Management

## 10.1 State Inventory

| State ID | 상태명 | 범위 | 생성 주체 | 저장 위치 | 만료 조건 |
|---|---|---|---|---|---|
| STATE-001 | `{상태명}` | `{Request/Session/Global}` | `{컴포넌트}` | `{메모리/DB}` | `{조건}` |

## 10.2 State Transition

| Current State | Trigger | Processing Component | Next State | Stored Data |
|---|---|---|---|---|
| `{상태}` | `{이벤트}` | `{컴포넌트}` | `{다음 상태}` | `{저장 데이터}` |

## 10.3 Concurrency Considerations

- `{동시 요청 처리 방식}`
- `{공유 상태 존재 여부}`
- `{Lock 또는 Transaction 사용 여부}`
- `{Race Condition 가능성}`
- `{멀티 인스턴스 실행 시 상태 공유 방식}`

## 10.4 State Diagram Definition

```yaml
states:
  - id: received
    name: Request Received

  - id: processing
    name: Processing

  - id: completed
    name: Completed

transitions:
  - from: received
    to: processing
    trigger: "{처리 시작}"

  - from: processing
    to: completed
    trigger: "{처리 성공}"
```

---

# 11. Deployment Architecture

## 11.1 Environments

| Environment | 목적 | 실행 위치 | 데이터 저장소 | 외부 연동 |
|---|---|---|---|---|
| Local | `{목적}` | `{위치}` | `{저장소}` | `{외부 연동}` |
| Development | `{목적}` | `{위치}` | `{저장소}` | `{외부 연동}` |
| Production | `{목적}` | `{위치}` | `{저장소}` | `{외부 연동}` |

## 11.2 Deployment Units

| Deployment ID | 이름 | 유형 | Runtime | Port | Replica | Resource |
|---|---|---|---|---:|---:|---|
| DEP-001 | `{서비스}` | `{Container/Process/VM}` | `{Runtime}` | `{Port}` | `{수}` | `{CPU/Memory}` |

## 11.3 Network Structure

| Source | Destination | Port | Protocol | Direction | Purpose |
|---|---|---:|---|---|---|
| `{출발지}` | `{목적지}` | `{포트}` | `{TCP/HTTPS}` | `{Inbound/Outbound}` | `{목적}` |

## 11.4 Configuration and Secrets

| 설정 | 저장 위치 | 주입 방식 | 민감정보 여부 | 기본값 |
|---|---|---|---|---|
| `{환경변수}` | `{파일/Vault}` | `{ENV/ConfigMap}` | `{Y/N}` | `{값 또는 없음}` |

민감한 실제 값은 문서에 기록하지 않는다.

## 11.5 Deployment Diagram Definition

```yaml
diagram:
  id: deployment-architecture
  title: Deployment Architecture
  direction: left-to-right

zones:
  - id: client-zone
    name: Client Network

  - id: application-zone
    name: Application Server

  - id: data-zone
    name: Data Network

nodes:
  - id: user-pc
    name: User PC
    zone: client-zone
    type: client

  - id: app-server
    name: Application Server
    zone: application-zone
    type: vm

  - id: database
    name: Database
    zone: data-zone
    type: database

deployments:
  - component: "{CMP-ID}"
    node: app-server

connections:
  - from: user-pc
    to: app-server
    protocol: HTTPS
    port: 443

  - from: app-server
    to: database
    protocol: JDBC
    port: "{포트}"
```

---

# 12. Security Architecture

## 12.1 Authentication and Authorization

| 구간 | 인증 방식 | 인가 방식 | 구현 위치 | 미확인 사항 |
|---|---|---|---|---|
| User → Application | `{방식}` | `{방식}` | `{파일 경로}` | `{사항}` |

## 12.2 Sensitive Data

| 데이터 | 민감도 | 저장 여부 | 암호화 | 마스킹 | 접근 주체 |
|---|---|---|---|---|---|
| `{데이터}` | `{등급}` | `{Y/N}` | `{방식}` | `{방식}` | `{주체}` |

## 12.3 Security Controls

- `{TLS 적용 여부}`
- `{입력값 검증}`
- `{SQL Injection 방지}`
- `{Prompt Injection 대응}`
- `{Secret 관리}`
- `{접근 로그}`
- `{권한 최소화}`
- `{파일 업로드 검증}`
- `{Presigned URL 만료 및 접근 제한}`

## 12.4 Identified Security Risks

| Risk ID | 위험 | 영향 | 현재 통제 | 개선 필요 |
|---|---|---|---|---|
| SEC-001 | `{위험}` | `{영향}` | `{통제}` | `{개선}` |

---

# 13. Error Handling and Resilience

## 13.1 Error Handling Matrix

| Component | Failure Type | Detection | Retry | Fallback | Final Behavior |
|---|---|---|---|---|---|
| `{컴포넌트}` | `{오류}` | `{감지 방법}` | `{정책}` | `{대체 처리}` | `{최종 동작}` |

## 13.2 Timeout and Retry Policy

| Integration | Timeout | Max Retry | Backoff | Retry Condition |
|---|---:|---:|---|---|
| `{대상}` | `{초}` | `{횟수}` | `{방식}` | `{조건}` |

## 13.3 Single Points of Failure

| SPOF ID | 대상 | 장애 영향 | 현재 대응 | 권장 개선 |
|---|---|---|---|---|
| SPOF-001 | `{대상}` | `{영향}` | `{대응}` | `{개선}` |

## 13.4 Data Consistency

- Transaction 경계: `{내용}`
- 중복 요청 처리: `{내용}`
- Idempotency: `{내용}`
- 부분 실패 처리: `{내용}`
- 보상 처리: `{내용}`

---

# 14. Observability and Operations

## 14.1 Logging

| Log Type | 생성 위치 | 포함 정보 | 저장 위치 | 보존 기간 |
|---|---|---|---|---|
| Application Log | `{위치}` | `{내용}` | `{저장소}` | `{기간}` |

## 14.2 Metrics

| Metric ID | 메트릭 | 생성 위치 | 목적 | Alert 기준 |
|---|---|---|---|---|
| METRIC-001 | `{메트릭}` | `{위치}` | `{목적}` | `{기준}` |

## 14.3 Distributed Tracing

- Trace 도구: `{도구 또는 미사용}`
- Trace ID 전달 방식: `{방식}`
- LLM 호출 추적: `{방식}`
- DB 호출 추적: `{방식}`

## 14.4 Health Checks

| Endpoint 또는 Check | 대상 | 정상 조건 | 실패 시 처리 |
|---|---|---|---|
| `{경로}` | `{서비스}` | `{조건}` | `{처리}` |

## 14.5 Operational Procedures

- 애플리케이션 시작 방법: `{내용}`
- 애플리케이션 종료 방법: `{내용}`
- 장애 확인 방법: `{내용}`
- 로그 확인 위치: `{내용}`
- 설정 변경 방법: `{내용}`
- 배포 및 롤백 방법: `{내용}`

---

# 15. Performance and Scalability

## 15.1 Performance-Critical Paths

| Path ID | 처리 경로 | 병목 가능 지점 | 현재 제한 |
|---|---|---|---|
| PERF-001 | `{경로}` | `{병목}` | `{제한}` |

## 15.2 Resource-Intensive Operations

- `{LLM 호출}`
- `{대용량 SQL 조회}`
- `{파일 파싱}`
- `{Vector Search}`
- `{이미지 생성 또는 처리}`

## 15.3 Scalability Characteristics

| Component | Stateless 여부 | Scale-out 가능 여부 | 제한 사항 |
|---|---|---|---|
| `{컴포넌트}` | `{Y/N}` | `{Y/N}` | `{제한}` |

## 15.4 Known Limits

| Limit ID | 제한 | 값 | 설정 위치 | 영향 |
|---|---|---:|---|---|
| LIMIT-001 | `{Timeout/Token/Row 등}` | `{값}` | `{파일}` | `{영향}` |

---

# 16. Build, Test, and Delivery

## 16.1 Build Process

```text
{빌드 또는 패키징 절차}
```

## 16.2 Test Structure

| Test Type | 위치 | 대상 | 실행 명령 | 상태 |
|---|---|---|---|---|
| Unit Test | `{경로}` | `{대상}` | `{명령}` | `{존재/미확인}` |
| Integration Test | `{경로}` | `{대상}` | `{명령}` | `{존재/미확인}` |
| E2E Test | `{경로}` | `{대상}` | `{명령}` | `{존재/미확인}` |

## 16.3 CI/CD Flow

| Step | 작업 | 도구 | 설정 파일 |
|---:|---|---|---|
| 1 | `{작업}` | `{도구}` | `{파일}` |

---

# 17. Architecture Decisions

## ADR-001 — `{Decision Title}`

| 항목 | 내용 |
|---|---|
| Status | `{Accepted / Proposed / Deprecated / Inferred}` |
| Context | `{문제 또는 배경}` |
| Decision | `{선택된 방식}` |
| Rationale | `{선택 이유}` |
| Alternatives | `{대안}` |
| Consequences | `{장점과 단점}` |
| Evidence | `{코드, 설정 또는 문서 근거}` |

> 명시적인 ADR이 없더라도 코드 구조상 분명하게 드러나는 결정은 `Inferred`로 작성한다.

---

# 18. Architecture Review Findings

## 18.1 Confirmed Findings

| Finding ID | 내용 | 근거 |
|---|---|---|
| FIND-001 | `{확인된 내용}` | `{파일 경로}` |

## 18.2 Ambiguities

| Issue ID | 불명확한 내용 | 관련 컴포넌트 | 확인이 필요한 이유 |
|---|---|---|---|
| AMB-001 | `{내용}` | `{대상}` | `{이유}` |

## 18.3 Missing Definitions

| Issue ID | 누락 항목 | 영향 | 권장 확인 사항 |
|---|---|---|---|
| MISS-001 | `{누락}` | `{영향}` | `{확인 사항}` |

## 18.4 Inconsistencies

| Issue ID | 위치 A | 위치 B | 충돌 내용 | 권장 기준 |
|---|---|---|---|---|
| INC-001 | `{파일/명칭}` | `{파일/명칭}` | `{충돌}` | `{권장}` |

## 18.5 Technical Risks

| Risk ID | 위험 | 발생 가능성 | 영향도 | 근거 | 권장 조치 |
|---|---|---|---|---|---|
| RISK-001 | `{위험}` | `{High/Medium/Low}` | `{High/Medium/Low}` | `{근거}` | `{조치}` |

## 18.6 Improvement Opportunities

| Improvement ID | 현재 상태 | 개선 제안 | 기대 효과 | 우선순위 |
|---|---|---|---|---|
| IMP-001 | `{현재 상태}` | `{개선}` | `{효과}` | `{High/Medium/Low}` |

---

# 19. Assumptions and Open Questions

## 19.1 Assumptions

추정한 내용은 반드시 근거와 함께 기록한다.

| Assumption ID | 추정 내용 | 추정 근거 | 신뢰도 | 검증 방법 |
|---|---|---|---|---|
| ASM-001 | `{추정}` | `{근거}` | `{High/Medium/Low}` | `{방법}` |

## 19.2 Open Questions

| Question ID | 질문 | 필요한 담당자 또는 자료 | 중요도 |
|---|---|---|---|
| Q-001 | `{질문}` | `{대상}` | `{High/Medium/Low}` |

---

# 20. Diagram Requirements

이 문서를 기반으로 생성해야 할 다이어그램을 정의한다.

| Diagram ID | 다이어그램 | 목적 | 주요 대상 | 권장 형식 |
|---|---|---|---|---|
| DIA-001 | System Context | 시스템 경계와 외부 관계 | 사용자, 대상 시스템, 외부 시스템 | Mermaid |
| DIA-002 | Logical Architecture | 내부 계층과 컴포넌트 관계 | 주요 컴포넌트 | Mermaid 또는 draw.io |
| DIA-003 | Main Sequence | 대표 요청의 실행 순서 | 핵심 컴포넌트 | Mermaid |
| DIA-004 | Data Flow | 핵심 데이터 이동과 변환 | 데이터 객체, 저장소 | Mermaid |
| DIA-005 | Deployment Architecture | 실제 실행·배포 구조 | 서버, 컨테이너, DB, 네트워크 | draw.io |
| DIA-006 | Error and Fallback Flow | 오류·재시도·대체 흐름 | 외부 연동, Agent, DB | Mermaid |

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

---

# 21. Evidence Index

분석에 활용한 핵심 파일을 정리한다.

| Evidence ID | 파일 경로 | 관련 영역 | 확인 내용 |
|---|---|---|---|
| EVD-001 | `{파일 경로}` | `{컴포넌트/API/배포}` | `{확인 내용}` |

---

# 22. Analysis Coverage

## 22.1 Analyzed Files

- `{파일 또는 디렉터리}`
- `{파일 또는 디렉터리}`

## 22.2 Unavailable or Unanalyzed Areas

- `{접근할 수 없었던 파일}`
- `{분석하지 못한 인프라}`
- `{외부 저장소 또는 시스템}`

## 22.3 Final Confidence Assessment

| 영역 | 신뢰도 | 사유 |
|---|---|---|
| Logical Architecture | `{High/Medium/Low}` | `{사유}` |
| Runtime Flow | `{High/Medium/Low}` | `{사유}` |
| Data Architecture | `{High/Medium/Low}` | `{사유}` |
| Deployment Architecture | `{High/Medium/Low}` | `{사유}` |
| Security Architecture | `{High/Medium/Low}` | `{사유}` |

---

# Appendix A. Terminology

| 용어 | 정의 |
|---|---|
| `{용어}` | `{정의}` |

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
