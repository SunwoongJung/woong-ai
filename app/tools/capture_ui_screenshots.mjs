import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:8001/";
const outDir = path.resolve("screenshots");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9223;
const width = 1440;
const height = 950;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(2000, () => {
      req.destroy(new Error(`timeout: ${url}`));
    });
  });
}

async function waitForDebugPort() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await getJson(`http://127.0.0.1:${port}/json/list`);
      if (Array.isArray(list) && list.length) return list;
    } catch (_) {
      await sleep(250);
    }
  }
  throw new Error("Edge DevTools port did not open");
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result || {});
  };

  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const id = ++seq;
          pending.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      resolve({ ws, send });
    };
    ws.onerror = reject;
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const profileDir = path.resolve("screenshots", ".edge-profile");
  await rm(profileDir, { recursive: true, force: true });

  const edge = spawn(edgePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--window-size=${width},${height}`,
    baseUrl,
  ], { stdio: "ignore" });

  let client;
  try {
    const targets = await waitForDebugPort();
    const page = targets.find((t) => t.type === "page") || targets[0];
    client = await connect(page.webSocketDebuggerUrl);
    const { send } = client;

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: baseUrl });
    await waitForReady(send);
    await sleep(6500);

    const shot = async (name) => {
      await sleep(900);
      const result = await send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
      });
      await writeFile(path.join(outDir, name), Buffer.from(result.data, "base64"));
      console.log(`saved ${name}`);
    };

    await shot("01_ui_overview_agent_chat.png");

    await evaluate(send, `activateTab("chat"); openTodoPanel();`);
    await waitForExpression(send, `
      (() => {
        const el = document.querySelector("#todo-body");
        return !!el && !el.textContent.includes("불러오는 중");
      })()
    `, 30000);
    await shot("02_agent_chat_today_todo_panel.png");

    await evaluate(send, `showToast({ kind: "ok", id: "manual-toast", message: "보류 — Approval 탭 대기" });`);
    await sleep(500);
    await shot("03_toast_notification.png");

    await tab(send, "kpi");
    await sleep(2500);
    await shot("04_kpi_dashboard.png");

    await tab(send, "data");
    await sleep(2500);
    await shot("05_operation_data.png");

    await tab(send, "sim");
    await sleep(2500);
    await shot("06_warehouse_simulation.png");

    await tab(send, "approval");
    await sleep(1800);
    await shot("07_approval.png");

    await tab(send, "trace");
    await sleep(1800);
    await shot("08_ai_observability_trace.png");

    await evaluate(send, `document.querySelector("#live-settings")?.click();`);
    await sleep(700);
    await shot("09_realtime_demand_settings.png");
    await evaluate(send, `document.querySelector("#live-modal-x")?.click();`);

    await tab(send, "auto");
    await sleep(2500);
    await shot("10_warehouse_auto_operation.png");

    await send("Browser.close").catch(() => {});
  } finally {
    if (client?.ws) client.ws.close();
    if (!edge.killed) edge.kill();
  }
}

async function waitForReady(send) {
  for (let i = 0; i < 80; i += 1) {
    const res = await send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (res.result?.value === "complete") return;
    await sleep(250);
  }
}

async function evaluate(send, expression) {
  return send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function waitForExpression(send, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await evaluate(send, expression);
    if (res.result?.value) return;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function tab(send, name) {
  await evaluate(send, `activateTab(${JSON.stringify(name)});`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
