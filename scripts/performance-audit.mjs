import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { startBrowserAudit } from "./browser-audit.mjs";

const { cdp, evaluate, targetUrl, close, waitFor, errors, on } = await startBrowserAudit();
// A complete, deterministic feed avoids measuring fixture generation on the main thread.
const feed = JSON.stringify(
  Array.from({ length: 10000 }, (_, i) => ({
    station_no: String(i),
    name_tw: `測試站 ${i}`,
    name_en: `Station ${i}`,
    district_tw: "測試區",
    address_tw: "測試路一段一號",
    area_code: "00",
    country_code: "00",
    status: 1,
    type: 2,
    lat: String(25.0478 + Math.floor(i / 100) * 0.003),
    lng: String(121.5319 + (i % 100) * 0.003),
    parking_spaces: 10,
    available_spaces: 3,
    empty_spaces: 7,
    forbidden_spaces: 0,
    available_spaces_detail: { yb1: 0, yb2: 3, eyb: 0 },
    available_spaces_level: 1,
    time: "2026-10-04 12:00:00",
    updated_at: "2026-10-04 12:00:00",
  })),
);
try {
  await cdp("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    localStorage.setItem("youbike-map-collapsed", "1");
    navigator.permissions.query = async () => ({ state: "granted" });
    navigator.geolocation.getCurrentPosition = (done) => done({ coords: { latitude: 25.0478, longitude: 121.5319 } });
    window.perfAudit = { lcp: 0, shifts: [], tasks: [], interactions: [], workers: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); perfAudit.workers++; this.addEventListener("message", () => { perfAudit.workerMessages = (perfAudit.workerMessages || 0) + 1; }); }
    };
    for (const type of ["largest-contentful-paint", "layout-shift", "longtask", "event"]) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === "largest-contentful-paint") perfAudit.lcp = entry.startTime;
          if (type === "layout-shift" && !entry.hadRecentInput) perfAudit.shifts.push({ time: entry.startTime, value: entry.value });
          if (type === "longtask") perfAudit.tasks.push({ time: entry.startTime, duration: entry.duration });
          if (type === "event" && entry.interactionId) perfAudit.interactions.push(entry.duration);
        }
      }).observe({ type, buffered: true, durationThreshold: 16 });
    }
  `,
  });
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*apis.youbike.com.tw/*" }] });
  on("Fetch.requestPaused", async ({ requestId, request }) => {
    await delay(300);
    await cdp("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: "application/json" },
        { name: "Access-Control-Allow-Origin", value: "*" },
      ],
      body: Buffer.from(request.url.includes("station-yb2") ? feed : "[]").toString("base64"),
    });
  });
  await cdp("Page.navigate", { url: targetUrl });
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 10');
  const resultsReadyMs = await evaluate("performance.now()");
  await delay(500);
  const startup = await evaluate("structuredClone(perfAudit)");
  // Trusted input exercises React's real search path under CPU throttling.
  await evaluate('document.querySelector(".search-input").focus()');
  for (const text of ["測", "試", "站", " ", "9", "9", "9", "9"]) {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: text, text });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: text });
    await delay(80);
  }
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 1');
  await delay(200);
  const report = await evaluate(`(() => {
    let cls = 0, windowValue = 0, start = 0, previous = 0;
    for (const shift of perfAudit.shifts) {
      if (shift.time - previous > 1000 || shift.time - start > 5000) { start = shift.time; windowValue = 0; }
      windowValue += shift.value; previous = shift.time; cls = Math.max(cls, windowValue);
    }
    return { lcpMs: perfAudit.lcp, cls, workers: perfAudit.workers, workerMessages: perfAudit.workerMessages,
      maxObservedInteractionMs: Math.max(0, ...perfAudit.interactions),
      initialCssBytes: performance.getEntriesByType('resource').filter(r => r.name.endsWith('.css')).reduce((n, r) => n + r.decodedBodySize, 0),
      mainScriptBytes: performance.getEntriesByType('resource').filter(r => r.name.endsWith('.js') && !r.name.includes('/workers/')).reduce((n, r) => n + r.decodedBodySize, 0) };
  })()`);
  Object.assign(report, {
    resultsReadyMs,
    startupShifts: startup.shifts,
    startupMaxTaskMs: Math.max(0, ...startup.tasks.map((t) => t.duration)),
    startupBlockingMs: startup.tasks.reduce((n, t) => n + Math.max(0, t.duration - 50), 0),
    fixtureBytes: Buffer.byteLength(feed),
    cpuSlowdown: 4,
    note: "Lab diagnostics with local assets and a 300ms fixture response; not field Core Web Vitals or an INP percentile.",
  });
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(report.workerMessages >= 2, "both feeds must be parsed in the worker");
  assert.ok(
    report.mainScriptBytes < 450_000,
    "initial UI JavaScript exceeds the 450 kB decoded budget",
  );
  assert.ok(report.initialCssBytes < 20_000, "map CSS should not block the initial page");
  assert.ok(report.cls <= 0.1, `layout shift budget exceeded: ${report.cls}`);
  assert.ok(
    await evaluate(
      "!performance.getEntriesByType('resource').some(r => r.name.includes('/chunks/parse-feed-'))",
    ),
    "worker path must not load the main-thread parser",
  );
  if (process.env.REPORT_PATH)
    writeFileSync(process.env.REPORT_PATH, JSON.stringify(report, null, 2));
} finally {
  close();
}
