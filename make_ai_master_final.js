const pptxgen = require("pptxgenjs");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_16X9";
pptx.author = "WOONG AI Project";
pptx.subject = "AI Master Project 3기 최종 발표";
pptx.title = "WOONG AI - Agentic Warehouse Operations Copilot";
pptx.company = "AI Master Project";
pptx.lang = "ko-KR";
pptx.theme = {
  headFontFace: "Malgun Gothic",
  bodyFontFace: "Malgun Gothic",
  lang: "ko-KR",
};
pptx.defineLayout({ name: "CUSTOM_WIDE", width: 10, height: 5.625 });
pptx.layout = "CUSTOM_WIDE";

const C = {
  navy: "1A365D",
  navy2: "3D5A80",
  mint: "4ECDC4",
  teal: "2A9D8F",
  ink: "243447",
  body: "3F4F5F",
  muted: "6B7A89",
  white: "FFFFFF",
  line: "E1E6EA",
  light: "F8F9FA",
  mintLight: "F0FDFB",
  blueLight: "EEF4FA",
  orange: "F4A261",
  red: "E76F51",
  green: "2A9D8F",
  gold: "E9C46A",
  gray: "F5F5F5",
};
const F = "Malgun Gothic";
const S = pptx.ShapeType;
const noLine = { color: "FFFFFF", transparency: 100 };

function addText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x, y, w, h, fontFace: F, fontSize: 10, color: C.body,
    margin: 0, breakLine: false, fit: "shrink", valign: "top", ...opts,
  });
}

function rect(slide, x, y, w, h, fill, line = noLine, radius = true) {
  slide.addShape(radius ? S.roundRect : S.rect, {
    x, y, w, h, rectRadius: radius ? 0.05 : undefined,
    fill: { color: fill }, line,
  });
}

function line(slide, x, y, w, h, color = C.line, width = 1, dash = "solid") {
  slide.addShape(S.line, { x, y, w, h, line: { color, width, dashType: dash } });
}

function arrow(slide, x, y, w, h, color = C.navy, width = 1.4) {
  slide.addShape(S.line, {
    x, y, w, h,
    line: { color, width, beginArrowType: "none", endArrowType: "triangle" },
  });
}

function header(slide, title, page, minutes, appendix = false) {
  slide.background = { color: C.white };
  rect(slide, 0.28, 0.15, 0.06, 0.44, C.navy, noLine, false);
  addText(slide, title, 0.41, 0.14, 7.15, 0.45, { fontSize: 22, bold: true, color: C.ink, valign: "mid" });
  if (appendix) {
    rect(slide, 7.86, 0.21, 1.82, 0.30, C.mintLight, { color: C.mint, width: 0.5 });
    addText(slide, "APPENDIX", 7.86, 0.21, 1.82, 0.30, { fontSize: 9, bold: true, color: C.teal, align: "center", valign: "mid" });
  } else {
    rect(slide, 8.26, 0.21, 1.41, 0.30, C.gray, { color: C.line, width: 0.5 });
    addText(slide, `권장 ${minutes}분 이내`, 8.26, 0.21, 1.41, 0.30, { fontSize: 9, bold: true, color: C.muted, align: "center", valign: "mid" });
  }
  line(slide, 0.28, 0.64, 9.40, 0, C.line, 1);
  rect(slide, 0, 5.50, 10, 0.125, C.navy, noLine, false);
  addText(slide, page, 8.92, 5.505, 0.78, 0.10, { fontSize: 7, color: C.white, align: "right", valign: "mid" });
}

function sectionTitle(slide, title, x, y, w, accent = C.navy) {
  rect(slide, x, y, 0.06, 0.28, accent, noLine, false);
  addText(slide, title, x + 0.13, y - 0.005, w - 0.13, 0.30, { fontSize: 11, bold: true, color: C.ink, valign: "mid" });
}

function bulletList(slide, items, x, y, w, h, opts = {}) {
  const runs = [];
  items.forEach((item, idx) => {
    const [title, desc] = Array.isArray(item) ? item : ["", item];
    runs.push({ text: title ? `${title}  ` : "", options: { bold: true, color: opts.titleColor || C.ink } });
    runs.push({ text: desc, options: { color: opts.color || C.body, breakLine: idx !== items.length - 1 } });
  });
  addText(slide, runs, x, y, w, h, {
    fontSize: opts.fontSize || 9.5,
    paraSpaceAfterPt: opts.paraSpaceAfterPt || 8,
    breakLine: false,
    valign: opts.valign || "top",
  });
}

function metric(slide, x, y, w, h, value, label, sub, fill = C.gray, valueColor = C.navy) {
  rect(slide, x, y, w, h, fill, { color: C.line, width: 0.6 });
  addText(slide, value, x + 0.12, y + 0.10, w - 0.24, 0.33, { fontSize: 20, bold: true, color: valueColor, align: "center", valign: "mid" });
  addText(slide, label, x + 0.12, y + 0.45, w - 0.24, 0.22, { fontSize: 9.5, bold: true, color: C.ink, align: "center", valign: "mid" });
  if (sub) addText(slide, sub, x + 0.12, y + 0.68, w - 0.24, h - 0.77, { fontSize: 7.5, color: C.muted, align: "center", valign: "top" });
}

function flowNode(slide, x, y, w, h, title, desc, fill = C.gray, accent = C.navy, titleSize = 9.5, descSize = 7.5) {
  rect(slide, x, y, w, h, fill, { color: C.line, width: 0.6 });
  rect(slide, x, y, 0.055, h, accent, noLine, false);
  addText(slide, title, x + 0.12, y + 0.10, w - 0.18, 0.22, { fontSize: titleSize, bold: true, color: C.ink, valign: "mid" });
  addText(slide, desc, x + 0.12, y + 0.35, w - 0.18, h - 0.43, { fontSize: descSize, color: C.muted, valign: "top" });
}

function labelPill(slide, text, x, y, w, fill = C.mintLight, color = C.teal) {
  rect(slide, x, y, w, 0.24, fill, noLine);
  addText(slide, text, x, y, w, 0.24, { fontSize: 7.5, bold: true, color, align: "center", valign: "mid" });
}

// 1. Cover
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  rect(s, 0, 0, 10, 0.10, C.navy, noLine, false);
  rect(s, 0, 5.50, 10, 0.125, C.navy, noLine, false);
  addText(s, "AI Master Project 3기", 1.50, 1.20, 7.00, 0.42, { fontSize: 14, color: C.muted, align: "center", valign: "mid" });
  addText(s, "최종 발표", 1.50, 1.72, 7.00, 0.78, { fontSize: 40, bold: true, color: C.navy, align: "center", valign: "mid" });
  rect(s, 4.30, 2.70, 1.40, 0.06, C.mint, noLine, false);
  addText(s, [
    { text: "과제명   ", options: { bold: true, color: C.ink } },
    { text: "WOONG AI — Agentic Warehouse Operations Copilot", options: { color: C.body, breakLine: true } },
    { text: "멘   티   ", options: { bold: true, color: C.ink } },
    { text: "[성명], [사번]", options: { color: C.body, breakLine: true } },
    { text: "멘   토   ", options: { bold: true, color: C.ink } },
    { text: "[성명1], [성명2]", options: { color: C.body } },
  ], 2.65, 3.00, 4.70, 1.18, { fontSize: 13, paraSpaceAfterPt: 11, align: "left", valign: "top" });
  addText(s, "발표 영상 10분 이내  |  시연 영상 별도 제출 5분 이내", 2.00, 4.56, 6.00, 0.26, { fontSize: 9, color: C.muted, align: "center", valign: "mid" });
}

// 2. Project overview
{
  const s = pptx.addSlide();
  header(s, "프로젝트 개요", "01 / 03", 2);

  // left upper
  rect(s, 0.28, 0.74, 4.88, 1.78, C.light, { color: C.line, width: 0.7 });
  rect(s, 0.28, 0.74, 0.06, 1.78, C.navy, noLine, false);
  addText(s, "1. 문제 정의 (Vision / Problem)", 0.42, 0.84, 4.55, 0.27, { fontSize: 11, bold: true, color: C.ink });
  addText(s, [
    { text: "현장 문제  ", options: { bold: true, color: C.navy } },
    { text: "입·출고, 재고, 작업자, 정책 정보가 분리되어 운영자가 우선순위를 수작업 판단", options: { breakLine: true } },
    { text: "업무 손실  ", options: { bold: true, color: C.navy } },
    { text: "납기 지연·재고 부족·Zone 병목을 늦게 인지하고, 추천 근거와 실행 책임도 추적하기 어려움", options: { breakLine: true } },
    { text: "목표  ", options: { bold: true, color: C.navy } },
    { text: "자연어 질문 하나로 조회→계산→예측→근거→승인 실행까지 연결하는 운영 Copilot", options: {} },
  ], 0.43, 1.17, 4.48, 1.18, { fontSize: 9.3, color: C.body, paraSpaceAfterPt: 7 });

  // left lower
  rect(s, 0.28, 2.65, 4.88, 2.63, C.mintLight, { color: C.line, width: 0.7 });
  rect(s, 0.28, 2.65, 0.06, 2.63, C.mint, noLine, false);
  addText(s, "2. 핵심 기능 (Core Features)", 0.42, 2.75, 4.55, 0.27, { fontSize: 11, bold: true, color: C.ink });
  addText(s, "무엇을 만들었는가?", 0.43, 3.12, 1.45, 0.23, { fontSize: 9.5, bold: true, color: C.navy });
  addText(s, "LangGraph 기반 Agentic WMS Copilot + Blackboard 자동운영 + DES What-if", 1.87, 3.12, 3.02, 0.36, { fontSize: 9.4, bold: true, color: C.body });
  const core = [
    ["① 운영 질의", "오늘 할 일·재고위험·KPI·입출고 조회"],
    ["② 계산/추천", "적치·피킹·보충·발주 우선순위"],
    ["③ 예측/검증", "SimPy DES + Monte Carlo P50/P90"],
    ["④ 근거/실행", "Agentic RAG + Dry Run + 사용자 승인"],
  ];
  core.forEach((v, i) => {
    const y = 3.57 + i * 0.36;
    addText(s, v[0], 0.46, y, 1.10, 0.26, { fontSize: 8.8, bold: true, color: i === 3 ? C.teal : C.navy, valign: "mid" });
    addText(s, v[1], 1.56, y, 3.35, 0.26, { fontSize: 8.6, color: C.body, valign: "mid" });
  });
  addText(s, "Stack  LangGraph · FastAPI · SQLite · FAISS · OpenAI/Azure Gateway · SimPy · Plotly", 0.45, 5.04, 4.50, 0.18, { fontSize: 7.4, color: C.muted, italic: true });

  // right metrics
  addText(s, "핵심 성과 (Key Achievements)", 5.53, 0.74, 4.12, 0.28, { fontSize: 11, bold: true, color: C.ink });
  metric(s, 5.53, 1.10, 1.93, 0.98, "60 / 60", "자동 평가 통과", "결정성·LLM·안전·RAG 포함", C.gray, C.navy);
  metric(s, 7.58, 1.10, 1.93, 0.98, "200회", "DES 기본 반복", "확률 분포 기반 P50/P90 산출", C.gray, C.teal);
  metric(s, 5.53, 2.18, 3.98, 0.98, "0건", "승인 우회 즉시 실행", "공격 입력 4건 모두 Approval Gate에서 차단", C.gray, C.red);

  rect(s, 5.53, 3.42, 3.98, 1.86, C.navy, noLine);
  addText(s, "Key Message", 5.78, 3.60, 3.48, 0.25, { fontSize: 10, bold: true, color: C.mint });
  addText(s, "“LLM이 계산을 대신하는 시스템이 아니라,\n검증된 Tool·시뮬레이션·정책 근거를 연결하고\n승인 가능한 의사결정으로 바꾸는 운영 AI”", 5.78, 3.98, 3.48, 0.92, { fontSize: 13, bold: true, color: C.white, align: "center", valign: "mid", breakLine: false });
  addText(s, "정확성 · 설명가능성 · 실행안전성을 하나의 흐름으로 통합", 5.78, 5.00, 3.48, 0.18, { fontSize: 7.8, color: "D6E2EC", align: "center" });
}

// 3. Technical architecture
{
  const s = pptx.addSlide();
  header(s, "기술 아키텍처", "02 / 03", 4);

  rect(s, 0.28, 0.74, 5.05, 4.54, C.gray, { color: "D2D8DE", width: 0.8 });
  addText(s, "[ SYSTEM ARCHITECTURE ]", 0.50, 0.88, 4.61, 0.22, { fontSize: 8.2, bold: true, color: C.muted, align: "center" });

  // User/API
  flowNode(s, 0.55, 1.20, 1.20, 0.64, "사용자 / UI", "Chat · KPI · Simulation", C.white, C.navy, 9, 7);
  arrow(s, 1.79, 1.52, 0.40, 0, C.navy);
  flowNode(s, 2.22, 1.20, 1.20, 0.64, "FastAPI", "Session · API · SSE", C.white, C.navy, 9, 7);
  arrow(s, 3.46, 1.52, 0.38, 0, C.navy);
  flowNode(s, 3.88, 1.20, 1.12, 0.64, "LangGraph", "State Orchestrator", C.mintLight, C.mint, 9, 7);

  // workflow chain
  const nodes = [
    ["Router", "의도 분류"], ["Planner", "실행 계획"], ["Tool", "조회·계산"],
    ["Verifier", "제약 검증"], ["RAG", "정책 근거"], ["Response", "설명·Draft"],
  ];
  nodes.forEach((n, i) => {
    const x = 0.51 + i * 0.79;
    rect(s, x, 2.10, 0.67, 0.65, i === 4 ? C.mintLight : C.white, { color: i === 4 ? C.mint : C.line, width: 0.7 });
    addText(s, n[0], x + 0.03, 2.20, 0.61, 0.17, { fontSize: 7.5, bold: true, color: C.ink, align: "center" });
    addText(s, n[1], x + 0.03, 2.42, 0.61, 0.18, { fontSize: 6.5, color: C.muted, align: "center" });
    if (i < nodes.length - 1) arrow(s, x + 0.68, 2.42, 0.10, 0, C.muted, 1);
  });
  addText(s, "Adaptive path: 조회는 RAG 생략 · 정책/추천은 근거 검색 · 불충분하면 재검색 또는 abstain", 0.58, 2.84, 4.48, 0.25, { fontSize: 7.1, color: C.muted, align: "center" });

  // domain engines
  const engines = [
    ["업무 Tool", "재고·입출고·적치·피킹\nKPI·Draft", C.blueLight, C.navy],
    ["Simulation", "Regression + SimPy DES\nMonte Carlo / What-if", "FFF8ED", C.orange],
    ["Agentic RAG", "FAISS → PRISM →\nSufficient Context", C.mintLight, C.teal],
  ];
  engines.forEach((e, i) => flowNode(s, 0.52 + i * 1.55, 3.20, 1.40, 0.91, e[0], e[1], e[2], e[3], 8.5, 6.8));
  arrow(s, 2.92, 2.78, 0, 0.37, C.muted, 1.2);

  // Data and execution safety
  rect(s, 0.52, 4.34, 4.56, 0.66, C.white, { color: C.line, width: 0.7 });
  addText(s, "DATA", 0.68, 4.47, 0.45, 0.17, { fontSize: 7.5, bold: true, color: C.navy });
  addText(s, "SQLite WMS · 정책/SOP 문서 · Session/Trace · Seed/평가셋", 1.15, 4.47, 2.67, 0.20, { fontSize: 7.2, color: C.body });
  rect(s, 3.90, 4.42, 0.92, 0.30, C.navy, noLine);
  addText(s, "승인 후 실행", 3.90, 4.42, 0.92, 0.30, { fontSize: 7.2, bold: true, color: C.white, align: "center", valign: "mid" });
  addText(s, "Blackboard 자동운영도 Policy Gate·Trace 적용", 0.68, 4.73, 4.10, 0.17, { fontSize: 6.8, italic: true, color: C.muted });

  // right decisions
  addText(s, "기술 아키텍처 고려 사항", 5.58, 0.74, 4.12, 0.26, { fontSize: 11, bold: true, color: C.ink });
  const decisions = [
    {
      title: "LangGraph + Tool-first",
      fill: C.light, accent: C.navy,
      body: "선택 이유  복합 질의는 분기·재시도·검증·승인 상태가 필요해 단순 Chain으로 관리하기 어려움\n핵심 활용  LLM은 계획/설명, 수치·규칙·상태변경은 결정적 Tool이 담당",
    },
    {
      title: "Agentic RAG + Sufficient Context",
      fill: C.mintLight, accent: C.mint,
      body: "선택 이유  유사 문서 검색만으로는 ‘답할 근거가 충분한가’를 보장하지 못함\n핵심 활용  ALR 질의분해 → PRISM 근거 구간 → 충분성 판정 → 재검색/abstain",
    },
    {
      title: "DES + Human-in-the-loop",
      fill: C.gray, accent: C.navy2,
      body: "선택 이유  창고는 인력·지게차·Zone CAPA·납기 제약이 얽혀 단순 Forecast만으로 운영 가능성을 판단할 수 없음\n구현 포인트  SimPy 200회 분포 + What-if, 변경은 Dry Run과 승인 후 실행",
    },
  ];
  decisions.forEach((d, i) => {
    const y = 1.08 + i * 1.38;
    rect(s, 5.58, y, 4.12, 1.21, d.fill, { color: C.line, width: 0.7 });
    rect(s, 5.58, y, 0.06, 1.21, d.accent, noLine, false);
    rect(s, 5.72, y + 0.12, 0.28, 0.28, d.accent, noLine);
    addText(s, `0${i + 1}`, 5.72, y + 0.12, 0.28, 0.28, { fontSize: 7.5, bold: true, color: C.white, align: "center", valign: "mid" });
    addText(s, d.title, 6.10, y + 0.10, 3.40, 0.25, { fontSize: 10, bold: true, color: C.ink });
    addText(s, d.body, 5.75, y + 0.47, 3.73, 0.60, { fontSize: 7.8, color: C.body, breakLine: false, paraSpaceAfterPt: 3 });
  });
}

// 4. Core technical hurdle
{
  const s = pptx.addSlide();
  header(s, "핵심 기술 과제", "03 / 03", 4);

  rect(s, 0.28, 0.75, 9.40, 1.08, C.navy, noLine);
  addText(s, "핵심 기술 난제 (Hurdle)", 0.48, 0.89, 2.62, 0.24, { fontSize: 10, bold: true, color: C.mint });
  addText(s, "실시간 운영 데이터·정책 근거·확률적 시뮬레이션을 한 답변에 결합하면서도,\nLLM 환각과 승인 없는 상태 변경을 동시에 차단해야 했습니다.", 0.48, 1.17, 8.88, 0.48, { fontSize: 14, bold: true, color: C.white, valign: "mid" });

  // left engineering approach
  rect(s, 0.28, 2.00, 4.83, 3.28, C.light, { color: C.line, width: 0.7 });
  rect(s, 0.28, 2.00, 0.06, 3.28, C.navy, noLine, false);
  addText(s, "엔지니어링 접근 방법", 0.43, 2.12, 4.44, 0.27, { fontSize: 11, bold: true, color: C.ink });
  const approach = [
    ["① 책임 분리", "LLM=분류·계획·설명 / Tool=조회·계산·상태변경 / Verifier=업무 제약 검증"],
    ["② 근거 폐쇄 루프", "ALR로 필요한 증거를 정의하고 PRISM으로 근거 구간을 추출; 부족하면 최대 2회 재검색 후 abstain"],
    ["③ 확률적 운영 검증", "확정 주문+수요 Forecast를 DES 이벤트로 변환하고 인력·장비·공간 제약 아래 P50/P90 KPI 산출"],
    ["④ 실행 안전장치", "추천→Draft→Dry Run→Approval Gate→State Update로 분리; 공격성 입력도 즉시 실행 금지"],
    ["⑤ 관측·회귀 평가", "Agent trace, Tool/RAG/승인 로그를 저장하고 결정성 invariant와 LLM 평가를 분리"],
  ];
  approach.forEach((a, i) => {
    const y = 2.56 + i * 0.49;
    addText(s, a[0], 0.46, y, 1.00, 0.22, { fontSize: 8.6, bold: true, color: i === 1 ? C.teal : C.navy });
    addText(s, a[1], 1.43, y, 3.35, 0.39, { fontSize: 7.9, color: C.body });
  });

  // right results
  rect(s, 5.24, 2.00, 4.44, 3.28, C.mintLight, { color: C.line, width: 0.7 });
  rect(s, 5.24, 2.00, 0.06, 3.28, C.mint, noLine, false);
  addText(s, "결과 및 성과 (실측)", 5.39, 2.12, 4.04, 0.27, { fontSize: 11, bold: true, color: C.ink });
  metric(s, 5.42, 2.55, 4.02, 0.70, "15 / 15", "Intent 분류", "주요 WMS 질의 기대 라벨 일치", C.white, C.navy);
  metric(s, 5.42, 3.38, 4.02, 0.70, "4 / 4", "RAG / Abstain", "정책·SOP·용어 답변 + 미보유 규정 거절", C.white, C.teal);
  metric(s, 5.42, 4.21, 4.02, 0.70, "1.00", "Faithfulness / Relevance", "grounded 5건 평균 · negative control 4/4 판별", C.white, C.red);
  addText(s, "※ 평가 표본이 작으므로 절대 정확도가 아니라 설계의 판별 성립 여부로 해석", 5.43, 5.02, 4.00, 0.14, { fontSize: 6.8, italic: true, color: C.muted, align: "center" });
}

// Appendix 1. Implemented product
{
  const s = pptx.addSlide();
  header(s, "구현 결과 — 하나의 운영 화면에서 질문·예측·승인·추적", "A1 / A8", null, true);
  sectionTitle(s, "실제 구현 화면", 0.28, 0.80, 9.40, C.navy);
  const imgs = [
    ["app/screenshots/01_ui_overview_agent_chat.png", "Agent Chat", "자연어 운영 질의와 세션 문맥"],
    ["app/screenshots/06_warehouse_simulation.png", "Warehouse Simulation", "Baseline vs What-if · Floor Replay"],
    ["app/screenshots/08_ai_observability_trace.png", "AI Observability", "노드·Tool·RAG·승인 Trace"],
  ];
  imgs.forEach((it, i) => {
    const x = 0.30 + i * 3.20;
    rect(s, x, 1.18, 3.02, 2.33, C.gray, { color: C.line, width: 0.8 });
    s.addImage({ path: it[0], x: x + 0.06, y: 1.24, w: 2.90, h: 1.63 });
    addText(s, it[1], x + 0.10, 2.98, 2.82, 0.22, { fontSize: 9.2, bold: true, color: C.ink });
    addText(s, it[2], x + 0.10, 3.23, 2.82, 0.18, { fontSize: 7.6, color: C.muted });
  });
  sectionTitle(s, "사용자 가치가 연결되는 지점", 0.28, 3.82, 9.40, C.mint);
  const vals = [
    ["질문", "현장 용어로 묻고", "daily summary · KPI · 위험 · 정책"],
    ["판단", "데이터와 제약으로 계산", "Tool · Forecast · DES · Dispatch"],
    ["설명", "정책 근거와 함께 제시", "evidence span · source · sufficiency"],
    ["실행", "승인 가능한 Draft로 전환", "Dry Run · approve/reject · audit"],
  ];
  vals.forEach((v, i) => {
    const x = 0.30 + i * 2.36;
    flowNode(s, x, 4.16, 2.18, 0.88, v[0] + " — " + v[1], v[2], i === 2 ? C.mintLight : C.light, i === 2 ? C.mint : C.navy, 8.6, 7.2);
    if (i < 3) arrow(s, x + 2.19, 4.60, 0.16, 0, C.muted, 1);
  });
}

// Appendix 2. End-to-end workflow
{
  const s = pptx.addSlide();
  header(s, "E2E 의사결정 워크플로 — 조회와 실행을 분리", "A2 / A8", null, true);
  sectionTitle(s, "질의 처리 경로", 0.28, 0.82, 9.40, C.navy);
  const chain = [
    ["1 Router", "업무 Intent·신뢰도"], ["2 Parameter", "SKU·주문·기간 추출"],
    ["3 Planner", "필요 Tool과 순서"], ["4 Executor", "DB·계산·Forecast"],
    ["5 Verifier", "CAPA·납기·일관성"], ["6 RAG", "정책·SOP·용어"],
    ["7 Response", "결론·수치·근거"], ["8 Approval", "Draft 검토 후 실행"],
  ];
  chain.forEach((n, i) => {
    const row = Math.floor(i / 4), col = i % 4;
    const x = 0.30 + col * 2.36, y = 1.20 + row * 1.08;
    flowNode(s, x, y, 2.12, 0.76, n[0], n[1], i === 5 ? C.mintLight : C.light, i === 5 ? C.mint : C.navy, 9, 7.4);
    if (col < 3) arrow(s, x + 2.13, y + 0.38, 0.20, 0, C.muted, 1.1);
    if (col === 3 && row === 0) {
      arrow(s, x + 1.06, y + 0.78, 0, 0.27, C.muted, 1.1);
      addText(s, "검증", x + 1.10, y + 0.84, 0.45, 0.16, { fontSize: 6.5, color: C.muted });
    }
  });
  sectionTitle(s, "조건 분기와 안전 계약", 0.28, 3.46, 9.40, C.mint);
  const contracts = [
    ["조회형", "RAG 생략 가능", "실시간 DB/Tool 결과만으로 답변; 불필요한 LLM 호출 최소화"],
    ["추천·정책형", "근거 필수", "정책·계산식·SOP를 검색하고 answerable/sufficient를 통과해야 답변"],
    ["상태 변경형", "승인 필수", "Draft와 Dry Run 결과를 먼저 제시; approve된 draft_id만 DB 반영"],
  ];
  contracts.forEach((c, i) => {
    const x = 0.30 + i * 3.14;
    rect(s, x, 3.84, 2.96, 1.16, i === 1 ? C.mintLight : C.gray, { color: C.line, width: 0.7 });
    labelPill(s, c[1], x + 0.16, 4.02, 0.92, i === 1 ? "DDF8F4" : C.blueLight, i === 1 ? C.teal : C.navy);
    addText(s, c[0], x + 1.20, 4.01, 1.50, 0.24, { fontSize: 9.5, bold: true, color: C.ink });
    addText(s, c[2], x + 0.16, 4.39, 2.64, 0.43, { fontSize: 7.8, color: C.body });
  });
}

// Appendix 3. RAG and retrieval strengthening
{
  const s = pptx.addSlide();
  header(s, "Agentic RAG와 검색 강화 방향", "A3 / A8", null, true);
  sectionTitle(s, "현재 구현: 근거를 ‘찾는 것’과 ‘충분한지 판단하는 것’을 분리", 0.28, 0.82, 9.40, C.navy);
  const ragSteps = [
    ["Analysis", "질문에 필요한 evidence 유형 정의"],
    ["Localization", "FAISS 후보 → PRISM rerank·근거 span"],
    ["Sufficiency", "핵심 조건을 모두 설명 가능한지 판정"],
    ["Recovery", "query rewrite/문서군 확장, 최대 2회"],
    ["Grounded Answer", "출처·규칙·조치 또는 명시적 abstain"],
  ];
  ragSteps.forEach((n, i) => {
    const x = 0.30 + i * 1.89;
    flowNode(s, x, 1.22, 1.66, 0.92, n[0], n[1], i === 2 ? C.mintLight : C.light, i === 2 ? C.mint : C.navy, 8.5, 6.9);
    if (i < 4) arrow(s, x + 1.67, 1.68, 0.18, 0, C.muted, 1);
  });
  addText(s, "정책 문서 7종: 적치 · 피킹 · 재고위험 · 창고 SOP · 계산식 · WMS 용어 · KPI 정책", 0.45, 2.26, 9.05, 0.22, { fontSize: 8, color: C.muted, align: "center" });

  sectionTitle(s, "향후 강화: 문서 증가와 현장 표현 변형을 견디는 검색", 0.28, 2.72, 9.40, C.mint);
  const improvements = [
    ["Hybrid Search", "Embedding + BM25 + RRF", "SKU·정책번호·정확한 용어와 의미 질의를 동시에 회수"],
    ["용어 정규화", "표준어·약어·현장어", "‘출확대기/출고대기/출고확정대기’를 동일 개념으로 매핑"],
    ["Metadata Filter", "intent·entity·유효기간", "업무영역·대상·버전·권한에 맞지 않는 근거를 사전 제외"],
    ["Multi-hop", "규칙 관계 탐색", "정의→적용조건→예외→조치가 다른 문서에 있을 때 단계적 검색"],
    ["Retrieval Eval", "Recall@K·MRR·span", "질의/후보/최종근거/제외사유를 기록하고 hard case 회귀평가"],
    ["문서 거버넌스", "버전·소유자·ACL", "운영 시점에 유효하고 사용자에게 허용된 근거만 답변에 사용"],
  ];
  improvements.forEach((v, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.30 + col * 3.16, y = 3.12 + row * 0.96;
    rect(s, x, y, 2.98, 0.82, row === 0 ? C.gray : C.mintLight, { color: C.line, width: 0.7 });
    addText(s, v[0], x + 0.14, y + 0.10, 1.20, 0.20, { fontSize: 8.8, bold: true, color: col === 1 ? C.teal : C.navy });
    addText(s, v[1], x + 1.32, y + 0.10, 1.48, 0.20, { fontSize: 7.2, bold: true, color: C.muted, align: "right" });
    addText(s, v[2], x + 0.14, y + 0.38, 2.66, 0.30, { fontSize: 7.2, color: C.body });
  });
}

// Appendix 4. Simulation and autonomous operation
{
  const s = pptx.addSlide();
  header(s, "예측을 넘어 ‘운영 가능성’을 검증하는 Simulation", "A4 / A8", null, true);
  sectionTitle(s, "Hybrid Forecast + Discrete Event Simulation", 0.28, 0.82, 9.40, C.navy);
  // timeline
  rect(s, 0.30, 1.22, 5.10, 1.42, C.gray, { color: C.line, width: 0.7 });
  addText(s, "현재", 0.53, 1.42, 0.50, 0.20, { fontSize: 8, bold: true, color: C.navy, align: "center" });
  line(s, 1.05, 1.52, 3.86, 0, C.navy, 2);
  rect(s, 1.18, 1.27, 1.65, 0.48, C.blueLight, { color: C.navy, width: 0.7 });
  addText(s, "Near Future (기본 3일)\n확정 입·출고 + 현재 재고", 1.18, 1.30, 1.65, 0.42, { fontSize: 7.7, bold: true, color: C.navy, align: "center", valign: "mid" });
  rect(s, 3.05, 1.27, 1.65, 0.48, "FFF8ED", { color: C.orange, width: 0.7 });
  addText(s, "Far Future\nRegression 수요 → 가상 이벤트", 3.05, 1.30, 1.65, 0.42, { fontSize: 7.7, bold: true, color: C.orange, align: "center", valign: "mid" });
  addText(s, "두 구간 모두 동일한 SimPy DES에서 인력·지게차·Zone CAPA·납기 제약을 검증", 0.56, 1.95, 4.59, 0.36, { fontSize: 8, color: C.body, align: "center", valign: "mid" });

  rect(s, 5.62, 1.22, 4.06, 1.42, C.mintLight, { color: C.line, width: 0.7 });
  addText(s, "Monte Carlo Replication", 5.82, 1.39, 1.80, 0.24, { fontSize: 9.5, bold: true, color: C.teal });
  addText(s, "처리시간 분포 + Poisson 수요를 매 run 재표본화", 7.50, 1.39, 1.92, 0.24, { fontSize: 7.5, color: C.body, align: "right" });
  addText(s, "N=200 → 재고소진일·출고지연·피킹대기·Zone 점유·자원가동률을 P50/P90/발생확률로 집계", 5.82, 1.83, 3.60, 0.51, { fontSize: 8.2, color: C.body, align: "center", valign: "mid" });

  sectionTitle(s, "What-if와 Blackboard 자동운영", 0.28, 2.96, 9.40, C.mint);
  const whatifs = ["작업자 +1", "지게차 -1", "Zone CAPA -20%", "출고 수요 +30%", "입고 1일 지연"];
  whatifs.forEach((t, i) => labelPill(s, t, 0.34 + i * 1.22, 3.35, 1.08, i === 1 || i === 2 ? "FFF1EE" : C.blueLight, i === 1 || i === 2 ? C.red : C.navy));
  addText(s, "Baseline과 Scenario KPI delta를 비교해 ‘좋아 보이는 제안’이 실제 병목을 완화하는지 검증", 0.42, 3.74, 5.76, 0.40, { fontSize: 8.5, color: C.body, align: "center" });
  arrow(s, 6.18, 3.68, 0.38, 0, C.muted, 1.2);
  flowNode(s, 6.62, 3.27, 1.28, 0.83, "Blackboard", "실시간 요청·상태 공유", C.light, C.navy, 8.5, 7);
  arrow(s, 7.92, 3.68, 0.22, 0, C.muted, 1.2);
  flowNode(s, 8.18, 3.27, 1.45, 0.83, "Agent 제안", "Inbound·Picking·Resource", C.mintLight, C.mint, 8.5, 6.7);
  rect(s, 0.30, 4.35, 9.38, 0.68, C.navy, noLine);
  addText(s, "자동운영 원칙", 0.55, 4.55, 1.08, 0.20, { fontSize: 9, bold: true, color: C.mint });
  addText(s, "완료→시작→자원배정 우선순위 · Dispatch Score · TSP 동선 · Simulation/Policy Gate · 모든 Action 감사 로그", 1.68, 4.47, 7.66, 0.35, { fontSize: 8.7, bold: true, color: C.white, align: "center", valign: "mid" });
}

// Appendix 5. Evaluation
{
  const s = pptx.addSlide();
  header(s, "평가 설계와 검증 결과", "A5 / A8", null, true);
  sectionTitle(s, "평가를 ‘결정성 invariant’와 ‘LLM 품질’로 분리", 0.28, 0.82, 9.40, C.navy);
  const evals = [
    ["결정성/불변식", "Tool 결정성 · 적치 정규화 · DES 재현성 · Forecast 등급 · 할당/결품 · 체화재고/보충", "18 checks"],
    ["고정 Seed 골든", "fresh-seed 전용 ID·등급·추천 위치 검증; 라이브 데이터 진화와 분리", "5 checks"],
    ["LLM/Agent", "Intent · scope · RAG/abstain · grounding · 공격 입력 · 승인 우회", "32 checks"],
    ["LLM-as-a-Judge", "Faithfulness/Relevance + 환각·동문서답 negative control", "5 checks"],
  ];
  evals.forEach((e, i) => {
    const y = 1.20 + i * 0.77;
    rect(s, 0.30, y, 6.26, 0.61, i === 2 ? C.mintLight : C.gray, { color: C.line, width: 0.7 });
    addText(s, e[0], 0.47, y + 0.13, 1.22, 0.24, { fontSize: 8.8, bold: true, color: i === 2 ? C.teal : C.navy, valign: "mid" });
    addText(s, e[1], 1.74, y + 0.11, 3.98, 0.34, { fontSize: 7.5, color: C.body, valign: "mid" });
    labelPill(s, e[2], 5.77, y + 0.18, 0.62, C.white, C.muted);
  });
  metric(s, 6.82, 1.20, 2.84, 0.92, "60 / 60", "전체 검증 통과", "fresh-seed 격리 평가", C.navy, C.white);
  metric(s, 6.82, 2.30, 1.34, 0.86, "8 / 8", "공격·승인", "무단 상태변경 0", C.gray, C.red);
  metric(s, 8.32, 2.30, 1.34, 0.86, "4 / 4", "Judge 판별", "환각·무관 답변 식별", C.gray, C.teal);
  sectionTitle(s, "성능 측정 — 총지연과 순수 처리시간을 분리", 0.28, 4.36, 9.40, C.mint);
  const perf = [
    ["정책형", "7.94s", "5 calls", "3.52s"],
    ["조회형", "12.82s", "8 calls", "5.75s"],
    ["예측형", "15.96s", "8 calls", "8.88s"],
  ];
  perf.forEach((p, i) => {
    const x = 0.30 + i * 2.16;
    rect(s, x, 4.70, 1.98, 0.47, C.gray, { color: C.line, width: 0.6 });
    addText(s, p[0], x + 0.10, 4.82, 0.44, 0.20, { fontSize: 8, bold: true, color: C.navy });
    addText(s, `총 ${p[1]} · ${p[2]} · 순수 ${p[3]}`, x + 0.55, 4.79, 1.31, 0.22, { fontSize: 7.2, color: C.body, align: "right" });
  });
  rect(s, 6.84, 4.70, 2.84, 0.47, "FFF1EE", { color: "F2C4B9", width: 0.7 });
  addText(s, "병목", 7.02, 4.82, 0.40, 0.18, { fontSize: 8, bold: true, color: C.red });
  addText(s, "호출당 ≈0.9s 사내 게이트웨이 RTT", 7.46, 4.79, 2.03, 0.22, { fontSize: 7.5, color: C.body, align: "right" });
}

// Appendix 6. Limitations
{
  const s = pptx.addSlide();
  header(s, "회고 — 확인된 기술적 한계와 개선 우선순위", "A6 / A8", null, true);
  const limitations = [
    ["P0 응답 지연", "총 12.8~16.0초 중 절반 이상이 LLM Gateway 왕복", "규칙 기반 fast path · 호출 병렬화 · 캐시 · 라우터 경량화"],
    ["P0 동시성", "SQLite 단일 파일과 라이브 DB 점유; 부하 테스트 미완료", "PostgreSQL 전환 · 평가 DB 격리 · 트랜잭션/락 검증"],
    ["P0 권한", "POC 단일 사용자; 승인·문서·데이터 접근 귀속 미비", "RBAC/ABAC · 사용자별 승인 한도 · 문서 ACL · 감사 주체"],
    ["P1 라우팅", "‘출고확정대기가 뭐야?’가 smalltalk로 빠지는 편차", "용어 감지 선행 · 정의형 질의 policy route · synonym 사전"],
    ["P1 원자화", "정의·조건·예외·조치와 조회·판단·실행 책임이 혼재", "지식 원자 + Tool 원자 + 의사결정 원자 + 독립 평가"],
    ["P1 검색", "소규모 정제 문서 의존; 약어·표·버전·복합 규칙에 취약", "Hybrid/RRF · metadata · multi-hop · retrieval 관측성"],
    ["P2 평가", "품질 5건, judge 4건 등 표본이 작아 절대 % 해석 불가", "현장 로그 기반 hard case · 실패 단계별 회귀셋 · 신뢰구간"],
  ];
  limitations.forEach((l, i) => {
    const y = 0.86 + i * 0.61;
    rect(s, 0.30, y, 9.38, 0.50, i < 3 ? "FFF5F2" : (i < 6 ? C.gray : C.mintLight), { color: C.line, width: 0.6 });
    labelPill(s, l[0], 0.43, y + 0.13, 0.92, i < 3 ? "FFE4DC" : C.blueLight, i < 3 ? C.red : C.navy);
    addText(s, l[1], 1.51, y + 0.10, 3.70, 0.28, { fontSize: 7.8, color: C.body, valign: "mid" });
    arrow(s, 5.32, y + 0.25, 0.28, 0, C.muted, 1);
    addText(s, l[2], 5.75, y + 0.10, 3.70, 0.28, { fontSize: 7.8, bold: true, color: i < 3 ? C.red : C.teal, valign: "mid" });
  });
  rect(s, 0.30, 5.23, 9.38, 0.19, C.navy, noLine);
  addText(s, "해석 원칙  현재 성과는 ‘POC 구조의 유효성’ 검증이며, 운영 전환 판단은 동시성·권한·대규모 평가 이후 수행", 0.55, 5.225, 8.88, 0.19, { fontSize: 7.2, bold: true, color: C.white, align: "center", valign: "mid" });
}

// Appendix 7. Atomicization
{
  const s = pptx.addSlide();
  header(s, "확장 기반 — 지식·Tool·의사결정·평가의 원자화", "A7 / A8", null, true);
  sectionTitle(s, "원자화 목표: WMS 기능을 복제하는 것이 아니라, 재조합 가능한 의사결정 부품을 만든다", 0.28, 0.82, 9.40, C.navy);
  const atoms = [
    ["지식 원자", "정의 · 적용조건 · 예외 · 계산식 · 판단기준 · 권장조치", "domain / entity / valid_from / priority / source / aliases"],
    ["Tool 원자", "조회 → 계산 → 검증 → 제안 → 실행을 단일 책임으로 분리", "typed input/output · deterministic · idempotency · permission"],
    ["판단 원자", "입력·규칙·계산결과·신뢰도·후속조치를 하나의 Decision으로 기록", "decision_id · evidence_ids · constraint_result · action_draft"],
    ["평가 원자", "Router·parameter·Tool·retrieval·span·sufficiency·approval을 독립 채점", "단계별 failure attribution · reusable regression suite"],
  ];
  atoms.forEach((a, i) => {
    const x = 0.30 + (i % 2) * 4.76, y = 1.24 + Math.floor(i / 2) * 1.42;
    rect(s, x, y, 4.56, 1.20, i % 2 ? C.mintLight : C.gray, { color: C.line, width: 0.7 });
    rect(s, x, y, 0.07, 1.20, i % 2 ? C.mint : C.navy, noLine, false);
    addText(s, a[0], x + 0.18, y + 0.13, 1.08, 0.24, { fontSize: 10, bold: true, color: i % 2 ? C.teal : C.navy });
    addText(s, a[1], x + 1.27, y + 0.12, 3.08, 0.42, { fontSize: 8, color: C.body });
    labelPill(s, a[2], x + 0.18, y + 0.75, 4.12, C.white, C.muted);
  });
  sectionTitle(s, "Domain Pack 계약", 0.28, 4.26, 9.40, C.mint);
  const packs = ["Entity Schema", "State Machine", "Constraint Tools", "Policy Atoms", "Action/Approval", "Eval Scenarios"];
  packs.forEach((p, i) => {
    const x = 0.31 + i * 1.55;
    rect(s, x, 4.62, 1.36, 0.48, i === 3 ? C.mintLight : C.gray, { color: i === 3 ? C.mint : C.line, width: 0.7 });
    addText(s, p, x + 0.05, 4.62, 1.26, 0.48, { fontSize: 7.7, bold: true, color: i === 3 ? C.teal : C.ink, align: "center", valign: "mid" });
    if (i < 5) addText(s, "+", x + 1.36, 4.72, 0.18, 0.20, { fontSize: 10, bold: true, color: C.muted, align: "center" });
  });
}

// Appendix 8. Generalization to APS and other domains
{
  const s = pptx.addSlide();
  header(s, "AI 디자인 패턴 일반화 — APS와 타 도메인으로", "A8 / A8", null, true);
  sectionTitle(s, "공통 Orchestration은 유지하고 Domain Pack만 교체", 0.28, 0.82, 9.40, C.navy);
  const pattern = ["Route", "Extract", "Plan", "Tool", "Verify", "Retrieve", "Approve", "Act", "Trace"];
  pattern.forEach((p, i) => {
    const x = 0.31 + i * 1.04;
    rect(s, x, 1.20, 0.88, 0.46, i === 5 ? C.mintLight : C.gray, { color: i === 5 ? C.mint : C.line, width: 0.7 });
    addText(s, p, x + 0.03, 1.20, 0.82, 0.46, { fontSize: 7.5, bold: true, color: i === 5 ? C.teal : C.ink, align: "center", valign: "mid" });
    if (i < 8) arrow(s, x + 0.89, 1.43, 0.13, 0, C.muted, 0.9);
  });
  sectionTitle(s, "WMS → APS 치환", 0.28, 1.96, 5.95, C.mint);
  const mapping = [
    ["SKU·재고·입출고", "품목·자재·생산오더·납기"],
    ["Zone·Location·작업자", "공정·설비·작업조·금형"],
    ["적치·피킹 우선순위", "작업 투입·공정 순서·납기 우선순위"],
    ["CAPA·동선 제약", "설비능력·교체시간·선후행·자재 제약"],
    ["DES What-if", "증원·잔업·고장·긴급오더 재계획"],
    ["작업지시 승인", "계획 확정·재스케줄링 승인"],
  ];
  mapping.forEach((m, i) => {
    const y = 2.30 + i * 0.44;
    rect(s, 0.30, y, 2.62, 0.34, C.gray, { color: C.line, width: 0.5 });
    addText(s, m[0], 0.42, y, 2.36, 0.34, { fontSize: 7.6, color: C.body, align: "center", valign: "mid" });
    arrow(s, 3.02, y + 0.17, 0.33, 0, C.muted, 1);
    rect(s, 3.45, y, 2.62, 0.34, C.mintLight, { color: C.line, width: 0.5 });
    addText(s, m[1], 3.57, y, 2.36, 0.34, { fontSize: 7.6, bold: true, color: C.teal, align: "center", valign: "mid" });
  });

  sectionTitle(s, "타 도메인 적용 예", 6.45, 1.96, 3.23, C.mint);
  const domains = [
    ["설비보전", "센서/이력 → 고장위험 → 정비 SOP → 작업오더 승인"],
    ["품질관리", "검사결과 → 이상판정 → 규정/사례 → 격리·재검 승인"],
    ["구매·조달", "수요/리드타임 → 부족위험 → 발주정책 → 발주 승인"],
    ["고객지원", "문의분류 → 고객정보 → 약관 → 답변/보상 승인"],
  ];
  domains.forEach((d, i) => {
    const y = 2.30 + i * 0.66;
    rect(s, 6.47, y, 3.20, 0.54, i % 2 ? C.mintLight : C.gray, { color: C.line, width: 0.6 });
    addText(s, d[0], 6.60, y + 0.10, 0.76, 0.20, { fontSize: 8.2, bold: true, color: i % 2 ? C.teal : C.navy });
    addText(s, d[1], 7.42, y + 0.08, 2.08, 0.32, { fontSize: 6.9, color: C.body });
  });
  rect(s, 6.47, 5.05, 3.20, 0.19, C.navy, noLine);
  addText(s, "목표: Agent 재개발이 아닌 Domain Pack 교체형 의사결정 플랫폼", 6.58, 5.05, 2.98, 0.19, { fontSize: 6.8, bold: true, color: C.white, align: "center", valign: "mid" });
}

// Speaker notes for the 10-minute main story.
pptx._slides[1].addNotes("문제는 정보 조회 자체가 아니라, 분리된 데이터와 정책을 실제 우선순위·예측·안전한 실행으로 연결하는 것입니다. 수치는 평가 보고서의 실측값만 사용했습니다.");
pptx._slides[2].addNotes("아키텍처 설명은 세 가지 원칙으로 압축합니다. 첫째 LLM과 Tool의 책임 분리, 둘째 검색과 충분성 판단 분리, 셋째 예측과 실행 사이의 Simulation/Approval Gate입니다.");
pptx._slides[3].addNotes("핵심 난제는 정확성 하나가 아니라 근거성·확률적 판단·실행 안전성을 동시에 만족하는 것이었습니다. 평가 표본의 한계는 반드시 함께 언급합니다.");

pptx.writeFile({ fileName: "WOONG_AI_AI_Master_최종발표.pptx" });

