# WOONG AI (app)

WMS 운영자 업무 조수. 메인 기능은 **SimPy DES 기반 창고상황 예측·What-if 시뮬레이션**이며, 모든 결과를 시각화한다.

- 설계 문서: [`../docs`](../docs)
- 정책 문서(RAG 대상): [`../rag`](../rag)
- 모델: 생성=Claude(`claude-opus-4-8`), 임베딩=OpenAI(`text-embedding-3-small`)

## 설정 (Phase 1)
```bash
cd app
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
copy .env.example .env           # 실제 키 입력 (Phase 4~5부터 필요)
```

## 디렉토리 (Phase 매핑)
| 폴더 | 내용 | Phase |
|---|---|---|
| `db/` | SQLite 스키마·연결 | 2 |
| `seed/` | 시드 데이터 생성 | 2 |
| `tools/` | 업무 Tool(조회·적치·피킹·Draft·KPI) | 3 |
| `sim/` | Forecast + SimPy DES + What-if | 4 |
| `rag/` | RAG 인덱스·검색(ALR + Sufficient Context) | 5 |
| `agent/` | LangGraph 워크플로(대화 Copilot) | 6 |
| `bb/` | Blackboard 자동운영(컨트롤 루프·도메인 에이전트·ZoneScheduler·실행/정책 게이트) | 9~10 |
| `api/` | FastAPI(웹 SPA·API 서빙) | 7 |
| `web/` | 웹 SPA — 대화·자동운영·디지털 트윈·시뮬·KPI(FastAPI가 서빙) | 8 |
| `ui/` | (레거시) Streamlit 프로토타입 | 8 |
| `eval/` | 평가 하네스(결정성·RAG·LLM-judge·가드레일·성능) | 9 |
| `tests/` | 테스트 | - |

`config.py` 가 `.env`에서 키·모델·경로를 로드한다.
