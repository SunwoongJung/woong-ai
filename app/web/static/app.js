// WOONG AI — SPA (P1~P5)
const $ = (s) => document.querySelector(s);
let META = { base_date: null };
let LAST = { result: null, whatif: null, forecast: null, comparison: null, kpiDashboard: null, kpiTargets: null };
let CHAT = { sessionId: null, sessions: [], filter: "" };

const kpi = (res, name) => (res.kpis || []).find((k) => k.kpi_name === name) || {};
const fmtNum = (v, d = 1) => (v == null ? "—" : Number(v).toFixed(d));
const safeText = (s) => (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const KPI_META = {
  zone_occupancy: { label: "Zone 점유율", desc: "각 Zone의 전체 용량 대비 현재 적재량 비율", unit: "%" },
  saturated_zone_count: { label: "포화 Zone 수", desc: "점유율이 90%를 초과한 Zone 개수", unit: "개" },
  safety_stock_below_count: { label: "안전재고 미달 SKU 수", desc: "현재 재고가 안전재고보다 낮은 SKU 개수", unit: "개" },
  stocking_completion_rate: { label: "입고 완료율", desc: "입고 대상 중 적치 완료 상태인 건의 비율", unit: "%" },
  expected_shortage_count: { label: "예상 결품 주문 수", desc: "현재 가용재고로 요청 수량을 채우지 못하는(할당 부족) 출고 주문 수", unit: "건" },
  dead_stock_count: { label: "체화재고 SKU 수", desc: "저회전·최근 14일 무출고·유통기한 임박 중 하나 이상에 해당하는 SKU 수", unit: "개" },
  replenishment_needed_count: { label: "보충 필요 SKU 수", desc: "피킹 로케이션이 목표 재고 미만이고 보관에 보충 가능 재고가 있는 SKU 수", unit: "개" },
  shipping_delay_count: { label: "출고 지연 건수", desc: "시뮬레이션 기간 내 납기 초과가 발생한 출고 건수", unit: "건" },
  shipping_delay_cost: { label: "지연 비용(가중)", desc: "납기 초과 비용 — 고회전 SKU 포함 주문은 일반의 10배로 가중", unit: "" },
  picking_wait_minutes: { label: "피킹 대기 시간", desc: "피킹 작업이 시작되기 전까지 대기한 시간", unit: "분" },
  resource_utilization_team: { label: "작업팀 가동률", desc: "작업자 2명과 지게차 1대로 구성된 작업팀의 평균 사용률", unit: "%" },
  putaway_delay_count: { label: "적치지연 건수", desc: "입고 완료 후 적치가 지연된 건수", unit: "건" },
  zone_over_target_count: { label: "목표 초과 Zone 수", desc: "점유율이 목표를 초과한 Zone 수", unit: "개" },
  out_of_stock_count: { label: "품절 SKU 수", desc: "현재 가용재고가 0인 SKU 수(현재값)", unit: "개" },
  stockout_within_week_count: { label: "1주 내 소진 예상", desc: "7일 내 소진 예상 SKU 수(현재값)", unit: "건" },
  inventory_value: { label: "재고금액", desc: "보유 재고 수량 × 단가(현재값)", unit: "" },
  zone_max_occupancy: { label: "Zone 최대 점유율", desc: "시뮬레이션 중 각 Zone이 도달한 최대 점유율", unit: "%" },
  expected_stockout_date: { label: "예상 재고 소진일", desc: "시뮬레이션상 특정 SKU 재고가 소진될 것으로 예상되는 날짜", unit: "일자" },
};
const DATASET_ORDER = ["snapshot", "products", "zones", "locations", "inventory", "inbound_orders", "outbound_orders", "outbound_order_lines", "shipping_pending", "stocking_tasks", "picking_tasks", "resources", "process_time_params", "demand_history", "action_drafts", "dispatch_scores", "zone_routes", "action_exec_log", "simulation_runs", "simulation_kpis", "simulation_events"];
const DATASET_META = {
  snapshot: ["현재 스냅샷", "현재 창고 상태를 집계한 요약"],
  products: ["상품 마스터", "SKU별 상품명, 카테고리, 보관유형, 안전재고 등 기준 정보"],
  zones: ["Zone 마스터", "창고 Zone별 보관유형, 거리, 우선순위, 최대 용량"],
  locations: ["Location 마스터", "실제 적치 위치별 소속 Zone, 용량, 현재 점유 수량"],
  inventory: ["재고 원장", "SKU, LOT, 위치, 수량, 입고일, 유통기한, 재고 상태"],
  inbound_orders: ["입고 요청", "입고번호별 SKU, 수량, 예정일, 입고/적치 상태, 공급사"],
  outbound_orders: ["출고 요청", "출고번호별 고객, 우선순위, 납기, 출고 상태"],
  outbound_order_lines: ["출고 요청 라인", "출고 요청에 포함된 SKU별 수량 상세"],
  shipping_pending: ["출고 대기", "피킹/포장 후 출고 확정 대기 중인 건"],
  stocking_tasks: ["적치 작업", "입고 건을 특정 location에 적치하도록 발행된 작업"],
  picking_tasks: ["피킹 작업", "출고 주문에 대해 발행된 피킹 작업"],
  resources: ["작업 리소스", "작업자, 지게차 개별 ID와 활성 상태"],
  process_time_params: ["공정 시간 파라미터", "입고, 적치, 피킹, 포장/출고 단계별 시간 분포 파라미터"],
  demand_history: ["수요 이력", "SKU별 과거 출고 수요량"],
  dispatch_scores: ["작업 배정 계산 히스토리", "dispatch_score 휴리스틱 — 사이클별 후보 점수·인수·배정 결정"],
  zone_routes: ["ZONE 방문순서 계산 히스토리", "피킹 TSP closed-route — 방문존·최적순서·이동/작업시간(AUTO/HITL)"],
  action_exec_log: ["액션 실행 순서 로그", "사이클별 실행순(seq)·우선순위·결과 — 자원해제 최우선·priority 실행 검증"],
  action_drafts: ["승인 Draft", "승인 대기/승인/거부된 상태변경 후보 작업"],
  simulation_runs: ["시뮬레이션 실행 이력", "실행 버전, baseline/what-if 유형, 조건, 생성시각"],
  simulation_kpis: ["시뮬레이션 KPI 원장", "시뮬레이션 실행별 KPI 산출값"],
  simulation_events: ["시뮬레이션 이벤트", "재고소진, 출고지연, Zone 포화 등 시뮬레이션 중 발생 이벤트"],
};
const kpiLabel = (name) => (KPI_META[name] && KPI_META[name].label) || name;
const kpiDesc = (name) => (KPI_META[name] && KPI_META[name].desc) || "";

function daysFromBase(dateStr) {
  if (!dateStr || !META.base_date) return null;
  return Math.round((new Date(dateStr + "T00:00:00") - new Date(META.base_date + "T00:00:00")) / 86400000);
}
function earliestStockout(res) {
  const so = (res.kpis || []).filter((k) => k.kpi_name === "expected_stockout_date" && k.p50);
  if (!so.length) return null;
  so.sort((x, y) => new Date(x.p50) - new Date(y.p50));
  return so[0];
}
function cmpRow(comparison, name) { return (comparison || []).find((c) => c.kpi_name === name); }

function deltaChip(row, field, lowerIsBetter = true) {
  if (!row) return `<span class="kpi-delta flat">기준</span>`;
  const b = row["baseline_" + field], d = row["delta_" + field];
  if (b == null || d == null || !b) return `<span class="kpi-delta flat">기준 대비 —</span>`;
  const pct = (d / Math.abs(b)) * 100;
  const cls = d === 0 ? "flat" : (lowerIsBetter ? d < 0 : d > 0) ? "down" : "up";
  const arrow = d === 0 ? "→" : d < 0 ? "▼" : "▲";
  return `<span class="kpi-delta ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%<span class="base">기준 대비</span></span>`;
}

// 시뮬 지표 카드 = KPI 대시보드 9종으로 통일. 시나리오 지표는 버전 비교 delta, 정적 지표는 '현재값' 고정.
function renderKpis(res, comparison, invValue) {
  const zo = kpi(res, "zone_occupancy"), ut = kpi(res, "resource_utilization_team");
  const sd = kpi(res, "shipping_delay_count"), pd = kpi(res, "putaway_delay_count");
  const pw = kpi(res, "picking_wait_minutes"), zot = kpi(res, "zone_over_target_count");
  const oos = kpi(res, "out_of_stock_count"), sow = kpi(res, "stockout_within_week_count");
  const iv = kpi(res, "inventory_value");
  const STATIC = `<span class="kpi-delta flat">현재값</span>`;
  const invM = (iv.mean != null ? iv.mean : invValue);
  const cards = [
    { ico: "🗄", label: kpiLabel("zone_occupancy"), val: zo.mean != null ? fmtNum(zo.mean * 100, 1) : "—", unit: "%", delta: deltaChip(cmpRow(comparison, "zone_occupancy"), "mean") },
    { ico: "👥", label: kpiLabel("resource_utilization_team"), val: ut.mean != null ? fmtNum(ut.mean * 100, 1) : "—", unit: "%", delta: deltaChip(cmpRow(comparison, "resource_utilization_team"), "mean", false) },
    { ico: "🕐", label: kpiLabel("shipping_delay_count"), val: fmtNum(sd.mean, 2), unit: "건", delta: deltaChip(cmpRow(comparison, "shipping_delay_count"), "mean") },
    { ico: "📦", label: kpiLabel("putaway_delay_count"), val: fmtNum(pd.mean, 2), unit: "건", delta: deltaChip(cmpRow(comparison, "putaway_delay_count"), "mean") },
    { ico: "⏳", label: kpiLabel("picking_wait_minutes"), val: fmtNum(pw.p90, 1), unit: "분", delta: deltaChip(cmpRow(comparison, "picking_wait_minutes"), "p90") },
    { ico: "⚠", label: kpiLabel("zone_over_target_count"), val: fmtNum(zot.mean, 0), unit: "개", delta: deltaChip(cmpRow(comparison, "zone_over_target_count"), "mean") },
    { ico: "🚫", label: kpiLabel("out_of_stock_count"), val: oos.mean != null ? fmtNum(oos.mean, 0) : "—", unit: "개", delta: STATIC },
    { ico: "⌛", label: kpiLabel("stockout_within_week_count"), val: sow.mean != null ? fmtNum(sow.mean, 0) : "—", unit: "건", delta: STATIC },
    { ico: "💰", label: kpiLabel("inventory_value"), val: invM != null ? "₩" + (invM / 1e6).toFixed(1) + "M" : "—", unit: "", delta: STATIC },
  ];
  $("#kpi-row").innerHTML = cards.map((c) => `
    <div class="kpi"><div class="kpi-top"><span class="kpi-ico">${c.ico}</span>${c.label}</div>
      <div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div>${c.delta}</div>`).join("");
}

function pct(v, d = 1) { return v == null ? "—" : (Number(v) * 100).toFixed(d) + "%"; }
function fmtDuration(sec) {
  if (sec == null) return "—";
  sec = Math.max(0, Math.round(Number(sec)));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h}시간`);
  if (m) parts.push(`${m}분`);
  parts.push(`${s}초`);
  return parts.join(" ");
}

async function loadKpiTargets() {
  LAST.kpiTargets = await fetch("/kpi/targets").then((x) => x.json()).catch(() => ({}));
  const zi = $("#target-zone-occupancy"), ui = $("#target-utilization");
  if (zi && document.activeElement !== zi) zi.value = Math.round((LAST.kpiTargets.kpi_target_zone_occupancy ?? 0.8) * 100);
  if (ui && document.activeElement !== ui) ui.value = Math.round((LAST.kpiTargets.kpi_target_utilization ?? 0.9) * 100);
  return LAST.kpiTargets;
}

async function saveKpiTarget(key, pctValue) {
  await fetch("/kpi/targets", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value: Math.max(0, Math.min(100, Number(pctValue) || 0)) / 100 }),
  }).catch(() => {});
  await loadKpiTargets();
  await loadOperationKpis();
  await loadUtilizationTrend();
}

async function loadOperationKpis() {
  LAST.kpiDashboard = await fetch("/kpi/dashboard").then((x) => x.json()).catch(() => null);
  renderKpiDashboard();
  return LAST.kpiDashboard;
}

function renderOpsKpis() {
  const d = LAST.kpiDashboard; if (!d) return;
  const over = d.zone_over_target_list || [];
  $("#ops-kpi-row").innerHTML = [
    { ico: "▦", label: "Zone 점유율", val: pct(d.zone_occupancy_avg), delta: `<span class="kpi-delta flat">목표 ${pct(d.zone_occupancy_target)}</span>` },
    { ico: "👥", label: "작업팀 가동률", val: pct(d.team_utilization), delta: `<span class="kpi-delta flat">목표 ${pct(d.team_utilization_target)}</span>` },
    { ico: "🕐", label: "출고지연 건수", val: d.shipping_delay_count ?? "—", unit: "건", delta: `<span class="kpi-delta ${d.shipping_delay_count ? "up" : "flat"}">목표 0건</span>` },
    { ico: "📦", label: "적치지연 건수", val: d.putaway_delay_count ?? "—", unit: "건", delta: `<span class="kpi-delta ${d.putaway_delay_count ? "up" : "flat"}">목표 0건</span>` },
    { ico: "⏱", label: "피킹 대기 시간", val: fmtDuration(d.picking_wait_seconds), delta: `<span class="kpi-delta flat">${d.picking_wait_sample ? `실측 ${d.picking_wait_sample}건 평균` : "실측 데이터 없음"}${d.picking_wait_waiting_now ? ` · 대기중 ${d.picking_wait_waiting_now}건` : ""}</span>` },
    { ico: "!", label: "목표량 초과 Zone 수", val: d.zone_over_target_count ?? "—", unit: "개", delta: `<span class="kpi-delta flat">${over.length ? over.join(", ") : "없음"}</span>` },
    { ico: "🚫", label: "품절 SKU 수", val: d.out_of_stock_count ?? "—", unit: "개", delta: `<span class="kpi-delta ${d.out_of_stock_count ? "up" : "flat"}">재고 0 (수요 있음)</span>` },
    { ico: "⏳", label: "1주 내 소진 예상 재고", val: d.stockout_within_week_count ?? "—", unit: "건", delta: `<span class="kpi-delta flat">재고>0 · 목록은 하단 카드</span>` },
    { ico: "💰", label: "재고금액", val: d.inventory_value != null ? "₩" + (d.inventory_value / 1e6).toFixed(1) + "M" : "—", delta: `<span class="kpi-delta flat">기준일 ${d.reference_date || "—"}</span>` },
  ].map((c) => `
    <div class="kpi"><div class="kpi-top"><span class="kpi-ico">${c.ico}</span>${c.label}</div>
      <div class="kpi-val">${c.val}<span class="unit">${c.unit || ""}</span></div>${c.delta}</div>`).join("");

  const zones = d.zone_occupancy_list || [];
  if (!zones.length) {
    $("#zone-kpi-chart").innerHTML = `<div class="kpi-empty">Zone 점유율 데이터 없음</div>`;
  } else {
    svgBars($("#zone-kpi-chart"), zones.map((z) => ({
      label: z.zone_id,
      bars: [{ name: "점유율", value: Math.round(Number(z.occupancy || 0) * 100), color: Number(z.occupancy || 0) > d.zone_occupancy_target ? "#e1483b" : "#2f6bff" }],
    })), { hline: { y: Math.round(d.zone_occupancy_target * 100), label: "목표", color: "#e1483b" } });
  }

  renderStockoutList(d);
}

function renderStockoutList(d) {
  const el = $("#stockout-list"); if (!el) return;
  const oos = d.out_of_stock_items || [], within = d.stockout_within_week_items || [];
  let html = "";
  // 품절(재고 0) — 소진 예상과 별도 표기
  html += `<div class="so-sub">🚫 품절 (재고 0) ${d.out_of_stock_count ?? 0}건</div>`;
  html += oos.length
    ? `<table><thead><tr><th>SKU</th><th>일평균 소진</th></tr></thead><tbody>
        ${oos.map((it) => `<tr><td>${it.sku}</td><td class="num">${it.avg_daily_demand}</td></tr>`).join("")}</tbody></table>`
    : `<div class="kpi-empty">품절 SKU 없음</div>`;
  // 1주 내 소진 예상(재고>0)
  html += `<div class="so-sub">⏳ 1주 내 소진 예상 (재고>0) ${d.stockout_within_week_count ?? 0}건</div>`;
  html += within.length
    ? `<table><thead><tr><th>SKU</th><th>현재고</th><th>일평균 소진</th><th>소진까지(일)</th></tr></thead><tbody>
        ${within.map((it) => `<tr><td>${it.sku}</td><td class="num">${it.qty}</td><td class="num">${it.avg_daily_demand}</td><td class="num">${it.days_left}</td></tr>`).join("")}</tbody></table>`
    : `<div class="kpi-empty">1주 내 소진 예상 SKU 없음</div>`;
  el.innerHTML = html;
}

async function loadUtilizationTrend() {
  const r = await fetch("/kpi/trend/utilization?days=7").then((x) => x.json()).catch(() => null);
  const el = $("#util-trend-chart"); if (!el) return;
  if (!r || !r.series || !r.series.length) { el.innerHTML = `<div class="kpi-empty">데이터 없음</div>`; return; }
  const target = (LAST.kpiTargets && LAST.kpiTargets.kpi_target_utilization) ?? 0.9;
  svgLine(el, {
    labels: r.series.map((x) => x.date.slice(5)),
    series: [{ name: "가동률", color: "#2f6bff", area: true,
               values: r.series.map((x) => x.value == null ? null : Math.round(x.value * 100)) }],
    hlines: [{ y: Math.round(target * 100), label: "목표", color: "#e1483b" }],
  });
}

async function loadDelayTrend() {
  const r = await fetch("/kpi/trend/delays?days=7").then((x) => x.json()).catch(() => null);
  const el = $("#delay-trend-chart"); if (!el) return;
  if (!r || !r.series || !r.series.length) { el.innerHTML = `<div class="kpi-empty">데이터 없음</div>`; return; }
  svgBars(el, r.series.map((x) => ({
    label: x.date.slice(5),
    bars: [
      { name: "출고지연", value: x.shipping_delay_count, color: "#e1483b" },
      { name: "적치지연", value: x.putaway_delay_count, color: "#f0a13a" },
    ],
  })));
}

function renderKpiDashboard() {
  const sub = $("#kpi-board-sub");
  const d = LAST.kpiDashboard;
  if (sub) sub.textContent = `실제 운영 데이터 기준 KPI입니다. 기준일: ${d && d.reference_date ? d.reference_date : "-"}`;
  if (d) renderOpsKpis();
}

let DATA = { dataset: "snapshot", poll: null };

function renderDatasetTabs() {
  const bar = $("#dataset-tabs"); if (!bar) return;
  bar.innerHTML = DATASET_ORDER.map((id) =>
    `<button class="ds-tab${id === DATA.dataset ? " active" : ""}" data-ds="${id}">${DATASET_META[id][0]}</button>`).join("");
  bar.querySelectorAll(".ds-tab").forEach((b) => b.addEventListener("click", () => {
    DATA.dataset = b.dataset.ds;
    renderDatasetTabs();
    loadRawData();
  }));
}

function setupDataBrowser() {
  const bar = $("#dataset-tabs"); if (!bar) return;
  renderDatasetTabs();
}

function renderSnapshot(s) {
  if (!s) return;
  const sim = s.latest_simulation ? `${s.latest_simulation.version_name} · ${s.latest_simulation.run_type}` : "없음";
  const cards = [
    ["작업자", `${s.worker}명`, `지게차 ${s.forklift}대 · 가용 팀 ${s.team_count}조`],
    ["총 재고", fmtNum(s.inventory_units, 0), `재고가치 ₩${(Number(s.inventory_value || 0) / 1e6).toFixed(1)}M`],
    ["입고 대기", `${s.counts.inbound_waiting}건`, `적치대기 ${s.counts.stocking_waiting}건`],
    ["출고 작업", `${s.counts.outbound_planned}건`, `출고대기 ${s.counts.shipping_pending}건`],
    ["위험 지표", `${s.safety_stock_below_count} SKU`, `포화 Zone ${s.saturated_zone_count}개`],
    ["입고 완료율", pct(s.stocking_completion_rate), "입고 대상 대비 STOCKED 비율"],
    ["승인 대기", `${s.counts.action_drafts_pending}건`, "상태변경 Draft"],
    ["상품 마스터", `${s.counts.products}개`, "등록 SKU 수"],
    ["시뮬레이션", sim, "최신 저장 버전"],
    ["기준일", s.base_date, "운영 데이터 기준일"],
  ];
  $("#snapshot-grid").innerHTML = cards.map(([label, val, note]) => `
    <div class="snap-card"><div class="snap-label">${safeText(label)}</div>
      <div class="snap-value">${safeText(val)}</div><div class="snap-note">${safeText(note)}</div></div>`).join("");
}

async function loadDataSnapshot() {
  const s = await fetch("/data/snapshot").then((x) => x.json());
  renderSnapshot(s);
  return s;
}

function cellValue(v) {
  if (v == null) return "";
  const raw = typeof v === "object" ? JSON.stringify(v) : String(v);
  return safeText(raw.length > 180 ? raw.slice(0, 180) + "..." : raw);
}

function renderRawTable(data) {
  const meta = DATASET_META[data.dataset] || [data.dataset, ""];
  $("#data-table-title").textContent = meta[0];
  const desc = $("#data-table-desc"); if (desc) desc.textContent = meta[1] || "";
  const liveOn = DATA.poll && LIVE.running && data.dataset !== "snapshot";
  $("#data-table-meta").textContent = `${data.total}건${liveOn ? " · 🔴 실시간 자동갱신(3초)" : ""}`;
  if (!data.rows || !data.rows.length) {
    $("#raw-data-table").innerHTML = `<div class="raw-empty">조회 결과가 없습니다.</div>`;
    return;
  }
  const cols = Object.keys(data.rows[0]);
  $("#raw-data-table").innerHTML = `
    <table><thead><tr>${cols.map((c) => `<th>${safeText(c)}</th>`).join("")}</tr></thead>
    <tbody>${data.rows.map((row) => `<tr>${cols.map((c) => `<td>${cellValue(row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

async function loadRawData() {
  const dataset = DATA.dataset || "snapshot";
  if (dataset === "snapshot") {
    const s = await loadDataSnapshot();
    renderRawTable({
      dataset: "snapshot",
      total: 1,
      rows: [{ ...s, counts: JSON.stringify(s.counts), latest_simulation: JSON.stringify(s.latest_simulation) }],
    });
    return;
  }
  const data = await fetch(`/data/${encodeURIComponent(dataset)}?limit=200&offset=0`).then((x) => x.json());
  renderRawTable(data);
}

async function refreshDataBrowser() {
  await loadDataSnapshot().catch(() => {});
  await loadRawData().catch(() => {});
}

// 데이터 탭: 실시간 수요 ON일 때 현재 표를 3초마다 자동 갱신(새 행이 최신순으로 위에 쌓임)
function enterData() {
  if (DATA.poll) clearInterval(DATA.poll);
  DATA.poll = setInterval(() => {
    if (LIVE.running) { loadRawData().catch(() => {}); loadDataSnapshot().catch(() => {}); }
  }, 3000);
}
function leaveData() { if (DATA.poll) { clearInterval(DATA.poll); DATA.poll = null; } }

/* ---------- 자체 SVG 차트 ---------- */
function svgLine(el, cfg) {
  const W = 560, H = 250, pl = 46, pr = 14, pt = 16, pb = 30;
  const n = cfg.labels.length;
  const vals = [];
  cfg.series.forEach((s) => vals.push(...s.values.filter((v) => v != null)));
  (cfg.hlines || []).forEach((h) => vals.push(h.y));
  let mn = Math.min(0, ...vals), mx = Math.max(...vals, 1);
  if (mx === mn) mx = mn + 1;
  const X = (i) => pl + (n <= 1 ? 0 : (i * (W - pl - pr)) / (n - 1));
  const Y = (v) => pt + (1 - (v - mn) / (mx - mn)) * (H - pt - pb);
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  for (let g = 0; g <= 4; g++) {
    const yy = pt + (g / 4) * (H - pt - pb), vv = mx - (g / 4) * (mx - mn);
    svg += `<line x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}" stroke="#eef1f6"/>`;
    svg += `<text x="${pl - 6}" y="${yy + 3}" font-size="9" fill="#9aa3b0" text-anchor="end">${Math.round(vv)}</text>`;
  }
  cfg.labels.forEach((lb, i) => { if (n <= 12 || i % 2 === 0) svg += `<text x="${X(i)}" y="${H - 10}" font-size="9" fill="#9aa3b0" text-anchor="middle">${lb}</text>`; });
  (cfg.hlines || []).forEach((h) => {
    svg += `<line x1="${pl}" y1="${Y(h.y)}" x2="${W - pr}" y2="${Y(h.y)}" stroke="${h.color}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  });
  cfg.series.forEach((s) => {
    const pts = s.values.map((v, i) => (v == null ? null : `${X(i)},${Y(v)}`)).filter(Boolean).join(" ");
    if (s.area) svg += `<polygon points="${X(0)},${Y(mn)} ${pts} ${X(n - 1)},${Y(mn)}" fill="${s.color}" fill-opacity="0.10"/>`;
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-dasharray="${s.dashed ? "6 5" : ""}"/>`;
    s.values.forEach((v, i) => { if (v != null) svg += `<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${s.color}"/>`; });
  });
  svg += `</svg>`;
  const legend = `<div class="chart-legend">` +
    cfg.series.map((s) => `<span><i style="border-color:${s.color};${s.dashed ? "border-top-style:dashed" : ""}"></i>${s.name}</span>`).join("") +
    (cfg.hlines || []).map((h) => `<span><i style="border-color:${h.color};border-top-style:dashed"></i>${h.label}</span>`).join("") +
    `</div>`;
  el.innerHTML = svg + legend + `<div class="chart-tip"></div>`;
  // 툴팁
  const node = el.querySelector("svg"), tip = el.querySelector(".chart-tip");
  node.addEventListener("mousemove", (e) => {
    const r = node.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    let i = Math.round((vx - pl) / ((W - pl - pr) / Math.max(1, n - 1)));
    i = Math.max(0, Math.min(n - 1, i));
    const lines = cfg.series.map((s) => `${s.name}: ${s.values[i] == null ? "—" : Math.round(s.values[i])}`).join("<br>");
    tip.innerHTML = `<b>${cfg.labels[i]}</b><br>${lines}`;
    tip.style.left = ((X(i) / W) * r.width) + "px";
    tip.style.top = ((Y(cfg.series[0].values[i] ?? mn) / H) * r.height) + "px";
    tip.style.display = "block";
  });
  node.addEventListener("mouseleave", () => { tip.style.display = "none"; });
}

function svgBars(el, groups, opts = {}) {
  const W = 560, H = 250, pl = 46, pr = 14, pt = 16, pb = 36, gap = 40;
  const allv = groups.flatMap((g) => g.bars.map((b) => b.value));
  if (opts.hline) allv.push(opts.hline.y);
  const mx = Math.max(...allv, 1);
  const gw = (W - pl - pr - gap * (groups.length - 1)) / groups.length;
  const Y = (v) => pt + (1 - v / mx) * (H - pt - pb);
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  for (let g = 0; g <= 4; g++) { const yy = pt + (g / 4) * (H - pt - pb); svg += `<line x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}" stroke="#eef1f6"/>`; }
  groups.forEach((grp, gi) => {
    const gx = pl + gi * (gw + gap), bw = gw / grp.bars.length - 8;
    grp.bars.forEach((b, bi) => {
      const x = gx + bi * (gw / grp.bars.length), y = Y(b.value);
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${H - pb - y}" rx="4" fill="${b.color}"/>`;
      svg += `<text x="${x + bw / 2}" y="${y - 4}" font-size="9" fill="#5d6573" text-anchor="middle">${Math.round(b.value)}</text>`;
    });
    svg += `<text x="${gx + gw / 2}" y="${H - 12}" font-size="10" fill="#5d6573" text-anchor="middle">${grp.label}</text>`;
  });
  if (opts.hline) {
    const hy = Y(opts.hline.y);
    svg += `<line x1="${pl}" y1="${hy}" x2="${W - pr}" y2="${hy}" stroke="${opts.hline.color || "#e1483b"}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  }
  svg += `</svg>`;
  const names = groups[0].bars.map((b) => `<span><i style="border-color:${b.color};border-top-width:8px"></i>${b.name}</span>`).join("")
    + (opts.hline ? `<span><i style="border-color:${opts.hline.color || "#e1483b"};border-top-style:dashed"></i>${opts.hline.label || "목표"}</span>` : "");
  el.innerHTML = svg + `<div class="chart-legend">${names}</div>`;
}

// KPI 4종의 시뮬 horizon(7일) 일별 추이를 현재 기준 vs What-if 라인으로(%지표는 ×100)
function renderInsight() {
  const el = $("#insight-chart");
  const bDaily = LAST.result && LAST.result.kpi_daily;
  if (!bDaily || !bDaily.length) { el.textContent = "일별 KPI 데이터 없음 — 시뮬레이션을 실행하세요"; return; }
  const wDaily = (LAST.whatif && LAST.whatif.kpi_daily) || null;
  const days = bDaily.map((d) => "D" + d.day);
  const SPECS = [
    { key: "zone_occupancy", label: "Zone 점유율(%)", scale: 100 },
    { key: "shipping_delay_count", label: "출고지연(건)", scale: 1 },
    { key: "putaway_delay_count", label: "적치지연(건)", scale: 1 },
    { key: "resource_utilization_team", label: "가동률(%)", scale: 100 },
  ];
  el.innerHTML = `<div class="ins-grid">`
    + SPECS.map((sp) => `<div class="ins-cell"><div class="ins-cap">${sp.label}</div><div class="ins-mini" id="ins-${sp.key}"></div></div>`).join("")
    + `</div>`;
  SPECS.forEach((sp) => {
    const series = [{ name: "현재 기준", values: bDaily.map((d) => (d[sp.key] || 0) * sp.scale), color: "#16a34a" }];
    if (wDaily && wDaily.length) series.push({ name: "What-if", values: wDaily.map((d) => (d[sp.key] || 0) * sp.scale), color: "#2f6bff" });
    svgLine($("#ins-" + sp.key), { labels: days, series });
  });
}

/* ---------- 데이터 로드 ---------- */
async function loadResources() {
  const r = await fetch("/resources").then((x) => x.json());
  META = r;
  $("#baseline-banner").textContent =
    `현재 베이스라인 — 작업자 ${r.worker}명 · 지게차 ${r.forklift}대 (가용 팀 ${r.team_count}조). 팀 = 작업자2+지게차1, 남는 작업자나 지게차는 조를 이룰 수 없습니다.`;
  return r;
}
const setUpdated = () => { $("#updated").textContent = "최근 갱신 : " + new Date().toLocaleTimeString("ko-KR"); };

async function fetchForecast(sku) {
  if (!sku) return null;
  const fc = await fetch("/forecast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku, forecast_days: 14 }) }).then((x) => x.json());
  fc.sku = sku; return fc;
}

/* ---------- 버전 조회/비교 + 통합 렌더 (single source of truth = 표시 버전) ---------- */
let VERSIONS = [];
let BASELINE_VER = null;
const fmtTs = (ts) => (ts ? String(ts).replace("T", " ").slice(0, 16) : "—");
function verLabel(v) {
  const w = v.worker_count == null ? "?" : v.worker_count;
  const f = v.forklift_count == null ? "?" : v.forklift_count;
  return `${v.version_name} · 작업자 ${w}/지게차 ${f}`;
}
// 표시(좌)=유일한 BASELINE(현재 기준·반영시각), 비교(우)=WHATIF만(최신 기본)
async function loadVersions() {
  const r = await fetch("/simulation/versions").then((x) => x.json()).catch(() => ({ versions: [] }));
  VERSIONS = r.versions || [];
  BASELINE_VER = VERSIONS.find((v) => v.run_type === "BASELINE") || null;   // 최신순 → 첫 BASELINE(유일)
  const whatifs = VERSIONS.filter((v) => v.run_type === "WHATIF");
  const dv = $("#ver-display"), cv = $("#ver-compare");
  dv.innerHTML = BASELINE_VER
    ? `<option value="${BASELINE_VER.version_name}">현재 기준 · 반영 ${fmtTs(BASELINE_VER.created_at)}</option>`
    : `<option value="">(현재 기준 없음)</option>`;
  dv.disabled = true;   // 좌측은 항상 현재 기준으로 고정
  const keepC = cv.value;
  cv.innerHTML = `<option value="">(비교 안 함)</option>`
    + whatifs.map((v) => `<option value="${v.version_name}">${verLabel(v)}</option>`).join("");
  if (keepC && whatifs.some((v) => v.version_name === keepC)) cv.value = keepC;
  else if (whatifs.length) cv.value = whatifs[0].version_name;   // 기본: 최신 What-if
}
// 표시 버전(+선택적 비교 기준) 하나로 KPI·인사이트·트윈·타임라인을 일괄 렌더
async function renderAll(result, comparison) {
  if (!result) return;
  LAST.result = result; LAST.comparison = comparison || null;
  window.__lastParams = result.params;
  renderKpis(result, LAST.comparison, META.inventory_value);
  renderKpiDashboard();
  renderInsight();
  renderTwin(result.movement, result.zone_occupancy_timeseries);   // 트윈 = 표시 버전
  renderTimeline(result.bottleneck_events, result.params);         // 타임라인 = 같은 버전의 이벤트(리소스 기준 포함)
  const cmpName = $("#ver-compare").value;
  $("#version-badge").textContent = `현재 기준 (반영 ${fmtTs(BASELINE_VER && BASELINE_VER.created_at)})`
    + (comparison && cmpName ? ` · 비교 What-if ${cmpName}` : "");
  updateCommitState();
  setUpdated();
}
function updateCommitState() {
  const btn = $("#commit-baseline"); if (!btn) return;
  const cv = $("#ver-compare").value;
  btn.disabled = !cv;
  btn.title = cv ? "선택한 What-if의 작업자/지게차 수를 운영 기준으로 반영합니다"
                 : "비교할 What-if를 선택하면 활성화됩니다";
}
async function selectVersion() {
  if (!BASELINE_VER) { $("#version-badge").textContent = "현재 기준 없음 — 시뮬레이션을 실행하세요"; return; }
  const baseName = BASELINE_VER.version_name;
  const result = await fetch(`/simulation/versions/${encodeURIComponent(baseName)}`).then((x) => x.json()).catch(() => null);
  if (!result || result.error) { $("#version-badge").textContent = "현재 기준 로드 실패"; return; }
  let comparison = null, whatif = null;
  const cv = $("#ver-compare").value;   // 선택한 What-if — 비교 delta + 일별 궤적
  if (cv && cv !== baseName) {
    [whatif, comparison] = await Promise.all([
      fetch(`/simulation/versions/${encodeURIComponent(cv)}`).then((x) => x.json()).catch(() => null),
      fetch(`/simulation/compare?base=${encodeURIComponent(baseName)}&target=${encodeURIComponent(cv)}`)
        .then((x) => x.json()).then((c) => (c && c.comparison) || null).catch(() => null),
    ]);
  }
  LAST.whatif = (whatif && !whatif.error) ? whatif : null;
  await renderAll(result, comparison);
}

// 사용자 버튼용 인터락 — 현재와 동일 조건(증감 0/0)이면 실행 막고 알림. baseline 생성은 runSim 직접 호출.
async function runSimClick() {
  const wd = Number($("#worker-delta").value), fd = Number($("#forklift-delta").value);
  if (wd === 0 && fd === 0) {
    showToast({ kind: "info", id: "What-if", message: "현재 운영과 동일한 조건입니다. 작업자 또는 지게차 증감을 지정해 주세요." });
    return;
  }
  await runSim();
}

async function runSim() {
  const btn = $("#run-sim"); btn.disabled = true; btn.textContent = "실행 중...";
  const body = { horizon_days: Number($("#horizon").value), replications: Number($("#reps").value) };
  const wd = Number($("#worker-delta").value), fd = Number($("#forklift-delta").value);
  if (wd !== 0 || fd !== 0) body.scenario = { worker_delta: wd, forklift_delta: fd };
  try {
    const resp = await fetch("/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
    const ranWhatif = !!resp.scenario;
    await loadVersions();                                          // 새 버전 목록 반영(baseline 유일)
    if (ranWhatif && resp.scenario.version_name) $("#ver-compare").value = resp.scenario.version_name;  // 방금 What-if을 비교 대상으로
    await selectVersion();                                         // 좌=현재 기준 표시 + 선택 What-if 비교
  } catch (e) {
    $("#version-badge").textContent = "실행 오류: " + e;
  } finally {
    btn.disabled = false; btn.textContent = "▶ 시뮬레이션 실행";
  }
}

async function commitBaseline() {
  // 선택한 What-if(비교 대상)의 자원 수를 운영 기준으로 반영 → 새 BASELINE 재실행
  const cv = $("#ver-compare").value;
  if (!cv) return;
  const result = await fetch(`/simulation/versions/${encodeURIComponent(cv)}`).then((x) => x.json()).catch(() => null);
  const p = result && result.params;
  if (!p) return;
  $("#commit-baseline").disabled = true;
  await fetch(`/resources/update?worker=${p.worker_count}&forklift=${p.forklift_count}`, { method: "POST" }).catch(() => {});
  $("#worker-delta").value = 0; $("#forklift-delta").value = 0;   // 델타 초기화(다음 실행에 중복 가산 방지)
  await loadResources();
  await loadOperationKpis().catch(() => {});
  await runSim();                                                 // 새 기준으로 BASELINE 재실행(델타 0)
}

async function refreshDashboard() {
  await loadResources();
  await loadOperationKpis().catch(() => {});
  await refreshDataBrowser().catch(() => {});
  await runSim();
}

function activateTab(name) {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
  const panel = $("#panel-" + name); if (panel) panel.classList.remove("hidden");
  if (name !== "auto") leaveAuto();
  if (name !== "data") leaveData();
  if (name === "approval") loadApproval().catch(() => {});
  if (name === "trace") { loadTraces().catch(() => {}); loadSessionInto(TRACE_CTX).catch(() => {}); }
  if (name === "auto") enterAuto();
  if (name === "data") { refreshDataBrowser().catch(() => {}); enterData(); }
  if (name === "kpi") {
    loadKpiTargets().then(loadOperationKpis).catch(() => {});
    loadUtilizationTrend().catch(() => {});
    loadDelayTrend().catch(() => {});
  }
}
function setupTabs() {
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => activateTab(t.dataset.tab)));
  const dv = $("#ver-display"), cv = $("#ver-compare");
  if (dv) dv.addEventListener("change", selectVersion);
  if (cv) cv.addEventListener("change", selectVersion);
}

/* ---------- 디지털 트윈 (2D SVG) ---------- */
let COLDZONES = new Set();
async function loadZoneTypes() {
  try {
    const z = await fetch("/data/zones?limit=20").then((x) => x.json());
    COLDZONES = new Set((z.rows || []).filter((r) => r.storage_type === "COLD").map((r) => r.zone_id));
  } catch (_) { COLDZONES = new Set(); }
  try {   // 존 상세(용량·재고·상위SKU·보관유형) — 툴팁/보관유형 인코딩용
    const r = await fetch("/twin/zones").then((x) => x.json());
    TW.zmeta = {}; (r.zones || []).forEach((z) => { TW.zmeta[z.zone_id] = z; });
  } catch (_) { TW.zmeta = {}; }
}
const TW = { frames: [], occByDay: {}, zpos: {}, zmeta: {}, entrance: [1, -0.5], idx: 0, timer: null };
// 신호등 점유율 구간색 — 여유(초록)/주의(노랑)/포화(빨강). target=목표 점유율
function occBand(r, target) {
  r = Math.max(0, Math.min(r || 0, 1));
  if (r > 0.9) return { fill: "#e1483b", name: "포화" };
  if (r > (target || 0.8)) return { fill: "#e8a13a", name: "주의" };
  return { fill: "#2fae5f", name: "여유" };
}
// x·y 모두 4단위 → 정사각 viewBox(440×440)로 px/단위 동일(110). 존 왜곡(좌우 늘림) 제거
const TW_W = 440, TW_H = 440, TW_XMIN = -1, TW_XMAX = 3, TW_YMIN = -1.2, TW_YMAX = 2.8, ZH = 0.4;
const txc = (x) => ((x - TW_XMIN) / (TW_XMAX - TW_XMIN)) * TW_W;
const tyc = (y) => (1 - (y - TW_YMIN) / (TW_YMAX - TW_YMIN)) * TW_H;
const STATE_COLOR = { MOVING: "#1f77b4", WORKING: "#d62728", IDLE: "#999999" };
const JOB_META = { INBOUND: { color: "#028090", icon: "📥", label: "적치" }, OUTBOUND: { color: "#f0a13a", icon: "🛒", label: "피킹" } };
function occColor(r) {
  r = Math.max(0, Math.min(r || 0, 1));
  return `rgb(255,${Math.round(255 * (1 - r) ** 1.6)},${Math.round(255 * (1 - r) ** 1.9)})`;
}
function dirArrow(h) { h = ((h % 360) + 360) % 360; return h < 45 || h >= 315 ? "⬆" : h < 135 ? "➡" : h < 225 ? "⬇" : "⬅"; }

// 작업 이벤트(work_log)를 일자·존별로 인덱싱 — 작업 완료·진행에 따라 점유율이 즉시 움직이도록
function buildWorkIndex(workLog) {
  TW.dayKeys = Object.keys(TW.occByDay).sort();
  TW.workByZoneDay = {};
  workLog.forEach((e) => {
    const d = String(e.end_time).split(" ")[0];
    const byZone = (TW.workByZoneDay[d] = TW.workByZoneDay[d] || {});
    (byZone[e.zone_id] = byZone[e.zone_id] || []).push(e);
  });
  for (const d in TW.workByZoneDay)
    for (const z in TW.workByZoneDay[d])
      TW.workByZoneDay[d][z].sort((a, b) => (a.end_time > b.end_time ? 1 : -1));
}
const _mm = (s) => { const t = String(s).split(" ")[1] || "00:00"; const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// 프레임 시각 기준 zone 실시간 점유율 — 당일 기준값에서 익일 기준값으로, 그날 작업이
// 완료/진행되는 만큼 비례 이동. 작업이 진행 중인 이벤트는 부분(0~1) 반영 → 숫자가 즉시 변한다.
function liveOcc(z, f) {
  const day = String(f.time).split(" ")[0];
  const base = (TW.occByDay[day] || {})[z];
  if (base == null) return 0;
  const days = TW.dayKeys || [];
  const di = days.indexOf(day);
  const nextDay = di >= 0 && di < days.length - 1 ? days[di + 1] : null;
  const target = nextDay ? ((TW.occByDay[nextDay] || {})[z] ?? base) : base;
  const evs = (TW.workByZoneDay[day] || {})[z] || [];
  if (!evs.length || Math.abs(target - base) < 1e-6) return base;
  const ft = _mm(f.time);
  let prog = 0;
  for (const e of evs) {
    const es = _mm(e.start_time), ee = _mm(e.end_time);
    if (ft >= ee) prog += 1;
    else if (ft > es && ee > es) prog += (ft - es) / (ee - es);
  }
  return base + (target - base) * Math.min(prog / evs.length, 1);
}
// 현재 프레임에서 각 팀이 작업 중인 zone 판정(접근점 최근접) → 실시간 강조·증감 표시용
function activeZonesInFrame(f, zpos) {
  const zh = TW.zoneHalf ?? 0.38, ag = TW.accessGap ?? 0.5, out = {};
  (f.teams || []).forEach((m) => {
    if (m.state !== "WORKING") return;
    let bz = null, bd = 1e9;
    for (const [z, p] of zpos) {
      const d = (m.x - (p[0] - zh - ag)) ** 2 + (m.y - p[1]) ** 2;
      if (d < bd) { bd = d; bz = z; }
    }
    if (bz && bd < 0.6) out[bz] = m.job;   // INBOUND=적치(▲) / OUTBOUND=피킹(▼)
  });
  return out;
}

function twFrameSvg(i) {
  const f = TW.frames[i]; if (!f) return "";
  const target = TW.target || 0.8;
  let s = `<svg viewBox="0 0 ${TW_W} ${TW_H}" preserveAspectRatio="xMidYMid meet">`;
  s += `<defs><filter id="tw-glow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="3.2" flood-color="#e1483b" flood-opacity="0.85"/></filter></defs>`;

  // --- B2: 창고 바닥 + 통로 레인 + 도크 도어 ---
  const zpos = Object.entries(TW.zpos), xs = zpos.map((e) => e[1][0]), ys = zpos.map((e) => e[1][1]);
  const fx0 = txc(Math.min(...xs) - ZH - 0.3), fx1 = txc(Math.max(...xs) + ZH + 0.3);
  const fy0 = tyc(Math.max(...ys) + ZH + 0.3), fy1 = tyc(Math.min(...ys) - ZH - 0.7);
  s += `<rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}" rx="10" fill="#eef1f6" stroke="#dbe1ea"/>`;
  [...new Set(ys)].sort((a, b) => b - a).slice(1).forEach((yv, k, arr) => {   // 행 사이 통로 레인
    const prev = [...new Set(ys)].sort((a, b) => b - a);
    const ly = (prev[k] + prev[k + 1]) / 2, yy = tyc(ly);
    s += `<rect x="${fx0 + 6}" y="${yy - 5}" width="${fx1 - fx0 - 12}" height="10" fill="#e4e9f1"/>`;
    s += `<line x1="${fx0 + 8}" y1="${yy}" x2="${fx1 - 8}" y2="${yy}" stroke="#cdd5e2" stroke-dasharray="3 6"/>`;
  });
  const dl = ["입고", "출고", "입고"], dw = 34, dgap = (fx1 - fx0 - dl.length * dw) / (dl.length + 1);
  dl.forEach((lb, k) => {   // 도크 도어(바닥 하단)
    const dx = fx0 + dgap * (k + 1) + dw * k;
    s += `<rect x="${dx}" y="${fy1 - 5}" width="${dw}" height="9" rx="2" fill="${lb === "입고" ? "#028090" : "#f0a13a"}"/>`;
    s += `<text x="${dx + dw / 2}" y="${fy1 - 8}" font-size="8.5" fill="#5d6573" text-anchor="middle">${lb}</text>`;
  });

  // --- 존 = 랙 블록 (A1 채움바 · A2 신호등색 · A3 포화강조 · C2 보관유형) ---
  const activeZones = activeZonesInFrame(f, zpos);   // 지금 작업 중인 존 → 실시간 강조·증감
  for (const [z, p] of zpos) {
    const x0 = txc(p[0] - ZH), y0 = tyc(p[1] + ZH), w = txc(p[0] + ZH) - x0, h = tyc(p[1] - ZH) - y0;
    const ratio = liveOcc(z, f), band = occBand(ratio, target), over = ratio > target, full = ratio > 0.9;
    const actJob = activeZones[z];                   // INBOUND(적치)·OUTBOUND(피킹)·undefined
    const cold = (TW.zmeta[z] && TW.zmeta[z].storage_type === "COLD") || COLDZONES.has(z);
    const glow = full ? ' filter="url(#tw-glow)"' : "";
    // 컨테이너(랙) — 작업 중이면 작업색 테두리로 강조
    const rackStroke = actJob ? (JOB_META[actJob] || {}).color || "#333" : (cold ? "#3b82f6" : "#b9c3d4");
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="4" fill="#ffffff" stroke="${rackStroke}" stroke-width="${actJob ? 2.6 : cold ? 2 : 1.2}"${cold && !actJob ? ' stroke-dasharray="5 3"' : ""}${glow}/>`;
    // 채움 바(아래→위, 신호등색)
    const fh = Math.max(0, Math.min(h, h * ratio));
    if (fh > 0) s += `<rect x="${x0 + 1.5}" y="${y0 + h - fh}" width="${w - 3}" height="${fh}" rx="2" fill="${band.fill}" fill-opacity="0.82"/>`;
    // 랙 선반 라인(수직) + 목표 점선
    for (const fr of [0.33, 0.66]) s += `<line x1="${x0 + w * fr}" y1="${y0 + 2}" x2="${x0 + w * fr}" y2="${y0 + h - 2}" stroke="#000" stroke-opacity="0.05"/>`;
    s += `<line x1="${x0}" y1="${y0 + h * (1 - target)}" x2="${x0 + w}" y2="${y0 + h * (1 - target)}" stroke="#e1483b" stroke-width="1" stroke-dasharray="3 3" stroke-opacity="0.7"/>`;
    if (cold) s += `<text x="${x0 + 12}" y="${y0 + 15}" font-size="12">❄</text>`;
    if (over) s += `<text x="${x0 + w - 12}" y="${y0 + 15}" font-size="12" text-anchor="middle">⚠</text>`;
    s += `<text x="${txc(p[0])}" y="${tyc(p[1]) - 3}" font-size="11" font-weight="700" fill="#22304d" text-anchor="middle">${z.replace("ZONE_", "")}</text>`;
    const pctFill = actJob ? (JOB_META[actJob] || {}).color || "#33415a" : "#33415a";
    const arrow = actJob === "INBOUND" ? " ▲" : actJob === "OUTBOUND" ? " ▼" : "";
    s += `<text x="${txc(p[0])}" y="${tyc(p[1]) + 12}" font-size="9.5" font-weight="${actJob ? 800 : 600}" fill="${pctFill}" text-anchor="middle">${Math.round(ratio * 100)}%${arrow}</text>`;
    // C1: 호버 영역(투명) — 툴팁용
    s += `<rect class="tw-zone" data-zone="${z}" data-occ="${Math.round(ratio * 100)}" x="${x0}" y="${y0}" width="${w}" height="${h}" fill="transparent" style="cursor:pointer"/>`;
  }
  // teams — 작업 중이면 적치(청록)/피킹(주황)으로 링 색 구분 + 작업 배지
  (f.teams || []).forEach((m) => {
    const cx = txc(m.x), cy = tyc(m.y);
    const jm = m.state === "WORKING" && m.job ? JOB_META[m.job] : null;
    const col = jm ? jm.color : (STATE_COLOR[m.state] || "#999");
    s += `<circle cx="${cx}" cy="${cy}" r="12" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="1.6"/>`;
    s += `<text x="${cx}" y="${cy + 5}" font-size="14" text-anchor="middle">🚜</text>`;
    s += `<text x="${cx}" y="${cy - 14}" font-size="12" fill="${col}" text-anchor="middle">${dirArrow(m.heading)}</text>`;
    if (jm) s += `<text x="${cx + 13}" y="${cy - 7}" font-size="12" text-anchor="middle">${jm.icon}</text>`;
  });
  s += `</svg>`;
  return s;
}
function twSetFrame(i) {
  TW.idx = Math.max(0, Math.min(i, TW.frames.length - 1));
  const host = $("#tw-svg");
  let canvas = host.querySelector(".tw-canvas");
  if (!canvas) {   // SVG는 canvas에만, 툴팁(.tw-tip)은 프레임 갱신 시 보존
    host.innerHTML = `<div class="tw-canvas"></div><div class="tw-tip"></div>`;
    host.style.position = "relative";
    canvas = host.querySelector(".tw-canvas");
  }
  canvas.innerHTML = twFrameSvg(TW.idx);
  $("#tw-range").value = String(TW.idx);
  $("#tw-time").textContent = TW.frames[TW.idx] ? TW.frames[TW.idx].time : "--";
}
function renderTwin(movement, occTs) {
  if (TW.timer) { clearInterval(TW.timer); TW.timer = null; $("#tw-play").textContent = "▶ 재생"; }
  if (!movement || !movement.frames || !movement.frames.length) { $("#tw-svg").textContent = "이동 데이터 없음"; return; }
  TW.frames = movement.frames; TW.zpos = movement.zone_pos || {}; TW.entrance = movement.entrance || [1, -0.5];
  TW.zoneHalf = movement.zone_half ?? 0.38; TW.accessGap = movement.access_gap ?? 0.5;
  TW.occByDay = {};
  (occTs || []).forEach((row) => { const d = String(row.sim_time).split(" ")[0]; if (!(d in TW.occByDay)) TW.occByDay[d] = row.occupancy || {}; });
  buildWorkIndex(movement.work_log || []);   // 작업 이벤트→zone 실시간 점유 반영용 인덱스
  TW.target = (LAST.kpiTargets && Number(LAST.kpiTargets.kpi_target_zone_occupancy)) || 0.8;   // 목표 점유율(신호등 기준)
  $("#tw-teaminfo").textContent = `· 팀 ${movement.team_count}조 (작업자 ${movement.team_count * 2}+지게차 ${movement.team_count})`;
  $("#tw-range").max = String(TW.frames.length - 1);
  twSetFrame(0);
  setupTwinTooltip();
}

// C1: 존 호버 툴팁 — 보관유형·용량·현재재고·점유율·상위 SKU
function setupTwinTooltip() {
  const host = $("#tw-svg"); if (!host || host._twTip) return;
  host._twTip = true;   // 이벤트는 한 번만 위임 등록(툴팁 div는 twSetFrame이 유지)
  host.addEventListener("mousemove", (e) => {
    const tip = host.querySelector(".tw-tip"); if (!tip) return;
    const zr = e.target.closest && e.target.closest(".tw-zone");
    if (!zr) { tip.style.display = "none"; return; }
    const z = zr.dataset.zone, m = TW.zmeta[z] || {}, occ = zr.dataset.occ;
    const tops = (m.top_skus || []).map((t) => `${t.sku} ${t.qty}`).join(" · ") || "-";
    tip.innerHTML = `<b>${z.replace("ZONE_", "존 ")}</b> <span class="tw-tip-tag">${m.storage_type === "COLD" ? "❄ 냉장" : "상온"}</span>`
      + `<div>점유율(시뮬) <b>${occ}%</b> · 목표 ${Math.round((TW.target || 0.8) * 100)}%</div>`
      + `<div>용량 ${m.max_capacity ?? "-"} · 현재재고 ${m.current_qty ?? "-"} (실측 ${Math.round((m.occupancy || 0) * 100)}%)</div>`
      + `<div>상위 SKU: ${tops}</div>`;
    tip.style.display = "block";
    const r = host.getBoundingClientRect();
    let x = e.clientX - r.left + 12, y = e.clientY - r.top + 12;
    if (x + 190 > r.width) x = e.clientX - r.left - 190;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  host.addEventListener("mouseleave", () => { const tip = host.querySelector(".tw-tip"); if (tip) tip.style.display = "none"; });
}
function twTogglePlay() {
  if (TW.timer) { clearInterval(TW.timer); TW.timer = null; $("#tw-play").textContent = "▶ 재생"; return; }
  $("#tw-play").textContent = "⏸ 정지";
  TW.timer = setInterval(() => twSetFrame((TW.idx + 1) % TW.frames.length), 220);
}

/* ---------- Event Timeline ---------- */
const EVT_META = {
  STOCKOUT: ["stockout", "재고소진"], SHIPPING_DELAY: ["delay", "출고지연"],
  STOCKING_FAILED: ["stocking", "적치실패"], ZONE_SATURATED: ["stocking", "Zone 포화"],
  NO_AVAILABLE_TEAM: ["delay", "가용팀 없음"],
};
function evtDetail(e) {   // 이벤트별 사유·리소스 상세
  const d = e.detail || {}, t = e.event_type;
  if (t === "STOCKING_FAILED") return `${d.zone_id || ""} 잔여용량 부족 — ${d.overflow || 0}개 미적치 (존 포화로 적치 불가)`;
  if (t === "ZONE_SATURATED") return `${d.zone_id || ""} 포화`;
  if (t === "SHIPPING_DELAY") return `${d.order_no || ""} 납기 초과${d.due ? ` (마감 ${d.due})` : ""}`;
  if (t === "STOCKOUT") return `${d.sku || ""} 재고소진${d.short ? ` (${d.short}개 부족)` : ""}`;
  if (t === "NO_AVAILABLE_TEAM") return `가용 작업팀 없음 (작업자 ${d.worker_count ?? "-"}·지게차 ${d.forklift_count ?? "-"})`;
  return d.zone_id || d.order_no || d.sku || "";
}
function renderTimeline(events, params) {
  const el = $("#evt-list"), p = params || {};
  const head = p.team_count != null
    ? `<div class="evt-head">리소스 기준: <b>작업팀 ${p.team_count}조</b> (작업자 ${p.worker_count}·지게차 ${p.forklift_count}) — 팀 용량 병목으로 발생한 이벤트</div>`
    : "";
  if (!events || !events.length) { el.innerHTML = head + `<div class="evt-empty">병목 이벤트 없음</div>`; return; }
  el.innerHTML = head + events.slice(0, 14).map((e) => {
    const [cls, label] = EVT_META[e.event_type] || ["info", e.event_type];
    return `<div class="evt-item"><span class="evt-time">${escapeHtml(e.sim_time)}</span>
      <span class="evt-badge ${cls}">${label}</span><span class="evt-detail">${escapeHtml(evtDetail(e))}</span></div>`;
  }).join("");
}

async function loadSessions() {
  try {
    const r = await fetch("/sessions?user_id=operator01").then((x) => x.json());
    CHAT.sessions = r.sessions || [];
  } catch (_) { CHAT.sessions = []; }
  renderSessions();
}
function renderSessions() {
  const list = $("#chat-list"); if (!list) return;
  const f = CHAT.filter.trim().toLowerCase();
  const items = CHAT.sessions.filter((s) => !f || (s.title || "").toLowerCase().includes(f));
  if (!items.length) {
    list.innerHTML = `<div class="ci-empty">${f ? "검색 결과 없음" : "대화 이력이 없습니다"}</div>`;
    return;
  }
  list.innerHTML = items.map((s) => {
    const when = (s.updated_at || "").replace("T", " ").slice(5, 16);
    const active = s.session_id === CHAT.sessionId ? " active" : "";
    return `<div class="chat-item${active}" data-sid="${safeText(s.session_id)}">
      <div class="ci-title">💬 ${safeText(s.title || "새 대화")}</div>
      <div class="ci-meta">${safeText(when)} · ${s.msg_count || 0}메시지</div></div>`;
  }).join("");
  list.querySelectorAll(".chat-item").forEach((el) =>
    el.addEventListener("click", () => openSession(el.dataset.sid)));
}
async function openSession(sid) {
  if (!sid) return;
  CHAT.sessionId = sid;
  const r = await fetch(`/sessions/${sid}`).then((x) => x.json()).catch(() => null);
  const msgs = (r && r.messages) || [];
  renderMessages(CHAT_CTX, msgs);     // Agent Chat 표면
  renderMessages(TRACE_CTX, msgs);    // AI 관측 표면
  TRACE.runId = null;
  loadTraces(sid).catch(() => {});    // 이 세션의 실행 이력만
  const active = document.querySelector(".tab.active");
  const at = active && active.dataset.tab;
  if (at !== "chat" && at !== "trace") activateTab("chat");  // 다른 탭이면 채팅으로
  renderSessions();
}

/* ---------- Agent Chat ---------- */
const CHAT_SUGGESTS = ["오늘 뭐 해야 돼?", "KPI 상황 알려줘", "SKU_A001 언제 소진돼?", "왜 Zone A를 추천했어?", "이번 주 창고 상황 예측해줘"];
const CHAT_EMPTY_HTML = `<div class="chat-empty" id="chat-empty">
  <div class="ce-title">무엇을 도와드릴까요?</div>
  <div class="ce-sub">오늘 할 일, 적치·피킹 추천, 재고 소진 예측, 시뮬레이션을 자연어로 물어보세요.</div>
</div>`;
const TRACE_EMPTY_HTML = `<div class="chat-empty"><div class="ce-title">AI 동작 관측</div>
  <div class="ce-sub">질문하면 노드 동작이 단계별로 보입니다. 좌측에서 세션을 선택하세요.</div></div>`;
// 두 채팅 표면: Agent Chat(스텝 숨김) / AI 관측(스텝 표시)
const CHAT_CTX = { inner: "thread-inner", scroll: "chat-scroll", root: "chat-root", text: "chat-text", send: "chat-send", steps: false, emptyHtml: CHAT_EMPTY_HTML };
const TRACE_CTX = { inner: "trace-thread-inner", scroll: "trace-scroll", root: "trace-chat-root", text: "trace-text", send: "trace-send", steps: true, emptyHtml: TRACE_EMPTY_HTML };

function renderMessages(ctx, msgs) {
  const innerEl = document.getElementById(ctx.inner); if (!innerEl) return;
  const root = document.getElementById(ctx.root);
  innerEl.innerHTML = "";
  if (!msgs || !msgs.length) { if (root) root.classList.add("is-empty"); innerEl.innerHTML = ctx.emptyHtml; return; }
  if (root) root.classList.remove("is-empty");
  msgs.forEach((m) => {
    if (m.role === "user") appendBubble("user", escapeHtml(m.content), ctx);
    else {
      let src = []; try { src = JSON.parse(m.sources_json || "[]"); } catch (_) {}
      colorizeKpiTables(appendBubble("bot", mdToHtml(m.content) + renderSources(src), ctx));
    }
  });
}
async function loadSessionInto(ctx) {
  if (!CHAT.sessionId) { renderMessages(ctx, []); return; }
  const r = await fetch(`/sessions/${CHAT.sessionId}`).then((x) => x.json()).catch(() => null);
  renderMessages(ctx, (r && r.messages) || []);
}
const escapeHtml = (s) => (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 경량 마크다운 렌더 — 표(GFM), 굵게(**), 인라인코드(`) + 줄바꿈. 채팅 응답용.
function mdToHtml(src) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const align = (c) => { const t = c.trim(); return t.startsWith(":") && t.endsWith(":") ? "center" : t.endsWith(":") ? "right" : ""; };
  const lines = String(src || "").split("\n"), out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i], nx = lines[i + 1] || "";
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(nx)) {   // 표 헤더 + 구분행
      const head = cells(l), al = cells(nx).map(align), rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      let t = `<table class="md-table"><thead><tr>` + head.map((h, k) => `<th${al[k] ? ` style="text-align:${al[k]}"` : ""}>${inline(h)}</th>`).join("") + `</tr></thead><tbody>`;
      rows.forEach((r) => { t += `<tr>` + r.map((c, k) => `<td${al[k] ? ` style="text-align:${al[k]}"` : ""}>${inline(c)}</td>`).join("") + `</tr>`; });
      out.push(t + `</tbody></table>`);
      continue;
    }
    out.push(inline(l));
    i++;
  }
  return out.join("<br>").replace(/(<\/table>)<br>/g, "$1").replace(/<br>(<table)/g, "$1");
}

// KPI 증감 방향 판정 — 점유율·지연류=낮을수록 좋음, 가동률=중립
function kpiDeltaClass(name, deltaText) {
  const num = parseFloat(String(deltaText).replace(/[▲▼]/g, "").replace(/[^0-9.\-−]/g, "").replace("−", "-"));
  if (!isFinite(num) || num === 0) return "";
  if (/가동|util/i.test(name)) return "";              // 가동률: 좋/나쁨 판단 안 함(중립)
  return num < 0 ? "kpi-good" : "kpi-bad";             // 점유율·출고/적치지연 등: 낮을수록 좋음
}

// 렌더된 결과표의 '증감' 열을 KPI 방향에 맞춰 색칠
function colorizeKpiTables(container) {
  if (!container) return;
  container.querySelectorAll(".md-table").forEach((tbl) => {
    const heads = [...tbl.querySelectorAll("thead th")].map((h) => h.textContent.trim());
    const di = heads.findIndex((h) => h.includes("증감") || /delta/i.test(h));
    if (di < 0) return;
    tbl.querySelectorAll("tbody tr").forEach((tr) => {
      const cells = tr.querySelectorAll("td");
      if (!cells[di]) return;
      const cls = kpiDeltaClass(cells[0] ? cells[0].textContent : "", cells[di].textContent);
      if (cls) cells[di].classList.add(cls);
    });
  });
}
const chatScrollBottom = (ctx) => { const sc = document.getElementById((ctx || CHAT_CTX).scroll); if (sc) sc.scrollTop = sc.scrollHeight; };
const chatThread = () => $("#thread-inner") || $("#chat-scroll");

function appendBubble(role, inner, ctx) {
  ctx = ctx || CHAT_CTX;
  const innerEl = document.getElementById(ctx.inner);
  const empty = innerEl.querySelector(".chat-empty"); if (empty) empty.remove();
  const root = document.getElementById(ctx.root); if (root) root.classList.remove("is-empty");
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  const who = role === "user" ? "사용자" : "Woong AI";
  wrap.innerHTML = `<div class="role-tag">${who} :</div><div class="bubble">${inner}</div>`;
  innerEl.appendChild(wrap);
  chatScrollBottom(ctx);
  return wrap;
}
function renderSources(sources) {
  if (!sources || !sources.length) return "";
  const items = sources.map((s) => `<span class="src">${escapeHtml(s.source)}${s.section ? " · " + escapeHtml(s.section) : ""}</span>`).join("");
  return `<div class="msg-src"><span class="src-label">근거</span>${items}</div>`;
}
function renderDryRun(dry) {
  if (!dry || (!(dry.changes || []).length && !(dry.warnings || []).length)) return "";
  const ch = (dry.changes || []).map((c) => {
    const tgt = (c.table || "") + (c.field ? "." + c.field : "") + (c.sku ? " (" + c.sku + ")" : "");
    const val = c.after !== undefined ? c.after : (c.qty_change !== undefined ? c.qty_change : "");
    const bef = (c.before !== undefined && c.before !== null) ? escapeHtml(c.before) + " → " : "";
    return `<li>${escapeHtml(tgt)}: ${bef}${escapeHtml(val)}</li>`;
  }).join("");
  const wn = (dry.warnings || []).map((w) => `<li class="warn">⚠ ${escapeHtml(w)}</li>`).join("");
  return `<ul class="dry">${ch}${wn}</ul>`;
}
function renderApproval(drafts, toolResults) {
  if (!drafts || !drafts.length) return "";
  const valid = drafts.filter((d) => d && d.draft_id);
  if (!valid.length) return "";
  const TYPE = { STK: "적치지시 생성", PCK: "피킹지시 발행", SHP: "출고확정", PO: "발주",
    ALC: "재고 할당", RPL: "재고보충", DSP: "처분" };
  const single = valid.length === 1;
  return valid.map((d) => {                        // 다건이면 SKU별 카드를 각각 렌더(개별 승인/거부/보류)
    const id = d.draft_id || "";
    const label = TYPE[(id.split("-")[1] || "")] || "상태 변경";
    const dry = d.dry_run || (single && toolResults && toolResults.dry_run) || null;
    return `<div class="approval" data-draft="${escapeHtml(id)}">
      <div class="ap-head">⚠ 승인이 필요한 작업 — ${label}</div>
      <div class="ap-id">${escapeHtml(id)}</div>
      ${renderDryRun(dry)}
      <div class="ap-actions">
        <button class="btn-primary ap-yes">승인</button>
        <button class="btn-ghost ap-no">거부</button>
        <button class="btn-ghost ap-hold">보류</button>
      </div></div>`;
  }).join("");
}
function wireApproval(node, toolResults, onDone) {
  const box = node.classList && node.classList.contains("approval") ? node : node.querySelector(".approval");
  if (!box) return;
  const id = box.dataset.draft;
  const done = (txt, cls) => {
    box.innerHTML = `<div class="ap-done ${cls}">${txt}</div>`;
    if (onDone) setTimeout(onDone, 700);
  };
  const call = async (approved) => {
    box.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      const res = await fetch("/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft_id: id, approved, user_id: "operator01" }) }).then((x) => x.json());
      if (res.error) { done("처리 오류: " + escapeHtml(res.error), "err"); return; }
      if (approved) { done("✓ 승인되어 실행되었습니다. (" + escapeHtml(res.status || "EXECUTED") + ")", "ok"); loadResources().catch(() => {}); }
      else done("✕ 거부되었습니다. (REJECTED 보관)", "no");
    } catch (e) { done("요청 실패: " + escapeHtml(String(e)), "err"); }
  };
  box.querySelector(".ap-yes").addEventListener("click", () => call(true));
  box.querySelector(".ap-no").addEventListener("click", () => call(false));
  const hold = box.querySelector(".ap-hold");
  if (hold) hold.addEventListener("click", () => {
    // 보류: DB 상태 변경 없음(PENDING 유지) → Approval 탭 승인 대기 목록에 남아 일괄 처리 가능
    box.innerHTML = `<div class="ap-done mut">⏸ 보류했습니다 — Approval 탭 ‘승인 대기’에서 일괄 처리하세요.</div>`;
  });
}
// ---------- Approval 탭 ----------
const ACTION_LABEL = { ALLOCATION: "할당", STOCKING: "적치지시", PICKING: "피킹지시",
  SHIPPING: "출고확정", REPLENISH: "재고보충", DISPOSAL: "처분", ORDER: "발주" };

const AP_STATUS_LABEL = { EXECUTED: "실행 완료", REJECTED: "거부", PENDING_APPROVAL: "승인 대기" };

function apDrawCard(d, pending) {
  const label = ACTION_LABEL[d.action_type] || d.action_type;
  const when = (d.executed_at || d.approved_at || d.created_at || "").replace("T", " ").slice(5, 16);
  const arr = d.arrival || null;                    // 발주 실행건의 입고 도착여부
  // 상태 배지: 발주 실행건은 실행 완료가 아니라 '입고 대기 / 입고 완료'로 표기(삭제 가능 시점을 알림)
  let stTxt = AP_STATUS_LABEL[d.status] || d.status, stCls = d.status;
  if (arr) { stTxt = arr.arrived ? "입고 완료" : "입고 대기"; stCls = arr.arrived ? "EXECUTED" : "PENDING_APPROVAL"; }
  const head = `<div class="ap-top"><span class="ap-type">${safeText(label)}</span>
    <span class="ap-target">${safeText(d.target_id || "")}</span>
    ${pending ? "" : `<span class="ap-status ${stCls}">${safeText(stTxt)}</span>`}
    <span class="ap-when">${safeText(when)}</span></div>`;
  if (pending) {
    return `<div class="ap-card approval" data-draft="${safeText(d.draft_id)}">${head}
      ${renderDryRun(d.dry_run)}
      <div class="ap-actions"><button class="btn-primary ap-yes">승인</button>
        <button class="btn-ghost ap-no">거부</button>
        <button class="btn-ghost ap-hold">보류</button></div></div>`;
  }
  // 처리 내역(EXECUTED/REJECTED) — 삭제 + (발주 입고 전) 바로 보충
  const waiting = arr && !arr.arrived;              // 발주 실행됐으나 아직 입고 전
  const note = arr
    ? (arr.arrived
        ? `<div class="ap-arrival ok">✅ 입고 완료 — 재고에 반영됨. 이제 삭제할 수 있습니다.</div>`
        : `<div class="ap-arrival">📦 입고 대기 — ${safeText(arr.inbound_no)} · 도착예정 ${safeText(arr.expected_date || "-")}. '바로 보충'을 누르면 지금 입고 처리됩니다.</div>`)
    : "";
  // 바로 보충: 입고 전이면 항상 활성(누르면 즉시 재고 반영). 삭제: 항상 활성(입고 전 클릭 시 안내 토스트).
  const stockBtn = waiting
    ? `<button class="btn-ghost ap-stock-now" data-draft="${safeText(d.draft_id)}">🔁 바로 보충</button>`
    : "";
  const delBtn = `<button class="btn-ghost ap-del" data-draft="${safeText(d.draft_id)}">🗑 삭제</button>`;
  return `<div class="ap-card">${head}${renderDryRun(d.dry_run)}${note}
    <div class="ap-actions">${stockBtn}${delBtn}</div></div>`;
}

async function apiJson(url, opts) {   // 응답 파싱 + HTTP 상태까지 반영한 에러 통일 처리
  try {
    const resp = await fetch(url, opts);
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: body.error || body.detail || `요청 실패 (HTTP ${resp.status})` };
    return body;
  } catch (e) { return { error: "요청 실패: " + String(e) }; }
}

async function deleteDraft(id) {
  const r = await apiJson(`/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (r.error) { showToast({ kind: "error", id, message: r.error }); return; }
  showToast({ kind: "ok", id, message: "처리 내역을 삭제했습니다." });
  loadApproval();
}

async function stockNowDraft(id) {
  AUTO.flash.AutoOrderAgent = Date.now(); updateAgentFlash();   // 수동 보충도 자동발주 원 점멸
  const r = await apiJson(`/drafts/${encodeURIComponent(id)}/stock-now`, { method: "POST" });
  if (r.error) { showToast({ kind: "error", id, message: r.error }); return; }
  const n = (r.stocked || []).reduce((s, x) => s + (x.qty || 0), 0);
  showToast({ kind: "ok", id, message: `가상 보충 완료 — ${escapeHtml(r.sku || "")} ${n}개 입고 반영` });
  AUTO.flash.AutoOrderAgent = Date.now(); updateAgentFlash();
  loadApproval();
  loadResources().catch(() => {});   // 재고/자원 뷰 즉시 갱신
}

async function loadApproval() {
  const [pend, hist] = await Promise.all([
    fetch("/drafts?status=PENDING_APPROVAL").then((x) => x.json()),
    fetch("/drafts?status=EXECUTED,REJECTED&limit=20").then((x) => x.json()),
  ]);
  const pending = pend.drafts || [], history = hist.drafts || [];
  const cnt = $("#ap-pending-count"); cnt.textContent = pending.length;
  cnt.classList.toggle("zero", pending.length === 0);
  $("#ap-pending-list").innerHTML = pending.length
    ? pending.map((d) => apDrawCard(d, true)).join("")
    : `<div class="kpi-empty">승인 대기 작업이 없습니다.</div>`;
  $("#ap-pending-list").querySelectorAll(".approval").forEach((node) => wireApproval(node, null, loadApproval));
  $("#ap-history-list").innerHTML = history.length
    ? history.map((d) => apDrawCard(d, false)).join("")
    : `<div class="kpi-empty">처리 내역이 없습니다.</div>`;
  $("#ap-history-list").querySelectorAll(".ap-del")
    .forEach((b) => b.addEventListener("click", () => deleteDraft(b.dataset.draft)));
  $("#ap-history-list").querySelectorAll(".ap-stock-now")
    .forEach((b) => b.addEventListener("click", () => stockNowDraft(b.dataset.draft)));
}

// ---------- 오늘 할 일 우측 패널 ----------
const TODO = { offsets: {} };

function openTodoPanel() {
  const panel = $("#todo-panel"); if (!panel) return;
  panel.classList.remove("hidden");
  $("#panel-chat").classList.add("chat-todo-open");
  loadTodo();
}
function closeTodoPanel() {
  $("#todo-panel").classList.add("hidden");
  $("#panel-chat").classList.remove("chat-todo-open");
}

async function loadTodo() {
  const body = $("#todo-body"); if (!body) return;
  body.innerHTML = `<div class="kpi-empty">불러오는 중…</div>`;
  const data = await fetch("/todo").then((x) => x.json()).catch(() => null);
  if (!data || !data.buckets) { body.innerHTML = `<div class="kpi-empty">불러오지 못했습니다.</div>`; return; }
  TODO.offsets = {};
  body.innerHTML = data.buckets.map(todoBucketHtml).join("");
}
function todoBucketHtml(b) {
  TODO.offsets[b.key] = b.items.length;
  const items = b.items.map((it) => todoItemHtml(b.key, it)).join("") || `<div class="kpi-empty">없음</div>`;
  const more = b.has_more ? `<button class="todo-more" data-bucket="${b.key}">더보기 (전체 ${b.count}건)</button>` : "";
  return `<div class="todo-bucket" data-bucket="${b.key}">
    <div class="todo-bucket-head"><span>${escapeHtml(b.label)}</span><span class="cnt">${b.count}건</span></div>
    <div class="todo-items">${items}</div>${more}</div>`;
}
function todoItemHtml(bucket, it) {
  return `<div class="todo-item" data-bucket="${bucket}" data-id="${escapeHtml(String(it.id))}">
    <div class="ti-title">${escapeHtml(String(it.title))}</div>
    <div class="ti-sub">${escapeHtml(it.sub || "")}</div>
    <div class="todo-actions">
      <button class="t-yes">승인</button>
      <button class="t-no">거절</button>
      <button class="t-hold">보류</button>
    </div></div>`;
}

async function todoAct(card, decision) {
  const bucket = card.dataset.bucket, id = card.dataset.id;
  card.querySelectorAll("button").forEach((b) => (b.disabled = true));
  const r = await apiJson("/todo/act", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, target_id: id, decision }) });
  if (r.error) {
    showToast({ kind: "error", id, message: r.error });
    card.querySelectorAll("button").forEach((b) => (b.disabled = false));
    return;
  }
  card.classList.add("done");
  if (decision === "approve") {
    showToast({ kind: "ok", id, message: "승인·실행 완료" });
    card.querySelector(".todo-actions").innerHTML = `<span class="ti-sub">✓ 승인·실행됨</span>`;
  } else {
    showToast({ kind: "ok", id, message: "보류 — Approval 탭 대기" });
    card.querySelector(".todo-actions").innerHTML = `<span class="ti-sub">⏸ 보류(Approval 대기)</span>`;
  }
}

async function loadMoreTodo(btn) {
  const bucket = btn.dataset.bucket, offset = TODO.offsets[bucket] || 0;
  const r = await fetch(`/todo/${bucket}?offset=${offset}&limit=20`).then((x) => x.json()).catch(() => null);
  if (!r || !r.items) return;
  const itemsEl = btn.closest(".todo-bucket").querySelector(".todo-items");
  itemsEl.insertAdjacentHTML("beforeend", r.items.map((it) => todoItemHtml(bucket, it)).join(""));
  TODO.offsets[bucket] = offset + r.items.length;
  if (!r.has_more) btn.remove();
}

document.addEventListener("click", (e) => {
  if (e.target.closest("#todo-close")) return closeTodoPanel();
  const more = e.target.closest(".todo-more");
  if (more) return loadMoreTodo(more);
  const btn = e.target.closest("#todo-body .t-yes, #todo-body .t-no, #todo-body .t-hold");
  if (!btn) return;
  const card = btn.closest(".todo-item");
  if (btn.classList.contains("t-no")) { card.remove(); return; }   // 거절: 목록에서 제외
  todoAct(card, btn.classList.contains("t-yes") ? "approve" : "hold");
});

// ---------- AI 관측(trace) 탭 ----------
let TRACE = { runId: null, items: [] };

async function loadTraces(sessionId) {
  const sid = sessionId !== undefined ? sessionId : CHAT.sessionId;
  const url = sid ? `/traces?limit=40&session_id=${encodeURIComponent(sid)}` : "/traces?limit=40";
  try { TRACE.items = (await fetch(url).then((x) => x.json())).traces || []; }
  catch (_) { TRACE.items = []; }
  const badge = $("#trace-sess"); if (badge) badge.textContent = sid ? "· " + sid : "· 세션 미선택";
  renderTraceList();
  if (TRACE.items.length) {
    if (!TRACE.runId || !TRACE.items.some((t) => t.run_id === TRACE.runId)) openTrace(TRACE.items[0].run_id);
  } else {
    TRACE.runId = null;
    const d = $("#trace-detail"); if (d) d.innerHTML = `<div class="kpi-empty">이 세션의 실행 이력이 없습니다. 아래에서 질문해 보세요.</div>`;
  }
}
function renderTraceList() {
  const el = $("#trace-list"); if (!el) return;
  if (!TRACE.items.length) { el.innerHTML = `<div class="kpi-empty">실행 이력이 없습니다. Agent Chat에서 질문해 보세요.</div>`; return; }
  el.innerHTML = TRACE.items.map((t) => {
    const when = (t.created_at || "").replace("T", " ").slice(5, 16);
    const flags = (t.rag_required ? `<span class="tr-flag rag">RAG</span>` : "")
      + (t.abstain ? `<span class="tr-flag abst">abstain</span>` : "")
      + (t.approval_required ? `<span class="tr-flag appr">승인</span>` : "");
    return `<div class="tr-item${t.run_id === TRACE.runId ? " active" : ""}" data-run="${safeText(t.run_id)}">
      <div class="tr-q">${safeText((t.query || "").slice(0, 60))}</div>
      <div class="tr-meta"><span class="tr-intent">${safeText(t.intent || "-")}</span>${flags}
        ${t.total_tokens != null ? `<span class="tr-tok">${t.total_tokens}tok</span>` : ""}
        <span class="tr-time">${safeText(when)}</span></div></div>`;
  }).join("");
  el.querySelectorAll(".tr-item").forEach((n) => n.addEventListener("click", () => openTrace(n.dataset.run)));
}
function kv(k, v) { return `<span class="fs-kv"><b>${k}</b> ${safeText(v)}</span>`; }
function renderStepBody(s) {
  const o = s.out || {};
  if (s.node === "Router") return kv("intent", o.intent) + kv("confidence", o.confidence != null ? Number(o.confidence).toFixed(2) : "—")
    + (Object.keys(o.parameters || {}).length ? `<div>${Object.entries(o.parameters).map(([k, v]) => `<span class="fs-chip">${safeText(k)}=${safeText(v)}</span>`).join("")}</div>` : "");
  if (s.node === "Param Extractor") return (o.missing_parameters || []).length ? kv("누락", (o.missing_parameters).join(", ")) : `<span class="fs-chip">필수값 충족</span>`;
  if (s.node === "Planner") return (o.plan || []).map((p) => `<span class="fs-chip">${safeText(p)}</span>`).join("") || "—";
  if (s.node === "Tool Executor") return (o.tools || []).length ? (o.tools).map((t) => `<span class="fs-chip">${safeText(t)}</span>`).join("") : `<span class="fs-chip">도구 없음</span>` + (o.error ? kv("error", o.error) : "");
  if (s.node === "Verifier") { const v = o.verification_results || {}; return Object.keys(v).length ? Object.entries(v).map(([k, val]) => kv(k, val)).join("") : `<span class="fs-chip">해당 없음</span>`; }
  if (s.node === "RAG Decision") return `<span class="fs-chip">${o.rag_required ? "검색 수행" : "검색 불필요"}</span>`;
  if (s.node === "RAG Retriever") {
    const ev = (o.evidence || []).map((e) => {
      const rel = Number(e.relevance || 0);
      return `<div class="ev-row"><div><div class="ev-src">${safeText(e.source)}${e.section ? " · " + safeText(e.section) : ""}</div>
        <div class="ev-span">${safeText(e.evidence_span || "")}</div></div>
        <div class="ev-score">rel ${rel.toFixed(2)} · con ${Number(e.contribution || 0).toFixed(2)}<span class="ev-bar" style="width:${Math.round(rel * 40)}px"></span></div></div>`;
    }).join("");
    return kv("answerable", o.answerable) + kv("충분성", o.sufficiency_score != null ? Number(o.sufficiency_score).toFixed(2) : "—")
      + kv("재검색", o.retries) + (o.abstain ? `<span class="tr-flag abst">abstain</span>` : "")
      + (o.missing_evidence_types || []).map((m) => `<span class="fs-chip">missing: ${safeText(m)}</span>`).join("")
      + (ev ? `<div style="margin-top:8px">${ev}</div>` : "");
  }
  if (s.node === "Response Generator") return `<div class="fs-resp">${safeText((o.final_response || "").slice(0, 280))}${(o.final_response || "").length > 280 ? "…" : ""}</div>`;
  if (s.node === "Approval Gate") return o.approval_required ? `<span class="tr-flag appr">승인 필요</span> ${(o.draft_actions || []).map((d) => `<span class="fs-chip">${safeText(d.draft_id || "")}</span>`).join("")}` : `<span class="fs-chip">승인 불필요</span>`;
  return "";
}
async function openTrace(runId) {
  TRACE.runId = runId; renderTraceList();
  const t = await fetch(`/traces/${runId}`).then((x) => x.json()).catch(() => null);
  const el = $("#trace-detail"); if (!el) return;
  if (!t || !t.steps) { el.innerHTML = `<div class="kpi-empty">트레이스를 불러올 수 없습니다.</div>`; return; }
  const flow = t.steps.map((s) =>
    `<div class="fstep"><div><span class="fs-node">${safeText(s.node)}</span><span class="fs-label">${safeText(s.label || "")}</span></div>
      <div class="fs-body">${renderStepBody(s)}</div></div>`).join("");
  el.innerHTML = `<div class="td-q">${safeText(t.query || "")}</div>
    <div class="td-sub">run ${safeText(t.run_id)} · ${safeText((t.created_at || "").replace("T", " ").slice(0, 16))}${t.total_tokens != null ? ` · ${t.total_tokens} 토큰 (LLM ${t.llm_calls || 0}콜)` : ""}</div>
    <div class="flow">${flow}</div>`;
}

function liveSummary(node, o) {
  o = o || {};
  switch (node) {
    case "Router": return `${safeText(o.intent || "-")}${o.confidence != null ? " · " + Number(o.confidence).toFixed(2) : ""}`;
    case "Param Extractor": return (o.missing_parameters || []).length ? "누락: " + o.missing_parameters.join(", ") : "필수값 충족";
    case "Planner": return (o.plan || []).join(", ") || "—";
    case "Tool Executor": return (o.tools || []).length ? o.tools.join(", ") : (o.error ? "오류" : "도구 없음");
    case "Verifier": return "정합성 확인";
    case "RAG Decision": return o.rag_required ? "검색 수행" : "검색 불필요";
    case "RAG Retriever": return `충분성 ${o.sufficiency_score != null ? Number(o.sufficiency_score).toFixed(2) : "—"} · 재검색 ${o.retries ?? 0}${o.abstain ? " · abstain" : ""}`;
    case "Response Generator": return "응답 생성";
    case "Approval Gate": return o.approval_required ? "승인 필요" : "승인 불필요";
    default: return "";
  }
}
function subSummary(ev) {
  switch (ev.kind) {
    case "search": return `검색 #${ev.attempt} · 후보 ${ev.candidates}개`;
    case "rerank": return `PRISM 리랭크 #${ev.attempt} · ` + ((ev.top || []).map((t) => `${t.source}(rel ${t.relevance})`).join(", ") || "후보 없음");
    case "sufficiency": return `충분성 #${ev.attempt} · ${ev.score} · ${ev.answerable ? "충분" : "부족"}` + ((ev.missing || []).length ? ` · 부족:${ev.missing.join(",")}` : "");
    case "retry": return `재검색 #${ev.attempt} · 질의 보강`;
    case "abstain": return "abstain — 근거 부족";
    default: return ev.kind || "";
  }
}
// 시나리오(scenario) → 사람이 읽는 가정 조건 문구(현재 자원 META 기준으로 해석)
function simConditionText(sc) {
  sc = sc || {};
  const bw = META.worker != null ? META.worker : 3, bf = META.forklift != null ? META.forklift : 2;
  const w = sc.worker_count != null ? sc.worker_count : bw + (sc.worker_delta || 0);
  const f = sc.forklift_count != null ? sc.forklift_count : bf + (sc.forklift_delta || 0);
  const team = Math.max(0, Math.min(Math.floor(w / 2), f));
  const parts = [`작업자 ${w}명·지게차 ${f}대(작업팀 ${team}개)`];
  if (sc.demand_multiplier != null && Number(sc.demand_multiplier) !== 1) parts.push(`수요 ${sc.demand_multiplier}배`);
  if (sc.inbound_delay_days) parts.push(`입고지연 ${sc.inbound_delay_days}일`);
  if (sc.zone_capa_multiplier && Object.keys(sc.zone_capa_multiplier).length) parts.push(`존 용량 조정`);
  return parts.join(", ");
}

function handleChatEvent(ev, ui) {
  const ctx = ui.ctx;
  if (ev.type === "substep") {
    if (!ctx.steps || ev.kind === "tokens") return;   // 토큰은 라이브 미표시(총합은 done에서)
    const row = document.createElement("div");
    row.className = "lsub";
    row.innerHTML = `<span class="lsub-ic">↳</span><span class="lsub-text">${escapeHtml(subSummary(ev))}</span>`;
    ui.stepsEl.appendChild(row);
    chatScrollBottom(ctx);
    return;
  }
  if (ev.type === "step") {
    if (ui.runEl) {   // 진행 상태 문구 갱신 — 스텝은 노드 완료 후 도착하므로 다음 무거운 단계를 예고
      const dots = `<span class="typing"><i></i><i></i><i></i></span>`;
      if (ev.node === "Router" && ev.out && ev.out.intent === "simulation_query"
          && (ev.out.parameters || {}).mode !== "options" && (ev.out.parameters || {}).mode !== "explain") {
        // 시뮬 지시로 판단 → 가정 조건 문구 먼저 출력 후 기동. 진행은 replication 애니메이션(반복당 ~1.4초).
        const sc = (ev.out.parameters || {}).scenario;
        const note = sc
          ? `네, <b>${simConditionText(sc)}</b>로 가정하여 시뮬레이션을 실행하겠습니다.`
          : `현재 자원 기준으로 시뮬레이션을 실행하겠습니다.`;
        const M = sc ? 20 : 10; let n = 1;
        const paint = () => { if (!ui.runEl) return;
          const status = n < M ? `${dots} 🧪 시뮬레이션 실행 중… <b>반복 ${n}/${M}</b>` : `${dots} 🧪 결과 집계 중…`;
          ui.runEl.innerHTML = `<div class="sim-note">${note}</div><div>${status}</div>`; };
        paint();
        if (ui.simTicker) clearInterval(ui.simTicker);
        ui.simTicker = setInterval(() => { if (n < M) n++; paint(); }, 1350);
      } else if (ev.node === "Tool Executor") {
        if (ui.simTicker) { clearInterval(ui.simTicker); ui.simTicker = null; }
        ui.runEl.innerHTML = `${dots} 응답 생성 중…`;
      }
    }
    if (!ctx.steps) return;            // Agent Chat: 동작 스텝 숨김(AI 관측에서만)
    const detail = renderStepBody({ node: ev.node, out: ev.out });   // 우측 상세와 동일 렌더 재사용
    const row = document.createElement("div");
    row.className = "lstep done" + (detail ? " has-detail" : "");
    row.innerHTML = `<div class="lstep-head"><span class="ls-ic">✓</span>`
      + `<span class="ls-label">${escapeHtml(ev.label || ev.node)}</span>`
      + `<span class="ls-sum">${escapeHtml(liveSummary(ev.node, ev.out))}</span>`
      + (detail ? `<span class="ls-caret">▸</span>` : "") + `</div>`
      + (detail ? `<div class="lstep-detail">${detail}</div>` : "");
    if (detail) row.querySelector(".lstep-head").addEventListener("click", () => row.classList.toggle("open"));
    ui.stepsEl.appendChild(row);
    chatScrollBottom(ctx);
  } else if (ev.type === "done") {
    if (ui.simTicker) { clearInterval(ui.simTicker); ui.simTicker = null; }
    if (ui.runEl) ui.runEl.remove();
    if (ev.session_id) CHAT.sessionId = ev.session_id;
    if (ev.error) { ui.finalEl.innerHTML = `<span class="err">오류: ${escapeHtml(ev.error)}</span>`; return; }
    ui.finalEl.innerHTML = mdToHtml(ev.response || "(응답이 비어 있습니다)")
      + renderSources(ev.rag_sources)
      + (ev.approval_required ? renderApproval(ev.draft_actions, ev.tool_results) : "");
    colorizeKpiTables(ui.finalEl);   // 결과표 증감 색상
    if (ev.approval_required) ui.node.querySelectorAll(".approval").forEach((box) => wireApproval(box, ev.tool_results));
    if (ev.intent === "daily_summary") openTodoPanel();   // 오늘 할 일 → 우측 할일 패널 자동 오픈
    if (ctx.steps && ev.tokens) {
      const t = ev.tokens, row = document.createElement("div");
      row.className = "tok-total";
      row.textContent = `Σ 토큰 ${t.total || 0} · LLM ${t.calls || 0}콜 (입력 ${t.prompt || 0} / 출력 ${t.completion || 0})`;
      ui.stepsEl.appendChild(row);
    }
    if (ctx.steps) { TRACE.runId = null; loadTraces(CHAT.sessionId).catch(() => {}); }  // 새 run 목록·상세 갱신
    chatScrollBottom(ctx);
  } else if (ev.type === "error") {
    if (ui.runEl) ui.runEl.remove();
    ui.finalEl.innerHTML = `<span class="err">오류: ${escapeHtml(ev.message || "")}</span>`;
  }
}
async function streamChat(text, ctx) {
  ctx = ctx || CHAT_CTX;
  text = (text || "").trim(); if (!text) return;
  appendBubble("user", escapeHtml(text), ctx);
  const ta = document.getElementById(ctx.text); if (ta) { ta.value = ""; autoGrow(ta); }
  const send = document.getElementById(ctx.send); if (send) send.disabled = true;
  const node = appendBubble("bot",
    `<div class="live-steps"></div>`
    + `<div class="live-run"><span class="typing"><i></i><i></i><i></i></span> 처리 중…</div>`
    + `<div class="live-final"></div>`, ctx);
  const ui = { node, ctx, stepsEl: node.querySelector(".live-steps"),
               runEl: node.querySelector(".live-run"), finalEl: node.querySelector(".live-final") };
  try {
    const resp = await fetch("/chat/stream", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: text, user_id: "operator01", session_id: CHAT.sessionId }) });
    if (!resp.ok || !resp.body) throw new Error("스트림 연결 실패 " + resp.status);
    const reader = resp.body.getReader(), dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const dl = buf.slice(0, i).split("\n").find((l) => l.startsWith("data:"));
        buf = buf.slice(i + 2);
        if (!dl) continue;
        let ev; try { ev = JSON.parse(dl.slice(5).trim()); } catch (_) { continue; }
        handleChatEvent(ev, ui);
      }
    }
  } catch (e) {
    if (ui.runEl) ui.runEl.remove();
    ui.finalEl.innerHTML = `<span class="err">요청 실패: ${escapeHtml(String(e))}</span>`;
  } finally {
    if (ui.simTicker) { clearInterval(ui.simTicker); ui.simTicker = null; }
    if (send) send.disabled = false;
    const ta2 = document.getElementById(ctx.text); if (ta2) ta2.focus();
    setUpdated(); loadSessions().catch(() => {});
  }
}
function sendChat(text) { return streamChat(text, CHAT_CTX); }
function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; }
function bindSuggests() {
  const sug = $("#chat-suggest"); if (!sug) return;
  sug.innerHTML = CHAT_SUGGESTS.map((s) => `<button class="sug">${escapeHtml(s)}</button>`).join("");
  sug.querySelectorAll(".sug").forEach((b) => b.addEventListener("click", () => sendChat(b.textContent)));
}
function resetChat() {
  CHAT.sessionId = null;                 // 새 대화 = 새 세션
  renderMessages(CHAT_CTX, []);          // 두 표면 모두 초기화
  renderMessages(TRACE_CTX, []);
  TRACE.runId = null; TRACE.items = []; renderTraceList();
  const td = $("#trace-detail"); if (td) td.innerHTML = `<div class="kpi-empty">새 대화입니다. 질문하면 동작이 그려집니다.</div>`;
  bindSuggests();
  const ta = $("#chat-text");
  if (ta) { ta.value = ""; autoGrow(ta); ta.focus(); }
  renderSessions();
}
function setupChat() {
  const ta = $("#chat-text"), send = $("#chat-send");
  if (ta && send) {
    send.addEventListener("click", () => sendChat(ta.value));
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(ta.value); } });
    ta.addEventListener("input", () => autoGrow(ta));
  }
  const plus = $("#cp-plus"); if (plus) plus.addEventListener("click", resetChat);
  // AI 관측 탭 입력창
  const tta = $("#trace-text"), tsend = $("#trace-send");
  if (tta && tsend) {
    tsend.addEventListener("click", () => streamChat(tta.value, TRACE_CTX));
    tta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); streamChat(tta.value, TRACE_CTX); } });
    tta.addEventListener("input", () => autoGrow(tta));
  }
  bindSuggests();
}

// ---------- 실시간 수요 발생 + Toast ----------
let LIVE = { running: false, es: null };

function showToast(ev) {
  const wrap = $("#toast-wrap"); if (!wrap) return;
  const kind = ev.kind || "outbound";
  const tag = { inbound: "입고", outbound: "출고", ok: "완료", error: "오류" }[kind] || "알림";
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<div class="t-head"><span class="t-tag">${tag}</span>${ev.id ? safeText(ev.id) : "실시간"}<span class="t-time">${safeText(ev.ts || "")}</span></div>
    <div class="t-body">${safeText(ev.message || "")}</div>`;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add("fade"); setTimeout(() => el.remove(), 300); }, 6000);
  while (wrap.children.length > 5) wrap.firstChild.remove();
}

function setupRealtime() {
  const btn = $("#live-toggle"); if (!btn) return;
  // SSE 구독은 항상 유지(수동 발생 1건도 수신)
  try {
    LIVE.es = new EventSource("/events");
    LIVE.es.onmessage = (e) => { try { showToast(JSON.parse(e.data)); } catch (_) {} };
  } catch (_) {}
  btn.addEventListener("click", async () => {
    LIVE.running = !LIVE.running;
    await fetch(`/realtime/${LIVE.running ? "start" : "stop"}`, { method: "POST" }).catch(() => {});
    btn.classList.toggle("on", LIVE.running);
    btn.innerHTML = `<i class="live-dot"></i>실시간 수요 ${LIVE.running ? "ON" : "OFF"}`;
  });
  setupLiveSettings();
}

async function openLiveSettings() {
  const s = await fetch("/realtime/status").then((x) => x.json()).catch(() => ({}));
  $("#cfg-interval").value = s.interval ?? 8;
  $("#cfg-ratio").value = Math.round((s.outbound_ratio ?? 0.5) * 100);
  $("#cfg-out-min").value = s.out_qty_min ?? 5;
  $("#cfg-out-max").value = s.out_qty_max ?? 40;
  $("#cfg-in-min").value = s.in_qty_min ?? 20;
  $("#cfg-in-max").value = s.in_qty_max ?? 120;
  $("#live-modal").classList.remove("hidden");
}
function closeLiveSettings() { $("#live-modal").classList.add("hidden"); }
async function saveLiveSettings() {
  const body = {
    interval: Number($("#cfg-interval").value),
    outbound_ratio: Math.min(100, Math.max(0, Number($("#cfg-ratio").value))) / 100,
    out_qty_min: Number($("#cfg-out-min").value), out_qty_max: Number($("#cfg-out-max").value),
    in_qty_min: Number($("#cfg-in-min").value), in_qty_max: Number($("#cfg-in-max").value),
  };
  await fetch("/realtime/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  closeLiveSettings();
}
function setupLiveSettings() {
  const g = $("#live-settings"); if (!g) return;
  g.addEventListener("click", () => openLiveSettings().catch(() => {}));
  $("#live-modal-x").addEventListener("click", closeLiveSettings);
  $("#live-modal-cancel").addEventListener("click", closeLiveSettings);
  $("#live-modal-save").addEventListener("click", () => saveLiveSettings());
  $("#live-emit-now").addEventListener("click", () => fetch("/realtime/emit", { method: "POST" }).catch(() => {}));
  $("#live-modal").addEventListener("click", (e) => { if (e.target.id === "live-modal") closeLiveSettings(); });
}

/* ---------- 창고 자동운영 (블랙보드 대시보드) ---------- */
const AGENTS = [
  { id: "InboundAgent", label: "입고", emoji: "📥", kind: "dom" },
  { id: "PutawayAgent", label: "적치", emoji: "📦", kind: "dom" },
  { id: "PickingAgent", label: "피킹", emoji: "🛒", kind: "dom" },
  { id: "OutboundAgent", label: "출고", emoji: "🚚", kind: "dom" },
  { id: "ResourceAgent", label: "자원배정", emoji: "👷", kind: "dom" },
  { id: "AutoOrderAgent", label: "자동발주", emoji: "📦", kind: "dom" },
  { id: "ControlAgent", label: "컨트롤", emoji: "🧭", kind: "inf" },
  { id: "PolicyAgent", label: "정책", emoji: "🛡️", kind: "inf" },
  { id: "SimulationAgent", label: "시뮬레이션", emoji: "🧊", kind: "inf" },
  { id: "ExplanationAgent", label: "설명", emoji: "💬", kind: "inf" },
];
const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
const AUTO = { on: false, seen: new Set(), flash: {}, poll: null, booted: false, renderedLogs: new Set(), manualSim: null, simRefreshing: false, requests: [], selectedReq: null, capacity: null, explaining: false };
const PHASE_LABEL = {
  EVENT_RECEIVED: "이벤트 수신", ACTION_CREATED: "Action 생성", POLICY_CHECK: "정책 검토",
  PRECHECK: "사전검증", LOCK_ACQUIRED: "락 확보", EXECUTE: "실행", POSTCHECK: "사후검증", FINISHED: "완료",
};

function agentForLog(l) {
  if (l.phase === "EVENT_RECEIVED") return "ControlAgent";
  if (l.phase === "POLICY_CHECK") return "PolicyAgent";
  if (l.agent_name === "SimulationAgent") return "SimulationAgent";
  if (l.phase === "ACTION_CREATED") return l.agent_name;
  if (AGENT_BY_ID[l.agent_name]) return l.agent_name;
  return "ControlAgent";
}

function statusBadge(st) {
  const m = {
    SUCCESS: ["성공", "ok"], POLICY_BLOCKED: ["차단", "blk"], FAILED: ["실패", "fail"],
    SKIPPED_DUPLICATE: ["중복생략", "mut"], PENDING: ["대기", "run"], READY: ["준비", "run"],
    RUNNING: ["실행중", "run"], COMPENSATED: ["보상", "mut"],
  };
  const [t, c] = m[st] || [st || "-", "mut"];
  return `<span class="ab ${c}">${t}</span>`;
}

// 그리드는 1회만 그리고(깜빡임 방지), 활성 표시는 클래스 토글로만 갱신
function buildAgents() {
  const el = $("#auto-agents"); if (!el || el.childElementCount) return;
  el.innerHTML = AGENTS.map((a) => `<div class="agent-cell ${a.kind}" data-agent="${a.id}">
      <span class="agent-badge" data-badge="${a.id}" hidden></span>
      <div class="agent-circle">${a.emoji}</div>
      <div class="agent-name">${a.label}</div>
      <div class="agent-sub">${a.id.replace("Agent", "")}</div></div>`).join("");
}
function renderAgentBadges() {
  // 자동발주 원에 '발주 대기(결품)' 건수를 상시 배지로 — 부족 백로그가 쌓여 있음을 한눈에
  const b = document.querySelector('[data-badge="AutoOrderAgent"]'); if (!b) return;
  const n = (AUTO.capacity && AUTO.capacity.awaiting_stock) || 0;
  if (n > 0) { b.textContent = n; b.title = `발주 대기 ${n}건`; b.hidden = false; }
  else { b.hidden = true; }
}
function updateAgentFlash() {
  const el = $("#auto-agents"); if (!el) return;
  const nowt = Date.now();
  el.querySelectorAll(".agent-cell").forEach((c) => {
    // 시뮬레이션은 DES가 도는 동안, 설명은 LLM 생성 중 계속 켜두고, 그 외는 로그 도착 후 2.4s 점멸
    const on = (c.dataset.agent === "SimulationAgent" && AUTO.simRefreshing)
      || (c.dataset.agent === "ExplanationAgent" && AUTO.explaining)
      || (AUTO.flash[c.dataset.agent] && (nowt - AUTO.flash[c.dataset.agent] < 2400));
    c.classList.toggle("active", !!on);
  });
}

function autoLogLine(l) {
  const t = (l.created_at || "").split(" ")[1] || "";
  const ag = AGENT_BY_ID[agentForLog(l)];
  const c = l.result === "OK" ? "ok" : (l.result === "BLOCKED" ? "blk" : (l.result === "FAIL" ? "fail" : "mut"));
  return `<div class="alog-line"><span class="alog-t">${t}</span>`
    + `<span class="alog-ag">${ag ? ag.emoji + " " + ag.label : (l.agent_name || "—")}</span>`
    + `<span class="alog-ph ${c}">${PHASE_LABEL[l.phase] || l.phase}</span>`
    + `<span class="alog-msg">${escapeHtml(l.message || "")}</span></div>`;
}

const hhmmss = (ts) => (ts ? String(ts).split(" ")[1] || String(ts) : "—");

/* ---------- 실시간 입/출고 요청 + 요청별 생애주기 ---------- */
const REQ_STATUS_CLS = { done: "ok", in_progress: "run", blocked: "blk", failed: "fail", pending: "mut" };
function renderRequests(list) {
  AUTO.requests = list;
  const el = $("#auto-requests"); if (!el) return;
  const meta = $("#auto-req-meta"); if (meta) meta.textContent = list.length ? `${list.length}건` : "";
  if (!list.length) {
    el.innerHTML = `<div class="auto-empty">‘실시간 수요’를 켜면 입/출고 요청이 실시간으로 쌓입니다.</div>`;
    return;
  }
  const sel = AUTO.selectedReq;
  el.innerHTML = list.map((r) => {
    const isOut = r.kind === "outbound";
    const active = sel && sel.id === r.id ? " active" : "";
    const cls = r.status === "AWAITING_STOCK" ? "blk" : (r.status === "SHIPPED" || r.status === "STOCKED" ? "ok" : "mut");
    return `<div class="req-row${active}" data-kind="${r.kind}" data-id="${escapeHtml(r.id)}">
      <span class="req-kind ${isOut ? "out" : "inb"}">${isOut ? "출고" : "입고"}</span>
      <span class="req-id">${escapeHtml(r.id)}</span>
      <span class="req-sub">${escapeHtml(r.sku || "")} ${r.qty != null ? r.qty + "개" : ""}</span>
      <span class="req-t"><span class="ab ${cls}">${escapeHtml(r.status_label || "—")}</span> · ${hhmmss(r.created_at)}</span></div>`;
  }).join("");
  el.querySelectorAll(".req-row").forEach((row) =>
    row.addEventListener("click", () => selectRequest(row.dataset.kind, row.dataset.id)));
}

async function selectRequest(kind, id) {
  AUTO.selectedReq = { kind, id };
  document.querySelectorAll("#auto-requests .req-row").forEach((r) =>
    r.classList.toggle("active", r.dataset.id === id));
  const sub = $("#auto-req-trace-sub"); if (sub) sub.textContent = `${kind === "outbound" ? "출고" : "입고"} ${id}`;
  const el = $("#auto-req-trace"); if (el) el.innerHTML = `<div class="auto-empty">불러오는 중…</div>`;
  await refreshTrace();
}
async function refreshTrace() {
  const s = AUTO.selectedReq; if (!s) return;
  const t = await fetch(`/api/blackboard/requests/${s.kind}/${encodeURIComponent(s.id)}/trace`)
    .then((r) => r.json()).catch(() => null);
  if (t && !t.error) renderReqTrace(t);
}
function renderReqTrace(t) {
  const el = $("#auto-req-trace"); if (!el) return;
  const badgeCls = t.awaiting_stock ? "blk" : "mut";
  const replBtn = !t.awaiting_stock ? ""
    : (AUTO.on
        ? `<button class="btn-ghost repl-now-btn" id="repl-now" data-order="${escapeHtml(t.id)}">🔁 바로 보충</button>`
        : `<button class="btn-ghost repl-now-btn" id="repl-now" disabled title="자동운영을 켜야 보충할 수 있습니다">🔁 바로 보충 (자동운영 OFF)</button>`);
  const head = `<div class="req-trace-head">${t.kind === "outbound" ? "🚚 출고" : "📥 입고"} ${escapeHtml(t.id)}
    <span class="ab ${badgeCls}">${escapeHtml(t.current_status_label || "—")}</span>${replBtn}</div>`;
  const steps = (t.milestones || []).map((m) => {
    const cls = REQ_STATUS_CLS[m.status] || "mut";
    const clickable = m.action_id ? " rt-clickable" : "";
    const hint = m.action_id ? `<span class="rt-why">왜?</span>` : "";
    return `<div class="rt-step ${m.status}${clickable}"${m.action_id ? ` data-action="${escapeHtml(m.action_id)}" data-label="${escapeHtml(m.label)}" data-status="${m.status}"` : ""}>
      <div class="rt-rail"><div class="rt-node ${m.status}"></div><div class="rt-line"></div></div>
      <div class="rt-body">
        <div class="rt-label">${escapeHtml(m.label)} <span class="ab ${cls}">${MS_LABEL[m.status] || m.status}</span>${hint}</div>
        <div class="rt-meta">${m.agent ? escapeHtml(m.agent) : "—"}${m.ts ? " · " + hhmmss(m.ts) : ""}</div>
        <div class="rt-detail">${escapeHtml(m.detail || "")}</div>
      </div></div>`;
  }).join("");
  el.innerHTML = head + `<div class="rt-timeline">${steps}</div>`;
  const btn = $("#repl-now");
  if (btn) btn.addEventListener("click", () => replenishNow(btn.dataset.order));
  el.querySelectorAll(".rt-step.rt-clickable").forEach((s) =>
    s.addEventListener("click", () => explainMilestone(
      s.dataset.action, s.dataset.label, { text: MS_LABEL[s.dataset.status] || "", cls: REQ_STATUS_CLS[s.dataset.status] || "mut" })));
}
const MS_LABEL = { done: "완료", in_progress: "진행", blocked: "보류", failed: "실패", pending: "대기" };

async function replenishNow(orderNo) {
  if (!AUTO.on) { showToast({ kind: "error", id: orderNo, message: "자동운영을 켜야 보충할 수 있습니다." }); return; }
  const btn = $("#repl-now"); if (btn) { btn.disabled = true; btn.textContent = "보충 중…"; }
  AUTO.flash.AutoOrderAgent = Date.now(); updateAgentFlash();   // 수동 보충도 자동발주 원 점멸
  try {
    const r = await fetch(`/api/blackboard/requests/${encodeURIComponent(orderNo)}/replenish-now`, { method: "POST" })
      .then((x) => x.json());
    if (r.error) { showToast({ kind: "error", id: orderNo, message: r.error }); if (btn) { btn.disabled = false; btn.textContent = "🔁 바로 보충"; } return; }
    const n = (r.stocked || []).reduce((s, x) => s + (x.qty || 0), 0);
    showToast({ kind: "ok", id: orderNo, message: `가상 보충 완료 — ${n}개 입고 반영, 주문 재개` });
    AUTO.flash.AutoOrderAgent = Date.now(); updateAgentFlash();
    await refreshTrace();
  } catch (_) {
    if (btn) { btn.disabled = false; btn.textContent = "🔁 바로 보충"; }
  }
}


function simCountdown(s) {
  if (!s || !s.refresh_seconds) return "";
  if (!s.ts) return ` · <span class="sim-cd">시뮬레이션 기동중…</span>`;
  const rem = Math.ceil(s.refresh_seconds - (Date.now() / 1000 - s.ts));
  return rem > 0
    ? ` · <span class="sim-cd">기준치 갱신까지 ${rem}s</span>`
    : ` · <span class="sim-cd">시뮬레이션 기동중…</span>`;
}
function laborBody() {   // 노동 신호 = 실시간 작업팀 가용 + 미처리 대기(적치/피킹 별도)
  const c = AUTO.capacity;
  if (!c) return `작업팀 <b>—</b>`;
  const shortCls = c.team_short ? "over" : "";
  const avail = `작업팀 <b class="${shortCls}">${c.available_teams}/${c.total_teams} 가용</b>${c.team_short ? " 부족" : ""}`;
  const wait = `대기 피킹 <b class="${c.waiting_picking ? "over" : ""}">${c.waiting_picking}건</b>·적치 <b class="${c.waiting_stocking ? "over" : ""}">${c.waiting_stocking}건</b>`;
  return `${avail} · ${wait} · 진행중 ${c.in_progress_total}건`;
}
function simBody(s) {   // 노동(팀가용)/공간/출고지연 문자열(카운트다운 제외)
  const k = s.kpis || {};
  const zb = s.zone_block != null ? s.zone_block : 1;
  const over = Object.entries(s.zone_peak || {}).filter(([, o]) => o >= zb).sort((a, b) => b[1] - a[1]);
  let spaceHtml;
  if (over.length) {
    const list = over.map(([z, o]) => `${escapeHtml(z)} ${Math.round(o * 100)}%`).join(" · ");
    spaceHtml = `공간 <b class="over">과부하 ${over.length}존</b> (${list})`;
  } else {
    const zone = s.worst_zone_occ != null ? Math.round(s.worst_zone_occ * 100) + "%" : "—";
    spaceHtml = `공간(최대존) <b>${zone}</b>${s.worst_zone ? " " + escapeHtml(s.worst_zone) : ""} 정상`;
  }
  return `${laborBody()} · ` + spaceHtml
    + ` · 출고지연 ${fmtNum(k.shipping_delay_count, 0)}건 · 적치지연 ${fmtNum(k.putaway_delay_count, 0)}건`;
}
function setSimbar(s) {
  const el = $("#auto-simbar"); if (!el) return;
  if (!AUTO.on) {   // OFF면 미가동 — 단, 수동 실행 결과가 최근(45초)이면 그걸 보여줌
    const m = AUTO.manualSim;
    if (m && m.s && m.s.ran && Date.now() - m.at < 45000) {
      el.className = "auto-simbar " + (m.s.ok ? "ok" : "blk");
      el.innerHTML = `<span class="sim-ic">🧊</span> ${simBody(m.s)} <span class="sim-cd">(수동 실행)</span>`;
      return;
    }
    el.className = "auto-simbar";
    const k = (s && s.kpis) || {};
    const ref = (s && s.ran && k.resource_utilization_team != null)
      ? ` <span class="sim-cd">(마지막 기준 · 가동률 ${Math.round(k.resource_utilization_team * 100)}%)</span>` : "";
    el.innerHTML = `<span class="sim-ic">🧊</span> 자동운영 OFF — 시뮬레이션 미가동${ref}`;
    return;
  }
  if (!s || s.ran === false) {
    el.className = "auto-simbar";
    el.innerHTML = `<span class="sim-ic">🧊</span> 배치 시뮬레이션 — ${s && s.reason ? escapeHtml(s.reason) : "대기"}` + simCountdown(s);
    return;
  }
  el.className = "auto-simbar " + (s.ok ? "ok" : "blk");
  el.innerHTML = `<span class="sim-ic">🧊</span> 배치 시뮬레이션 · ${simBody(s)}${simCountdown(s)}`;
}

function updateAutoToggle(enabled) {
  AUTO.on = enabled;
  const pill = $("#auto-pill"), btn = $("#auto-toggle");
  if (pill) { pill.textContent = enabled ? "ON" : "OFF"; pill.classList.toggle("on", enabled); }
  if (btn) { btn.textContent = enabled ? "■ 자동운영 중지" : "자동운영 시작"; btn.classList.toggle("running", enabled); }
}

async function pollAuto() {
  try {
    const [mode, logs, sim, reqs, cap] = await Promise.all([
      fetch("/api/auto-mode").then((r) => r.json()),
      fetch("/api/blackboard/audit-logs?limit=60").then((r) => r.json()),
      fetch("/api/blackboard/simulation").then((r) => r.json()).catch(() => null),
      fetch("/api/blackboard/requests?limit=30").then((r) => r.json()).catch(() => null),
      fetch("/api/blackboard/capacity").then((r) => r.json()).catch(() => null),
    ]);
    updateAutoToggle((mode.auto_mode_enabled || "false") === "true");
    AUTO.simRefreshing = !!(sim && sim.refreshing);   // DES 실행 중 — 시뮬레이션 원 지속 하이라이트
    AUTO.capacity = cap || null;                       // 실시간 작업팀 가용/백로그
    if (sim) setSimbar(sim);
    if (reqs) renderRequests(reqs.requests || []);
    loadDispatchLog().catch(() => {});   // 작업 배정 계산 로그 갱신
    loadRouteLog().catch(() => {});      // ZONE 방문순서(TSP) 계산 로그 갱신
    loadExecLog().catch(() => {});       // 액션 실행 순서 로그 갱신
    if ($("#auto-cycle") && document.activeElement !== $("#auto-cycle")) {
      $("#auto-cycle").value = mode.auto_mode_cycle_interval_seconds || 15;
    }
    document.querySelectorAll("#auto-settings input[data-key]").forEach((inp) => {
      if (document.activeElement !== inp && mode[inp.dataset.key] != null) inp.value = mode[inp.dataset.key];
    });
    const all = logs.logs || [];                       // 서버는 최신순(DESC)
    const fresh = all.filter((l) => !AUTO.renderedLogs.has(l.log_id));
    if (fresh.length) {
      const box = $("#auto-log");
      const ph = box.querySelector(".auto-empty"); if (ph) ph.remove();
      // 오래된 것부터 afterbegin으로 넣으면 최종적으로 최신이 맨 위
      fresh.slice().reverse().forEach((l) => {
        AUTO.renderedLogs.add(l.log_id);
        AUTO.flash[agentForLog(l)] = Date.now();
        box.insertAdjacentHTML("afterbegin", autoLogLine(l));
      });
      while (box.childElementCount > 140) box.removeChild(box.lastElementChild);
      $("#auto-log-meta").textContent = `${box.childElementCount}건`;
      if (AUTO.renderedLogs.size > 4000) AUTO.renderedLogs = new Set([...AUTO.renderedLogs].slice(-2000));
    }
    if (AUTO.selectedReq) refreshTrace().catch(() => {});   // 선택 요청의 생애주기 라이브 갱신
    renderAgentBadges();
    updateAgentFlash();
  } catch (_) { /* noop */ }
}

async function refreshSimbar() {
  try { setSimbar(await fetch("/api/blackboard/simulation").then((r) => r.json())); }
  catch (_) { setSimbar(null); }
}

// 생애주기 단계(마일스톤) 클릭 → 그 단계 액션의 의사결정 사유(LLM)를 설명 패널에 표시
async function explainMilestone(actionId, label, statusLabel) {
  const det = $("#auto-detail"); if (!det) return;
  const head = `<div class="adet-head">${escapeHtml(label || "")} <span class="ab ${statusLabel && statusLabel.cls || "mut"}">${escapeHtml(statusLabel && statusLabel.text || "")}</span></div>`;
  det.innerHTML = head + `<div class="adet-ex muted">설명 생성 중…</div>`;
  AUTO.explaining = true; updateAgentFlash();   // 설명 원 하이라이트(생성 중 유지)
  try {
    const ex = await fetch(`/api/blackboard/actions/${actionId}/explanation`).then((r) => r.json());
    det.innerHTML = head
      + `<div class="adet-ex">${escapeHtml(ex.explanation || ex.error || "설명 없음")}</div>`
      + `<div class="adet-src">출처: ${escapeHtml(ex.source || "-")}</div>`;
  } catch (e) {
    det.innerHTML = head + `<div class="adet-ex">설명 조회 실패</div>`;
  } finally {
    AUTO.explaining = false; updateAgentFlash();
  }
}

async function toggleAuto() {
  const next = !AUTO.on;
  if (next && !LIVE.running) {
    showToast({ kind: "error", id: "", message: "‘실시간 수요’를 먼저 ON 한 뒤 자동운영을 시작하세요." });
    return;
  }
  updateAutoToggle(next);
  if (next) {
    await fetch("/api/auto-mode/on", { method: "POST" }).catch(() => {});
    await fetch("/api/auto-mode/loop/start", { method: "POST" }).catch(() => {});
    refreshSimbar().catch(() => {});
  } else {
    await fetch("/api/auto-mode/off", { method: "POST" }).catch(() => {});
    await fetch("/api/auto-mode/loop/stop", { method: "POST" }).catch(() => {});
  }
}

function setupAuto() {
  if (AUTO.booted) return; AUTO.booted = true;
  buildAgents();
  $("#auto-toggle").addEventListener("click", () => toggleAuto().catch(() => {}));
  $("#auto-runonce").addEventListener("click", async () => {
    $("#auto-runonce").disabled = true;
    try { await fetch("/api/blackboard/run-once?force=true", { method: "POST" }); await refreshSimbar(); await pollAuto(); }
    finally { $("#auto-runonce").disabled = false; }
  });
  $("#auto-simrun").addEventListener("click", async () => {
    const btn = $("#auto-simrun"); btn.disabled = true;
    const el = $("#auto-simbar"); if (el) { el.className = "auto-simbar"; el.innerHTML = `<span class="sim-ic">🧊</span> 시뮬레이션 기동중…`; }
    try {
      const s = await fetch("/api/blackboard/simulation/run", { method: "POST" }).then((r) => r.json());
      AUTO.manualSim = { s, at: Date.now() };
      setSimbar(s);
    } catch (_) { if (el) el.innerHTML = `<span class="sim-ic">🧊</span> 시뮬레이션 실행 실패`; }
    finally { btn.disabled = false; }
  });
  $("#auto-cycle").addEventListener("change", (e) => {
    const v = Math.max(2, Math.min(600, Number(e.target.value) || 15));
    fetch("/api/auto-mode/settings", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "auto_mode_cycle_interval_seconds", value: String(v) }) }).catch(() => {});
  });
  document.querySelectorAll("#auto-settings input[data-key]").forEach((inp) => {
    inp.addEventListener("change", () => {
      fetch("/api/auto-mode/settings", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: inp.dataset.key, value: String(inp.value) }) })
        .then(() => refreshSimbar()).catch(() => {});
    });
  });
  // 자동발주 원 클릭 → 발주 대기 주문 세부(배지 숫자의 근거)
  $("#auto-agents").addEventListener("click", (e) => {
    const c = e.target.closest(".agent-cell"); if (!c) return;
    if (c.dataset.agent === "AutoOrderAgent") showAwaitingOrders().catch(() => {});
  });
}

async function showAwaitingOrders() {
  const det = $("#auto-detail"); if (!det) return;
  const head = `<div class="adet-head">📦 자동발주 — 발주 대기 주문</div>`;
  det.innerHTML = head + `<div class="adet-ex muted">불러오는 중…</div>`;
  const r = await fetch("/api/blackboard/awaiting-orders").then((x) => x.json()).catch(() => null);
  const orders = (r && r.orders) || [];
  if (!orders.length) {
    det.innerHTML = `<div class="adet-head">📦 자동발주 — 발주 대기 주문</div><div class="adet-ex">발주 대기 주문이 없습니다.</div>`;
    return;
  }
  det.innerHTML = `<div class="adet-head">📦 자동발주 — 발주 대기 ${orders.length}건 <span class="head-sub">클릭하면 생애주기</span></div>`
    + `<div class="awo-list">` + orders.map((o) => {
      const inb = (o.replenishments || []).map((i) =>
        `${escapeHtml(i.sku)} ${i.qty}개 · 도착예정 ${escapeHtml(i.expected_date)} <span class="ab ${i.status === "STOCKED" ? "ok" : "blk"}">${escapeHtml(i.status)}</span>`).join("<br>");
      return `<div class="awo-row" data-order="${escapeHtml(o.order_no)}">
        <div class="awo-id">${escapeHtml(o.order_no)} <span class="req-t">${hhmmss(o.created_at)}</span></div>
        <div class="awo-inb">${inb || "발주분 없음"}</div></div>`;
    }).join("") + `</div>`;
  det.querySelectorAll(".awo-row").forEach((row) =>
    row.addEventListener("click", () => selectRequest("outbound", row.dataset.order)));
}

async function syncLive() {
  try { const s = await fetch("/realtime/status").then((r) => r.json()); LIVE.running = !!s.running; } catch (_) {}
}
const DL_LABEL = { ASSIGNED: "✓ 배정", SKIP_ZONE_BUSY: "⏸ 존 사용중", SKIP_NO_TEAM: "팀 부족", DUP: "중복" };
async function loadDispatchLog() {
  const el = $("#dispatch-log"); if (!el) return;
  const r = await fetch("/api/blackboard/dispatch-log?limit=80").then((x) => x.json()).catch(() => null);
  const rows = (r && r.rows) || [];
  if (!rows.length) { el.innerHTML = `<div class="auto-empty">배정 계산 이력이 없습니다. 자동운영 중 팀이 배정될 때 기록됩니다.</div>`; return; }
  const groups = {};   // 사이클(cycle_ts)별 묶음
  rows.forEach((x) => { (groups[x.cycle_ts] = groups[x.cycle_ts] || []).push(x); });
  el.innerHTML = Object.entries(groups).slice(0, 6).map(([ts, gs]) => {
    gs.sort((a, b) => b.dispatch_score - a.dispatch_score);
    const items = gs.slice(0, 12).map((g) => {
      const cls = g.decision === "ASSIGNED" ? "ok" : g.decision.startsWith("SKIP_ZONE") ? "warn" : "mut";
      const f = g.factors || {};
      const ftxt = g.kind === "picking"
        ? `마감긴급 ${f.due_urgency ?? "-"} · 대기 ${f.waiting_age ?? "-"} · 짧은작업 ${f.short_job_bonus ?? "-"} · 동선 ${f.route_simplicity ?? "-"}${f.slack_minutes != null ? ` · slack ${f.slack_minutes}분` : ""}`
        : `입고경과 ${f.received_age ?? "-"} · 출고필요 ${f.outbound_need ?? "-"} · 대기 ${f.waiting_age ?? "-"} · 짧은작업 ${f.short_job_bonus ?? "-"}`;
      return `<div class="dl-row ${cls}"><span class="dl-score">${g.dispatch_score}</span>
        <span class="dl-kind">${g.kind === "picking" ? "🛒 피킹·출고" : "📥 적치·입고"}</span>
        <span class="dl-task">${escapeHtml(g.task_id)}</span><span class="dl-zone">${escapeHtml(g.zone_id || "-")}</span>
        <span class="dl-dec ${cls}">${DL_LABEL[g.decision] || safeText(g.decision)}</span>
        <span class="dl-fac">${escapeHtml(ftxt)}</span></div>`;
    }).join("");
    const assigned = gs.filter((g) => g.decision === "ASSIGNED").length;
    const head = `<div class="dl-row dl-head"><span>점수</span><span>유형</span><span>작업ID</span><span>존</span><span>판정</span><span>점수 인수(가중합 근거)</span></div>`;
    return `<div class="dl-cycle"><div class="dl-ts">${escapeHtml(ts)} · 후보 ${gs.length} · 배정 ${assigned}</div>${head}${items}</div>`;
  }).join("");
}

const RL_SRC = { AUTO: "🤖 자동", HITL: "🙋 지시" };
async function loadRouteLog() {
  const el = $("#route-log"); if (!el) return;
  const r = await fetch("/api/blackboard/route-log?limit=60").then((x) => x.json()).catch(() => null);
  const rows = (r && r.rows) || [];
  if (!rows.length) { el.innerHTML = `<div class="auto-empty">ZONE 방문순서 계산 이력이 없습니다. 피킹 작업이 발행/지시될 때 기록됩니다.</div>`; return; }
  el.innerHTML = rows.slice(0, 30).map((g) => {
    const seq = Array.isArray(g.zone_sequence) ? g.zone_sequence : [];
    const ids = Array.isArray(g.zone_ids) ? g.zone_ids : [];
    const short = (z) => String(z).replace(/^ZONE_/, "");
    const path = seq.length ? ["입구", ...seq.map(short), "입구"].join(" → ") : "—";
    const cls = g.source === "HITL" ? "warn" : "ok";
    const total = Math.round((g.travel_minutes || 0) + (g.work_minutes || 0));
    return `<div class="rl-row ${cls}">
      <span class="rl-src ${cls}">${RL_SRC[g.source] || safeText(g.source)}</span>
      <span class="rl-task">${escapeHtml(g.task_id || "-")}</span>
      <span class="rl-order">${escapeHtml(g.order_no || "-")}</span>
      <span class="rl-path">${escapeHtml(path)}</span>
      <span class="rl-meta">방문존 ${ids.length} · 거리 ${(g.route_cost ?? 0).toFixed ? g.route_cost.toFixed(2) : g.route_cost} · 이동 ${g.travel_minutes ?? "-"}분 · 작업 ${g.work_minutes ?? "-"}분 · 합 ${total}분</span>
      <span class="rl-ts">${escapeHtml(g.ts || "")}</span></div>`;
  }).join("");
}

// 액션 실행 순서 로그 — 사이클별 실행순(seq)·우선순위·결과. 자원해제(FINISH) 최우선·priority 실행 검증
const EL_ICON = { FINISH_ZONE_LEG: "🏁 완료", START_ZONE_WORK: "▶ 시작", ALLOCATE_TEAM: "👥 팀배정",
  CREATE_PICKING_TASK: "🛒 피킹생성", REPRIORITIZE_PICKING_TASK: "↕ 재정렬", CREATE_SHIPPING_TASK: "🚚 출고",
  PLACE_REPLENISHMENT_ORDER: "📦 발주", CREATE_PUTAWAY_TASK: "📥 적치생성", CREATE_INBOUND_TASK: "📋 입고생성",
  PUTAWAY_BLOCKED: "⛔ 적치보류", INVENTORY_RISK_ALERT: "⚠ 위험경보" };
const EL_EXECUTED = new Set(["SUCCESS", "ASSIGNED"]);   // 실제 실행된 결과(그 외는 차단/보류/실패=미실행)
let EXEC_GROUPS = {}, EXEC_EXPLAIN_WIRED = false, EXEC_LAST_TS = null, EXEC_SHOWN_TS = null;   // 실행 로그 설명 패널 상태
// dispatch 인수 키 → 한글 라벨(경합 사유 가독성)
const EL_FKEY = { due_urgency: "마감긴급", waiting_age: "대기", short_job_bonus: "짧은작업", route_simplicity: "동선",
  received_age: "입고경과", outbound_need: "출고필요" };
const EL_HIDE = ["pending_outbound_qty", "inbound_qty", "remaining_minutes", "remaining_work", "remaining_travel", "slack_minutes"];
// A단계(작업 진행 스케줄러) 액션 유형 — 나머지는 B단계(신규 편성, 에이전트 제안)
const EL_STAGE_A = new Set(["FINISH_ZONE_LEG", "START_ZONE_WORK", "ALLOCATE_TEAM"]);
async function loadExecLog() {
  const el = $("#exec-log"); if (!el) return;
  const r = await fetch("/api/blackboard/exec-log?limit=120").then((x) => x.json()).catch(() => null);
  const rows = (r && r.rows) || [];
  if (!rows.length) { el.innerHTML = `<div class="auto-empty">실행 이력이 없습니다. 자동운영 사이클에서 액션이 실행되면 순서대로 기록됩니다.</div>`; return; }
  const groups = {};   // 사이클(cycle_ts)별 묶음
  rows.forEach((x) => { (groups[x.cycle_ts] = groups[x.cycle_ts] || []).push(x); });
  EXEC_GROUPS = groups;   // 설명 패널이 참조
  const elRow = (g) => {
    const executed = EL_EXECUTED.has(g.decision);
    const cls = executed ? "ok" : g.decision === "POLICY_BLOCKED" ? "warn" : "mut";
    const decTxt = executed ? safeText(g.decision)
      : g.decision === "POLICY_BLOCKED" ? "차단 · 미실행" : safeText(g.decision) + " · 미실행";
    const base = Math.round(g.base_priority), eff = Math.round(g.effective_priority), adj = eff - base;
    const f = g.factors;
    const ftxt = f ? Object.entries(f).filter(([k]) => !EL_HIDE.includes(k))
      .map(([k, v]) => `${EL_FKEY[k] || k} ${v}`).join(" · ") : "";
    const why = [];
    if (g.reason) why.push(escapeHtml(g.reason));
    if (ftxt) why.push("인수: " + escapeHtml(ftxt));
    return `<div class="el-entry ${cls}${executed ? "" : " el-unexec"}">
      <div class="el-row">
        <span class="el-seq">#${g.seq}</span>
        <span class="el-type">${EL_ICON[g.action_type] || safeText(g.action_type)}</span>
        <span class="el-prio" title="유형기준 ${base} + 우선순위 조정 ${adj} = ${eff}">${eff}<small class="el-decomp">유형 ${base}+조정 ${adj}</small></span>
        <span class="el-tgt">${escapeHtml(g.target_id || "-")}</span>
        <span class="el-dec ${cls}">${decTxt}</span>
      </div>
      ${why.length ? `<div class="el-why">↳ ${why.join(" · ")}</div>` : ""}
    </div>`;
  };
  el.innerHTML = Object.entries(groups).slice(0, 6).map(([ts, gs]) => {
    gs.sort((a, b) => a.seq - b.seq);   // 실행 순서대로
    const aRows = gs.filter((g) => EL_STAGE_A.has(g.action_type));   // 작업 진행(스케줄러)
    const bRows = gs.filter((g) => !EL_STAGE_A.has(g.action_type));  // 신규 편성(에이전트 제안)
    let sec = "";
    if (aRows.length) {
      sec += `<div class="el-phase el-phaseA">A단계 · 작업 진행 <small>발행된 작업을 완료→시작→팀배정 · 자원해제 최우선(고정 순서)</small></div>`
        + aRows.map(elRow).join("");
    }
    if (bRows.length) {
      let comp = "";
      if (bRows.length >= 2) {   // B단계 경합: 우선순위(유형+조정) 높은 순, 동점은 대상키 순
        const top = bRows[0], eff0 = Math.round(top.effective_priority);
        const tie = bRows.filter((x) => Math.round(x.effective_priority) === eff0).length > 1;
        const bBlk = bRows.filter((x) => !EL_EXECUTED.has(x.decision)).length;
        comp = ` <span class="el-comp">경합 ${bRows.length}건 → 우선순위 높은 순${tie ? "(동점은 대상키 순)" : ""}, #${top.seq} ${EL_ICON[top.action_type] || top.action_type} ${eff0} 최고${bBlk ? ` · ${bBlk}건 미실행` : ""}</span>`;
      }
      sec += `<div class="el-phase el-phaseB">B단계 · 신규 편성 <small>이벤트 대응 에이전트 제안 · 우선순위 경합</small>${comp}</div>`
        + bRows.map(elRow).join("");
    }
    // 헤더 카운트: 실제 실행(SUCCESS/ASSIGNED)만 '실행', 차단/보류·실패는 별도 표기
    const exec = gs.filter((g) => EL_EXECUTED.has(g.decision)).length;
    const blk = gs.filter((g) => g.decision === "POLICY_BLOCKED").length;
    const fail = gs.length - exec - blk;
    let cnt = `실행 ${exec}건`;
    if (blk) cnt += ` · 차단 ${blk}`;
    if (fail) cnt += ` · 실패 ${fail}`;
    return `<div class="el-cycle el-clickable" data-ts="${escapeHtml(ts)}" title="클릭 → 판단 사유 설명"><div class="el-ts">${escapeHtml(ts)} · ${cnt} <span class="el-explain-hint">💬 설명</span></div>${sec}</div>`;
  }).join("");
  setupExecExplain();
  const newest = Object.keys(groups)[0];
  // 최초이거나, 사용자가 과거 사이클을 고정해 보고 있지 않으면(=최신을 따라가는 중) 최신 사이클 표시
  if (newest) {
    const following = EXEC_SHOWN_TS === null || EXEC_SHOWN_TS === EXEC_LAST_TS;
    if (EXEC_SHOWN_TS === null || (newest !== EXEC_LAST_TS && following)) explainExecCycle(newest);
  }
  EXEC_LAST_TS = newest;
}

function setupExecExplain() {
  if (EXEC_EXPLAIN_WIRED) return;
  const log = $("#exec-log"); if (!log) return;
  log.addEventListener("click", (e) => {
    const cyc = e.target.closest && e.target.closest(".el-cycle");
    if (cyc && cyc.dataset.ts) explainExecCycle(cyc.dataset.ts);
  });
  EXEC_EXPLAIN_WIRED = true;
}

// 로그 reason 문자열에서 원제안 사유 / 차단 사유 분리
function elSplitReason(reason) {
  if (!reason) return { main: "", block: "" };
  const i = reason.indexOf("[차단]");
  if (i >= 0) return { main: reason.slice(0, i).replace(/[—-]\s*$/, "").trim(), block: reason.slice(i + 4).trim() };
  return { main: reason.trim(), block: "" };
}

// 사이클의 판단 사유를 자연어로 풀어 우측 설명 패널에 추가
function explainExecCycle(ts) {
  const gs = (EXEC_GROUPS[ts] || []).slice().sort((a, b) => a.seq - b.seq);
  const box = $("#exec-explain"); if (!box || !gs.length) return;
  const A = gs.filter((g) => EL_STAGE_A.has(g.action_type));
  const B = gs.filter((g) => !EL_STAGE_A.has(g.action_type));
  const exec = gs.filter((g) => EL_EXECUTED.has(g.decision));
  const blk = gs.filter((g) => g.decision === "POLICY_BLOCKED");
  const nm = (g) => escapeHtml(EL_ICON[g.action_type] || g.action_type);
  let html = `<div class="elx-h">🕘 ${escapeHtml(ts)} · 총 ${gs.length}건 (실행 ${exec.length} · 차단 ${blk.length})</div>`;
  html += `<p>실행 순서 = <b>유형기준 + 조정 = 최종우선순위</b>의 내림차순(동점은 대상 키 순).</p>`;
  if (A.length) {
    html += `<p><b>A단계 · 작업 진행</b>(자원해제 최우선, 고정 순서): ${A.map(nm).join(" → ")}. 이미 발행된 작업을 완료→시작→팀배정으로 먼저 처리합니다.</p>`;
  }
  if (B.length) {
    html += `<p><b>B단계 · 신규 편성</b> — 에이전트 제안 ${B.length}건 경합:</p><ol class="elx-list">`;
    B.forEach((g) => {
      const base = Math.round(g.base_priority), eff = Math.round(g.effective_priority), adj = eff - base;
      const { main, block } = elSplitReason(g.reason);
      const done = EL_EXECUTED.has(g.decision);
      html += `<li class="${done ? "" : "elx-blk"}"><b>${nm(g)}</b> 최종 <b>${eff}</b> = 유형 ${base} + 조정 ${adj}`
        + (main ? ` · ${escapeHtml(main)}` : "")
        + (done ? ` <span class="elx-ok">✅ 실행</span>` : ` <span class="elx-no">⛔ 차단(미실행)${block ? ": " + escapeHtml(block) : ""}</span>`)
        + `</li>`;
    });
    html += `</ol>`;
    if (blk.length) {
      const rs = [...new Set(blk.map((g) => elSplitReason(g.reason).block).filter(Boolean))];
      html += `<p class="elx-note">⛔ 차단 ${blk.length}건은 우선순위와 무관하게 <b>정책·시뮬 게이트</b>에 막혔습니다${rs.length ? ` — ${escapeHtml(rs.join("; "))}` : ""}. 게이트 대상 유형(입고·적치=보관공간, 피킹·팀배정=가동률)이 과부하이면 해당 액션만 보류됩니다.</p>`;
    }
  }
  box.innerHTML = `<div class="el-bubble">${html}</div>`;   // 클릭한 사이클만 표시(누적 안 함)
  EXEC_SHOWN_TS = ts;
  box.scrollTop = 0;
}

function enterAuto() {
  setupAuto();
  // 로그를 새로 그려 깜빡임/잔재 없이 현재 상태부터 시작
  AUTO.renderedLogs = new Set();
  const box = $("#auto-log"); if (box) box.innerHTML = `<div class="auto-empty">동작 없음 — 자동운영을 시작하면 단계별로 표시됩니다.</div>`;
  syncLive().catch(() => {});
  pollAuto().catch(() => {});
  refreshSimbar().catch(() => {});
  if (AUTO.poll) clearInterval(AUTO.poll);
  AUTO.poll = setInterval(() => { updateAgentFlash(); pollAuto().catch(() => {}); }, 1000);
}
function leaveAuto() { if (AUTO.poll) { clearInterval(AUTO.poll); AUTO.poll = null; } }

async function init() {
  setupTabs(); setupChat(); setupDataBrowser(); setupRealtime();
  loadSessions().catch(() => {});
  const ss = document.querySelector(".side-search");
  if (ss) ss.addEventListener("input", (e) => { CHAT.filter = e.target.value; renderSessions(); });
  const nc = $("#new-chat"); if (nc) nc.addEventListener("click", () => { activateTab("chat"); resetChat(); });
  $("#run-sim").addEventListener("click", runSimClick);
  $("#refresh").addEventListener("click", refreshDashboard);
  $("#refresh-kpi").addEventListener("click", () => {
    loadKpiTargets().then(loadOperationKpis).catch(() => {});
    loadUtilizationTrend().catch(() => {});
    loadDelayTrend().catch(() => {});
  });
  const tz = $("#target-zone-occupancy"), tu = $("#target-utilization");
  if (tz) tz.addEventListener("change", () => saveKpiTarget("kpi_target_zone_occupancy", tz.value));
  if (tu) tu.addEventListener("change", () => saveKpiTarget("kpi_target_utilization", tu.value));
  $("#refresh-data").addEventListener("click", refreshDataBrowser);
  const ra = $("#refresh-approval"); if (ra) ra.addEventListener("click", () => loadApproval().catch(() => {}));
  const rt = $("#refresh-trace"); if (rt) rt.addEventListener("click", () => { TRACE.runId = null; loadTraces().catch(() => {}); });
  $("#commit-baseline").addEventListener("click", commitBaseline);
  $("#tw-play").addEventListener("click", twTogglePlay);
  $("#tw-range").addEventListener("input", (e) => { if (TW.timer) twTogglePlay(); twSetFrame(Number(e.target.value)); });
  await loadZoneTypes().catch(() => {});
  await loadResources();
  await loadKpiTargets().catch(() => {});
  await loadOperationKpis().catch(() => {});
  loadUtilizationTrend().catch(() => {});
  loadDelayTrend().catch(() => {});
  await refreshDataBrowser().catch(() => {});
  await initSim();
}

// 재시작·재로드 시: 저장된 현재 기준(BASELINE)이 있으면 로드만(재기동 없음), 없을 때만 최초 1회 생성
async function initSim() {
  await loadVersions();
  if (BASELINE_VER) await selectVersion();
  else await runSim();
}
init();
