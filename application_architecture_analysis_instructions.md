# 애플리케이션 아키텍처 분석 지시문

제공된 애플리케이션의 소스 코드, 설정 파일, 문서, 배포 파일 및 디렉터리 구조를 분석하여 `Application Architecture Definition` Markdown 템플릿을 작성하라.

최종 결과는 하나의 완성된 Markdown 문서로 출력한다.

## 1. 분석 목표

다음 내용을 코드와 설정 파일을 근거로 파악한다.

1. 애플리케이션의 목적과 주요 기능
2. 시스템 경계와 외부 연동
3. 주요 계층과 컴포넌트
4. 컴포넌트 간 호출 관계
5. 핵심 요청의 실행 순서
6. 데이터 객체와 저장 위치
7. API, 이벤트 및 메시지 인터페이스
8. 상태와 세션 관리 방식
9. 실제 배포 및 네트워크 구성
10. 인증, 인가 및 민감정보 처리
11. 오류 처리, 재시도 및 fallback
12. 로그, 메트릭 및 추적 구조
13. 성능 병목과 확장성
14. 테스트, 빌드 및 배포 방식
15. 누락, 불일치, 위험 및 개선 사항

## 2. 필수 분석 대상

다음 파일이 존재하면 반드시 분석한다.

- README 및 프로젝트 문서
- 패키지 및 의존성 파일
  - `requirements.txt`
  - `pyproject.toml`
  - `package.json`
  - `pom.xml`
  - `build.gradle`
  - `.csproj`
- 애플리케이션 진입 파일
- API Router 또는 Controller
- Service, Component, Agent, Repository
- 데이터 모델과 DTO
- SQL 또는 ORM 정의
- 환경설정 파일
- `.env.example`
- Dockerfile
- Docker Compose
- Kubernetes Manifest
- CI/CD Pipeline
- 테스트 코드
- Langflow 또는 Workflow 정의
- 프롬프트 템플릿
- 외부 API Client
- 로깅 및 모니터링 설정

## 3. 분석 원칙

### 3.1 추측 금지

코드나 설정에서 확인되지 않은 내용을 사실처럼 작성하지 마라.

확인 수준을 다음과 같이 구분한다.

- `Confirmed`: 코드나 설정에서 직접 확인됨
- `Inferred`: 여러 코드 흐름을 종합하여 추정됨
- `Unknown`: 확인할 수 없음

추정한 내용에는 반드시 다음을 기록한다.

- 추정 내용
- 추정 근거
- 신뢰도
- 검증 방법

### 3.2 근거 기록

주요 결론에는 가능한 한 다음 근거를 포함한다.

```text
파일 경로
클래스명
함수명
설정 키
API Path
환경변수명
```

가능하다면 다음 형식을 사용한다.

```text
app/services/query_service.py
- QueryService.execute()
- QueryService._route_request()
```

코드 전체를 길게 복사하지 말고 근거가 되는 위치와 동작을 요약한다.

### 3.3 실제 호출 흐름 추적

파일 이름이나 클래스 이름만 보고 관계를 추정하지 마라.

다음을 실제 코드에서 추적한다.

1. 진입점
2. 함수 또는 메서드 호출
3. 조건 분기
4. 외부 시스템 호출
5. 상태 저장
6. 반환 값
7. 예외 처리

동적 호출, Dependency Injection, Factory, Registry, Reflection 또는 Workflow Engine이 사용된다면 해당 연결 방식도 설명한다.

### 3.4 명칭 통일

동일한 대상이 코드 위치에 따라 다른 명칭으로 불리는 경우 다음과 같이 기록한다.

```text
Canonical Name: Intent Router
Aliases:
- Question Router
- Route Classifier
- Topic Router
```

다이어그램과 컴포넌트 표에서는 Canonical Name만 사용한다.

### 3.5 민감정보 보호

다음 값은 출력하지 마라.

- 실제 비밀번호
- API Key
- Access Token
- Secret Key
- 개인정보
- 실제 Connection String의 비밀번호
- Presigned URL 전체 값

민감한 값은 다음처럼 표시한다.

```text
DATABASE_PASSWORD={REDACTED}
API_KEY={REDACTED}
```

## 4. 컴포넌트 식별 기준

다음 중 독립적인 책임을 수행하는 대상만 주요 컴포넌트로 분류한다.

- UI 또는 Client
- API Gateway 또는 API Server
- Controller 또는 Router
- Application Service
- Domain Service
- Agent
- Workflow Component
- State Manager
- Repository
- Database
- Vector Database
- Object Storage
- External LLM
- External API
- Message Broker
- Scheduler 또는 Worker
- Monitoring System

단순 Utility 함수나 데이터 클래스는 별도 컴포넌트로 과도하게 분리하지 않는다.

## 5. 실행 흐름 분석 기준

사용자가 실제로 사용하는 핵심 시나리오를 우선 식별한다.

예시:

- 사용자 질문 처리
- 로그인
- 파일 업로드
- SQL 실행
- RAG 검색
- 배치 실행
- 데이터 동기화
- 오류 발생 후 재처리

각 흐름에는 다음을 기록한다.

- Trigger
- Preconditions
- Main Flow
- Decision Points
- Alternative Flow
- Error Flow
- Final Result
- State Change
- 외부 시스템 호출
- 저장되는 데이터

단순 함수 목록이 아니라 시간 순서가 드러나도록 작성한다.

## 6. 데이터 분석 기준

다음 데이터를 식별한다.

- API Request 및 Response
- 세션 상태
- Workflow State
- Domain Entity
- DB Table 또는 Collection
- Vector Document
- 파일 또는 Object Storage 객체
- 이벤트 Payload
- LLM Prompt 및 Response
- 캐시 데이터

주요 JSON, DTO 또는 State 객체는 실제 필드를 기반으로 예시 구조를 작성한다.

필드가 너무 많으면 핵심 필드만 작성하고 생략 사실을 명시한다.

## 7. 배포 구조 분석 기준

배포 파일이 존재하면 다음을 확인한다.

- 실행 프로세스
- 서버 또는 컨테이너
- Port
- Volume
- Network
- 환경변수
- Secret 주입
- Replica
- Resource Limit
- Health Check
- 외부 연결
- 데이터 저장소 위치

배포 파일이 없다면 코드만으로 배포 방식을 확정하지 말고 `미확인`으로 작성한다.

## 8. 보안 분석 기준

다음 내용을 확인한다.

- 인증
- 인가
- 사용자 입력 검증
- SQL Injection 방지
- 파일 업로드 검증
- Prompt Injection 방어
- Secret 관리
- HTTPS 또는 TLS
- 접근 로그
- Presigned URL 처리
- 개인정보 또는 민감 데이터 저장
- 관리자 기능 보호

보안상 문제가 있다고 판단할 경우 근거와 영향 범위를 함께 작성한다.

## 9. 아키텍처 리뷰 기준

분석이 끝난 후 다음을 별도 섹션으로 작성한다.

### Confirmed Findings

코드에서 명확하게 확인된 주요 구조

### Ambiguities

코드만으로 판단하기 어려운 사항

### Missing Definitions

Timeout, Retry, 인증, 데이터 보존 정책 등 정의되지 않은 사항

### Inconsistencies

명칭, 타입, 인터페이스 또는 설정이 서로 충돌하는 사항

### Technical Risks

- 단일 장애점
- 전역 상태
- 순환 의존
- 과도한 결합
- 동기식 장기 작업
- 무제한 Retry
- Timeout 부재
- 대용량 데이터 전달
- 보안 취약 가능성
- 관측성 부족
- 테스트 부족

### Improvement Opportunities

현재 구조를 존중하면서 현실적으로 적용 가능한 개선안을 제안한다.

## 10. 다이어그램 정의 작성 기준

직접 이미지를 생성하지 말고, 후속 AI가 다이어그램을 정확하게 생성할 수 있도록 구조화된 정의를 작성한다.

반드시 다음 다이어그램 정의를 포함한다.

1. System Context
2. Logical Architecture
3. 대표 요청 Sequence
4. 핵심 Data Flow
5. Deployment Architecture
6. 오류 및 Fallback Flow

다이어그램의 모든 노드에는 문서에서 정의한 ID를 사용한다.

예시:

```yaml
components:
  - id: CMP-001
    name: Chat UI
    group: Client
    type: frontend

relationships:
  - from: CMP-001
    to: CMP-002
    label: User Message
    protocol: HTTPS
    mode: synchronous
```

확인되지 않은 노드나 연결은 다이어그램 정의에 임의로 추가하지 않는다.

## 11. 중요도 기준

모든 이슈와 개선 사항은 다음 기준으로 우선순위를 작성한다.

### High

- 서비스 중단 가능
- 데이터 유실 또는 보안 문제
- 핵심 흐름의 정의 누락
- 배포 불가능 또는 운영 불가능

### Medium

- 장애 대응 어려움
- 확장성 또는 유지보수 문제
- 명칭 또는 인터페이스 불일치
- 모니터링 부족

### Low

- 문서화 부족
- 경미한 코드 중복
- 시각적 또는 구조적 개선 사항

## 12. 최종 출력 규칙

- 최종 결과는 Markdown으로 출력한다.
- 제공된 템플릿의 제목과 섹션 번호를 유지한다.
- 확인할 수 없는 섹션을 삭제하지 않는다.
- 확인할 수 없으면 `미확인`과 그 이유를 작성한다.
- 비어 있는 표에는 `확인된 항목 없음`이라고 작성한다.
- 동일한 정보를 여러 섹션에서 불필요하게 반복하지 않는다.
- 긴 소스 코드를 그대로 복사하지 않는다.
- 실제 코드에 없는 시스템이나 기술을 추가하지 않는다.
- 분석 완료 시 `Analysis Coverage`에 분석 범위를 명시한다.
- 마지막에 신뢰도 평가를 반드시 작성한다.
- 완성된 문서 외의 대화형 설명은 출력하지 않는다.
