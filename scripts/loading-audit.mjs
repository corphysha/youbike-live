import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { startBrowserAudit } from "./browser-audit.mjs";

const { cdp, evaluate, targetUrl, close, waitFor, errors, on } = await startBrowserAudit();
const settleStyles = () =>
  evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
const assertUpdateFeedback = async (
  updating,
  expectedMessage = updating ? "站點資料更新中" : "站點資料已更新",
) => {
  await waitFor(
    `document.querySelector(".masthead .refresh-btn")?.getAttribute("aria-disabled") === "${updating}"`,
  );
  // Let style invalidation and painting catch up with React's attribute updates.
  await settleStyles();
  const feedback = await evaluate(`(() => {
    const button = document.querySelector(".masthead .refresh-btn");
    const progress = document.querySelector(".feed-progress");
    const indicator = document.querySelector(".feed-progress-indicator");
    const icon = button.querySelector("svg");
    const label = [...button.querySelectorAll(".refresh-label > span")].find(el => getComputedStyle(el).visibility !== "hidden");
    return {
      busy: button.getAttribute("aria-busy"),
      disabled: button.disabled,
      label: label.innerText.trim(),
      accessibleLabel: button.getAttribute("aria-label"),
      spinning: icon.classList.contains("spin"),
      iconAnimation: getComputedStyle(icon).animationName,
      progress: !!progress,
      decorativeProgress: progress?.getAttribute("aria-hidden"),
      progressSemantics: !!document.querySelector(".masthead progress, .masthead [role=progressbar]"),
      liveRegions: document.querySelectorAll(".masthead [role=status]").length,
      barHeight: indicator?.getBoundingClientRect().height,
      barAnimation: indicator && getComputedStyle(indicator).animationName,
      animated: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      status: document.querySelector(".masthead [role=status]").textContent.trim(),
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  })()`);
  assert.equal(feedback.busy, null, "the live region is the only update announcement");
  assert.equal(feedback.disabled, false, "aria-disabled must preserve keyboard focus");
  assert.equal(feedback.accessibleLabel, "重新整理站點資料");
  assert.equal(feedback.progressSemantics, false);
  assert.equal(feedback.liveRegions, 1);
  assert.equal(feedback.status, expectedMessage);
  assert.equal(feedback.spinning, updating);
  assert.equal(feedback.progress, updating);
  assert.equal(feedback.overflow, false, "refresh feedback must fit the viewport");
  if (updating) {
    assert.equal(feedback.label, "更新中");
    assert.equal(feedback.decorativeProgress, "true");
    assert.equal(feedback.barHeight, 3);
    assert.equal(feedback.iconAnimation, feedback.animated ? "spin" : "none");
    assert.equal(feedback.barAnimation, feedback.animated ? "feed-progress" : "none");
  } else {
    assert.ok(["更新", "重新整理"].includes(feedback.label), JSON.stringify(feedback));
    assert.equal(feedback.iconAnimation, "none");
  }
};
try {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1024,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  // Deterministic feeds: delayed area names, controllable errors/updates, 10,000 stations.
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    window.audit = { stationRequests: 0, areaRequests: 0, fail: false, available: 3,
      lat: 25.0478, lng: 121.5319, denied: false, held: false };
    if (location.search.includes("held")) audit.held = true;
    if (location.search.includes("denied")) audit.denied = true;
    if (location.search.includes("failure")) audit.fail = true;
    if (location.search.includes("fallback")) delete window.IntersectionObserver;
    if (location.search.includes("worker-disabled")) delete window.Worker;
    if (location.search.includes("worker-blocked")) window.Worker = class {
      constructor() { throw new Error("Worker blocked by policy"); }
    };
    if (location.search.includes("worker-error")) {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor() { super('data:text/javascript,throw new Error("Worker startup failure")', { type: "module" }); }
      };
    }
    if (location.search.includes("legacy-abort")) {
      delete AbortSignal.any;
      delete AbortSignal.timeout;
      delete AbortSignal.prototype.throwIfAborted;
    }
    if (location.search.includes("notification-check")) {
      audit.notifications = [];
      audit.rejections = [];
      window.addEventListener("unhandledrejection", (event) => audit.rejections.push(String(event.reason)));
      localStorage.setItem("youbike-live:trip", JSON.stringify({ startId: "0", endId: "1" }));
      localStorage.setItem("youbike-live:routes", JSON.stringify([{ id: "0>1", startId: "0", endId: "1" }]));
      localStorage.removeItem("youbike-live:arrival-alerts");
      window.Notification = class {
        static permission = "granted";
        static async requestPermission() { return "granted"; }
        constructor(title, options) { audit.notifications.push({ title, ...options }); }
      };
      navigator.serviceWorker.getRegistration = async () => ({
        showNotification: async (title, options) => { audit.notifications.push({ title, ...options }); }
      });
      navigator.geolocation.watchPosition = (success) => { audit.watch = success; return 1; };
      navigator.geolocation.clearWatch = () => { audit.watch = null; };
    }
    audit.areaFail = location.search.includes("area-retry");
    const originalInterval = window.setInterval;
    window.setInterval = (callback, ms, ...args) => {
      if (ms === 60000) audit.refresh = callback;
      return originalInterval(callback, ms, ...args);
    };
    audit.mapCreates = 0;
    Object.defineProperty(window, "L", {
      configurable: true,
      get: () => audit.leaflet,
      set: (leaflet) => {
        audit.leaflet = leaflet;
        const createMap = leaflet.map;
        leaflet.map = (...args) => {
          audit.mapCreates++;
          audit.map = createMap(...args);
          return audit.map;
        };
      }
    });
    localStorage.setItem("youbike-map-collapsed", "1");
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (String(url).includes("area-all.json")) {
        audit.areaRequests++;
        if (audit.areaFail) return new Response("unavailable", { status: 503 });
        return new Promise((resolve) => {
          audit.releaseAreas = () => resolve(Response.json([
            { area_code: "00", area_name_tw: "測試縣市", sort: 1 }
          ]));
        });
      }
      if (String(url).includes("station-yb2.json")) {
        audit.stationRequests++;
        if (audit.offline) throw new TypeError("Failed to fetch");
        if (audit.held) await new Promise((resolve, reject) => {
          audit.releaseStations = resolve;
          options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
        });
        if (audit.invalid) return new Response("not JSON");
        if (audit.fail) return new Response("unavailable", { status: 503 });
        return Response.json(Array.from({ length: 10000 }, (_, i) => ({
          station_no: String(i), name_tw: "測試站 " + i, name_en: "Station " + i,
          district_tw: "測試區", address_tw: "測試路", area_code: "00", status: 1,
          lat: String(25.0478 + Math.floor(i / 100) * 0.003),
          lng: String(121.5319 + (i % 100) * 0.003),
          available_spaces: audit.available, empty_spaces: 7, parking_spaces: 10,
          updated_at: "2026-10-04 12:00:00"
        })));
      }
      return originalFetch(url, options);
    };
    navigator.permissions.query = async () => ({ state: audit.denied ? "denied" : "granted" });
    navigator.geolocation.getCurrentPosition = (success, failure) => {
      if (audit.denied) failure({ code: 1, PERMISSION_DENIED: 1 });
      else success({ coords: { latitude: audit.lat, longitude: audit.lng } });
    };
  `,
  });
  // Local tile fixtures make request counts independent of the external tile service.
  let tileRequests = 0;
  let notificationChunkRequests = 0;
  await cdp("Fetch.enable", {
    patterns: [
      { urlPattern: "*tile.openstreetmap.org/*" },
      { urlPattern: "*notification-messages-*.js" },
    ],
  });
  // The shared CDP helper exposes events through a listener below.
  on("Fetch.requestPaused", async ({ requestId, request }) => {
    // Model a stale tab whose notification chunk was removed by a new deployment.
    if (request.url.includes("notification-messages-")) {
      notificationChunkRequests++;
      await cdp("Fetch.failRequest", { requestId, errorReason: "Failed" });
      return;
    }
    tileRequests++;
    await cdp("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "image/png" }],
      body: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    });
  });
  await cdp("Page.navigate", { url: `${targetUrl}?held` });
  await waitFor("audit.releaseStations");
  // First load shows honest progress and readable feedback on both desktop and small phones.
  for (const width of [320, 390, 1024]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await assertUpdateFeedback(true);
  }
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await assertUpdateFeedback(true);
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await evaluate("audit.held = false; audit.releaseStations()");
  await waitFor(
    'document.querySelectorAll(".station-list .station-card").length === 10',
    "nearest ten cards before area response",
  );
  await assertUpdateFeedback(false);
  // Foreground and background updates preserve focus and size, including enlarged fallback text.
  for (const [width, fontSize] of [
    [320, 18],
    [1024, 20],
  ]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await evaluate(`(() => {
      const button = document.querySelector(".masthead .refresh-btn");
      button.style.fontSize = "${fontSize}px";
      button.style.fontFamily = "serif";
      button.focus();
      audit.held = true;
    })()`);
    await settleStyles();
    const dimensions = await evaluate(
      '({ width: document.querySelector(".masthead .refresh-btn").offsetWidth, height: document.querySelector(".masthead").offsetHeight })',
    );
    for (const trigger of [
      'document.querySelector(".masthead .refresh-btn").click()',
      "audit.refresh()",
      'document.dispatchEvent(new Event("visibilitychange"))',
    ]) {
      await evaluate(`delete audit.releaseStations; ${trigger}`);
      await waitFor("audit.releaseStations");
      await assertUpdateFeedback(true, trigger.includes("click") ? "站點資料更新中" : "");
      assert.ok(
        await evaluate(
          'document.activeElement === document.querySelector(".masthead .refresh-btn")',
        ),
      );
      assert.deepEqual(
        await evaluate(
          '({ width: document.querySelector(".masthead .refresh-btn").offsetWidth, height: document.querySelector(".masthead").offsetHeight })',
        ),
        dimensions,
        "labels must reserve their intrinsic width at enlarged text sizes",
      );
      await evaluate("audit.releaseStations()");
      await assertUpdateFeedback(false, trigger.includes("click") ? "站點資料已更新" : "");
      assert.ok(
        await evaluate(
          'document.activeElement === document.querySelector(".masthead .refresh-btn")',
        ),
      );
    }
    await evaluate(
      'audit.held = false; document.querySelector(".masthead .refresh-btn").removeAttribute("style")',
    );
  }
  assert.equal(await evaluate("audit.areaRequests"), 1);
  assert.equal(await evaluate("audit.mapCreates"), 0, "saved collapsed map must stay unloaded");
  assert.equal(tileRequests, 0);
  assert.equal(
    await evaluate(
      'performance.getEntriesByType("resource").filter(r => /leaflet.*.js/.test(r.name)).length',
    ),
    0,
  );
  assert.ok(
    await evaluate(`(() => {
    const distances = [...document.querySelectorAll(".station-distance")].map(el => +el.dataset.distanceMeters);
    return distances.length === 10 && distances[0] === 0 && distances.every((d, i) => i === 0 || d >= distances[i - 1]);
  })()`),
  );
  await evaluate('document.querySelector(".load-more").click()');
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 50');
  await evaluate("audit.releaseAreas()");
  await waitFor('document.querySelector(".chip-row").textContent.includes("測試縣市")');

  // Expanding outside the viewport still must not initialize Leaflet.
  await evaluate(
    'window.scrollTo(0, document.body.scrollHeight); document.querySelector(".map-toggle").click()',
  );
  await delay(200);
  assert.equal(
    await evaluate("audit.mapCreates"),
    0,
    "off-screen map should wait for first visibility",
  );
  await evaluate('document.querySelector("#map-body").scrollIntoView()');
  await waitFor("audit.mapCreates === 1 && document.querySelector('.user-location-dot')");
  assert.equal(
    await evaluate('getComputedStyle(document.querySelector(".leaflet-map-pane")).position'),
    "absolute",
    "lazy Leaflet CSS must load before the map is usable",
  );
  await evaluate(
    `void (audit.clusters = Object.values(audit.map._layers).find(layer => layer.getLayers && layer.zoomToShowLayer))`,
  );
  await waitFor("audit.clusters?.getLayers().length === 10000", "all stations progressively added");
  await evaluate("void audit.map.setView([25.055, 121.54], 17, { animate: false })");
  await delay(200);
  const before = await evaluate(`(() => {
    audit.savedMap = audit.map;
    audit.savedMarker = audit.clusters.getLayers()[0];
    audit.savedPane = document.querySelector('.leaflet-map-pane');
    return { center: audit.map.getCenter(), zoom: audit.map.getZoom(), requests: audit.stationRequests };
  })()`);
  const tileCount = tileRequests;
  for (let i = 0; i < 3; i++) {
    await evaluate('document.querySelector(".map-toggle").click()');
    await waitFor('document.querySelector("#map-body").hidden');
    await evaluate('document.querySelector(".map-toggle").click()');
    await waitFor('!document.querySelector("#map-body").hidden');
  }
  await delay(250);
  const after = await evaluate(
    "({ center: audit.map.getCenter(), zoom: audit.map.getZoom(), requests: audit.stationRequests })",
  );
  assert.equal(after.zoom, before.zoom);
  assert.equal(after.requests, before.requests);
  // Leaflet rounds the center to a pixel when remeasuring the same viewport.
  assert.ok(Math.abs(after.center.lat - before.center.lat) < 0.00001);
  assert.ok(Math.abs(after.center.lng - before.center.lng) < 0.00001);
  assert.ok(
    await evaluate(
      'audit.map === audit.savedMap && audit.savedPane === document.querySelector(".leaflet-map-pane") && audit.clusters.getLayers().includes(audit.savedMarker)',
    ),
  );
  assert.equal(await evaluate("audit.mapCreates"), 1);
  assert.equal(tileRequests, tileCount, "collapse/reveal should not request more tiles");

  // Refresh while hidden: keep the map and apply the latest values when revealed.
  await evaluate(
    'document.querySelector(".map-toggle").click(); audit.available = 8; document.querySelector(".refresh-btn").click()',
  );
  await waitFor('document.querySelector(".summary-line").textContent.includes("80,000")');
  await evaluate('document.querySelector(".map-toggle").click()');
  await waitFor('audit.savedMarker.options.title.includes("可借 8")');
  assert.ok(await evaluate("audit.clusters.getLayers().includes(audit.savedMarker)"));
  await evaluate('void audit.savedMarker.fire("click")');
  await waitFor('document.querySelector(".selected-station")?.textContent.includes("8")');
  const selection = await evaluate('document.querySelector(".selected-station h3").textContent');
  await evaluate('document.querySelector(".map-toggle").click()');
  await delay(50);
  await evaluate('document.querySelector(".map-toggle").click()');
  await delay(50);
  assert.equal(
    await evaluate('document.querySelector(".selected-station h3").textContent'),
    selection,
  );

  // Preserve main's new trip actions when selected-station details stay mounted.
  await evaluate('document.querySelector(".selected-station .trip-btn").click()');
  await waitFor(
    'document.querySelector(".trip-leg h3")?.textContent === document.querySelector(".selected-station h3")?.textContent',
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".selected-station .trip-btn").getAttribute("aria-pressed")',
    ),
    "true",
  );

  // Resize and relocate while hidden; both instant and animated recentering must use the new size.
  for (const [width, motion] of [
    [390, "reduce"],
    [1024, "no-preference"],
  ]) {
    await evaluate(
      'document.querySelector(".map-toggle").click(); audit.lat += 0.03; audit.lng += 0.01; document.querySelector(".map-section .locate-btn:not(.map-toggle)").click()',
    );
    await waitFor('document.querySelectorAll(".station-list .station-card").length === 10');
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await cdp("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: motion }],
    });
    await evaluate('document.querySelector(".map-toggle").click()');
    await waitFor(
      "Math.abs(audit.map.getCenter().lat - audit.lat) < 0.00001 && Math.abs(audit.map.getCenter().lng - audit.lng) < 0.00001",
    );
    await delay(800);
    assert.ok(
      await evaluate(
        "Math.abs(audit.map.getCenter().lat - audit.lat) < 0.00001 && Math.abs(audit.map.getCenter().lng - audit.lng) < 0.00001",
      ),
      "recenter must remain correct after resize/animation completes",
    );
    assert.equal(await evaluate("audit.mapCreates"), 1);
  }

  // Search must still find stations outside the initial ten, including after interrupted batches.
  const search = async (value) => {
    await evaluate(`(() => {
      const input = document.querySelector('.search-input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  };
  await search("測試站 9999");
  await waitFor(
    'audit.clusters.getLayers().length === 1 && document.querySelectorAll(".station-list .station-card").length === 1',
  );
  await search("");
  await delay(40);
  await search("測試站 8888");
  await waitFor("audit.clusters.getLayers().length === 1");
  await delay(500);
  assert.ok(
    await evaluate('audit.clusters.getLayers()[0].options.title.startsWith("測試站 8888")'),
  );
  await search("");
  await waitFor("audit.clusters.getLayers().length === 10000");

  // Failed refresh retains usable data; concurrent clicks do not duplicate a pending request.
  const requests = await evaluate("audit.stationRequests");
  const headerBefore = await evaluate(`(() => {
    const button = document.querySelector(".masthead .refresh-btn").getBoundingClientRect();
    return { width: button.width, height: document.querySelector(".masthead").offsetHeight };
  })()`);
  await evaluate(
    'audit.held = true; audit.fail = true; document.querySelector(".masthead .refresh-btn").focus(); document.querySelector(".refresh-btn").click(); document.querySelector(".refresh-btn").click()',
  );
  await waitFor(`audit.stationRequests === ${requests + 1}`);
  await assertUpdateFeedback(true);
  assert.deepEqual(
    await evaluate(`(() => {
      const button = document.querySelector(".masthead .refresh-btn").getBoundingClientRect();
      return { width: button.width, height: document.querySelector(".masthead").offsetHeight };
    })()`),
    headerBefore,
    "refresh feedback must not change header or button dimensions",
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".station-list .station-card").length'),
    10,
  );
  // Exercise button guarding and the load guard independently, allowing async work to settle.
  await evaluate('document.querySelector(".refresh-btn").click()');
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await delay(100);
  assert.equal(await evaluate("audit.stationRequests"), requests + 1);
  await evaluate("audit.refresh(); audit.refresh()");
  await delay(100);
  assert.equal(await evaluate("audit.stationRequests"), requests + 1);
  await evaluate("audit.releaseStations(); audit.held = false");
  await waitFor('document.querySelector(".status-strip.error")');
  const failedUpdateMessage = "更新失敗：資料來源回應 503";
  await assertUpdateFeedback(false, failedUpdateMessage);
  assert.ok(
    await evaluate(
      'document.querySelector(".status-strip.error").textContent.includes("上次成功更新")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".station-list .station-card").length'),
    10,
  );
  // Repeated failures retain the error node and layout; only manual attempts announce their outcome.
  await evaluate(`(() => {
    audit.savedError = document.querySelector(".status-strip.error");
    audit.savedErrorText = audit.savedError.textContent;
    audit.errorMutations = [];
    audit.errorObserver = new MutationObserver(records => {
      for (const record of records) {
        if ([...record.removedNodes].includes(audit.savedError) || record.target === audit.savedError || audit.savedError.contains(record.target)) audit.errorMutations.push(record.type);
      }
    });
    audit.errorObserver.observe(document.querySelector("main"), { childList: true, characterData: true, subtree: true });
    audit.updateMessages = [];
    const status = document.querySelector(".masthead [role=status]");
    audit.statusObserver = new MutationObserver(() => audit.updateMessages.push(status.textContent.trim()));
    audit.statusObserver.observe(status, { childList: true, characterData: true, subtree: true });
    audit.held = true;
    document.querySelector(".masthead .refresh-btn").focus();
  })()`);
  for (const selector of [".masthead .refresh-btn", ".status-strip .refresh-btn"]) {
    await evaluate(`(() => {
      audit.updateMessages = [];
      delete audit.releaseStations;
      const button = document.querySelector(${JSON.stringify(selector)});
      button.focus();
      button.click();
    })()`);
    await waitFor("audit.releaseStations");
    await assertUpdateFeedback(true);
    // Background-color transitions last 120ms; compare the settled busy colors.
    await delay(150);
    const styles = await evaluate(`(() => {
      const retry = getComputedStyle(document.querySelector(".status-strip .refresh-btn"));
      const header = getComputedStyle(document.querySelector(".masthead .refresh-btn"));
      return { retry: { color: retry.color, background: retry.backgroundColor },
        header: { color: header.color, background: header.backgroundColor } };
    })()`);
    assert.deepEqual(
      styles.retry,
      styles.header,
      "busy retry must share the header's visual state",
    );
    assert.ok(
      await evaluate(
        `document.activeElement === document.querySelector(${JSON.stringify(selector)})`,
      ),
    );
    await evaluate("audit.releaseStations()");
    await assertUpdateFeedback(false, failedUpdateMessage);
    assert.deepEqual(await evaluate("audit.updateMessages"), [
      "站點資料更新中",
      failedUpdateMessage,
    ]);
    assert.ok(
      await evaluate(
        'audit.savedError === document.querySelector(".status-strip.error") && audit.savedError.textContent === audit.savedErrorText',
      ),
    );
    assert.equal(
      await evaluate('document.querySelector(".status-strip.error").getAttribute("role")'),
      null,
      "visible errors must not duplicate the foreground live region announcement",
    );
  }
  await evaluate('document.querySelector(".masthead .refresh-btn").focus()');
  for (const trigger of [
    "audit.refresh()",
    'document.dispatchEvent(new Event("visibilitychange"))',
  ]) {
    const resultTop = await evaluate(
      'document.querySelector(".station-list").getBoundingClientRect().top',
    );
    await evaluate(`audit.updateMessages = []; delete audit.releaseStations; ${trigger}`);
    await waitFor("audit.releaseStations");
    await assertUpdateFeedback(true, "");
    assert.ok(
      await evaluate(
        'audit.savedError === document.querySelector(".status-strip.error") && audit.savedError.textContent === audit.savedErrorText',
      ),
    );
    assert.equal(
      await evaluate('document.querySelector(".station-list").getBoundingClientRect().top'),
      resultTop,
    );
    await evaluate("audit.releaseStations()");
    await assertUpdateFeedback(false, "");
    assert.deepEqual(
      await evaluate("audit.updateMessages.filter(Boolean)"),
      [],
      "background failures must not announce another outcome",
    );
    assert.equal(
      await evaluate('document.querySelector(".station-list").getBoundingClientRect().top'),
      resultTop,
    );
    assert.ok(
      await evaluate('document.activeElement === document.querySelector(".masthead .refresh-btn")'),
    );
  }
  assert.deepEqual(await evaluate("audit.errorMutations"), []);
  await evaluate(
    "audit.errorObserver.disconnect(); audit.statusObserver.disconnect(); audit.held = false",
  );
  await evaluate(
    'audit.fail = false; audit.available = 4; document.querySelector(".refresh-btn").click()',
  );
  await waitFor('document.querySelector(".summary-line").textContent.includes("40,000")');
  await assertUpdateFeedback(false);
  assert.equal(await evaluate('!!document.querySelector(".status-strip.error")'), false);
  assert.equal(
    await evaluate("audit.areaRequests"),
    1,
    "station refresh must not refetch area names",
  );
  // A new background outage announces stale data once, then stays quiet until recovery.
  const backgroundTriggers = [
    "audit.refresh()",
    'document.dispatchEvent(new Event("visibilitychange"))',
  ];
  const staleDataMessage = `${failedUpdateMessage}；目前顯示上次成功更新的資料。`;
  await evaluate(`(() => {
    const status = document.querySelector(".masthead [role=status]");
    audit.statusObserver = new MutationObserver(() => audit.updateMessages.push(status.textContent.trim()));
    audit.statusObserver.observe(status, { childList: true, characterData: true, subtree: true });
    audit.held = true;
  })()`);
  const backgroundRefresh = async (trigger, expectedMessage) => {
    await evaluate(`audit.updateMessages = []; delete audit.releaseStations; ${trigger}`);
    await waitFor("audit.releaseStations");
    await assertUpdateFeedback(true, "");
    await evaluate("audit.releaseStations()");
    await assertUpdateFeedback(false, expectedMessage);
  };
  for (const trigger of backgroundTriggers) {
    await evaluate("audit.fail = true");
    await backgroundRefresh(trigger, staleDataMessage);
    assert.deepEqual(
      await evaluate("audit.updateMessages.filter(Boolean)"),
      [staleDataMessage],
      "the first background failure must announce that cached data is being shown",
    );
    assert.equal(
      await evaluate('document.querySelectorAll(".station-list .station-card").length'),
      10,
    );
    await evaluate(`(() => {
      audit.savedError = document.querySelector(".status-strip.error");
      audit.savedErrorText = audit.savedError.textContent;
      audit.savedResultTop = document.querySelector(".station-list").getBoundingClientRect().top;
    })()`);
    for (const repeat of backgroundTriggers) {
      await backgroundRefresh(repeat, "");
      assert.deepEqual(
        await evaluate("audit.updateMessages.filter(Boolean)"),
        [],
        "subsequent background failures must not repeat the stale-data warning",
      );
      assert.ok(
        await evaluate(
          'audit.savedError === document.querySelector(".status-strip.error") && audit.savedError.textContent === audit.savedErrorText',
        ),
      );
      assert.equal(
        await evaluate('document.querySelector(".station-list").getBoundingClientRect().top'),
        await evaluate("audit.savedResultTop"),
      );
    }
    await evaluate("audit.fail = false");
    await backgroundRefresh(trigger, "");
    assert.deepEqual(await evaluate("audit.updateMessages.filter(Boolean)"), []);
    assert.equal(await evaluate('!!document.querySelector(".status-strip.error")'), false);
  }
  await evaluate("audit.statusObserver.disconnect(); audit.held = false");
  // No GPS preserves nationwide browsing; a failed first request can be retried.
  await cdp("Page.navigate", { url: `${targetUrl}?denied&failure&fallback` });
  await waitFor('document.querySelector(".status-strip.error")');
  await assertUpdateFeedback(false, failedUpdateMessage);
  assert.equal(await evaluate('document.querySelectorAll(".station-card").length'), 0);
  await evaluate(
    'audit.fail = false; audit.held = true; document.querySelector(".status-strip .refresh-btn").click()',
  );
  await waitFor("audit.releaseStations");
  await assertUpdateFeedback(true);
  assert.ok(await evaluate('!!document.querySelector(".status-strip.error")'));
  assert.equal(
    await evaluate(
      'document.querySelector(".status-strip .refresh-btn").getAttribute("aria-disabled")',
    ),
    "true",
  );
  await evaluate("audit.held = false; audit.releaseStations()");
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 40');
  await assertUpdateFeedback(false);
  assert.equal(await evaluate('document.querySelectorAll(".station-distance").length'), 0);
  assert.equal(await evaluate("audit.mapCreates"), 0);
  await evaluate('document.querySelector(".map-toggle").click()');
  await waitFor("audit.mapCreates === 1");
  // Resizing while hidden must still produce a correctly sized map on reveal.
  await evaluate('document.querySelector(".map-toggle").click()');
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate('document.querySelector(".map-toggle").click()');
  await waitFor('audit.map.getSize().x === document.querySelector(".map-canvas").clientWidth');
  assert.equal(await evaluate("audit.mapCreates"), 1);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
  for (const mode of [
    "worker-disabled",
    "worker-blocked",
    "worker-error",
    "worker-disabled&legacy-abort",
  ]) {
    await cdp("Page.navigate", { url: `${targetUrl}?${mode}` });
    await waitFor('document.querySelectorAll(".station-list .station-card").length === 10', mode);
    await evaluate("audit.releaseAreas()");
    await waitFor('document.querySelector(".chip-row").textContent.includes("測試縣市")');
    assert.ok(
      await evaluate(
        "performance.getEntriesByType('resource').some(r => r.name.includes('/chunks/parse-feed-'))",
      ),
      `${mode} must use validated fallback`,
    );
  }
  // Parser errors in the real worker must preserve data and allow another refresh.
  await cdp("Page.navigate", { url: targetUrl });
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 10');
  await evaluate('audit.invalid = true; document.querySelector(".refresh-btn").click()');
  await delay(150);
  assert.equal(
    await evaluate('document.querySelectorAll(".station-list .station-card").length'),
    10,
  );
  await evaluate(
    'audit.invalid = false; audit.available = 6; document.querySelector(".refresh-btn").click()',
  );
  await waitFor('document.querySelector(".summary-line").textContent.includes("60,000")');
  // Failed metadata retries on the next automatic refresh without delaying stations.
  await cdp("Page.navigate", { url: `${targetUrl}?area-retry` });
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 10');
  assert.equal(await evaluate("audit.areaRequests"), 1);
  await evaluate("audit.areaFail = false; audit.held = true; audit.refresh()");
  await waitFor("audit.areaRequests === 2");
  await assertUpdateFeedback(true, "");
  await evaluate("audit.held = false; audit.releaseStations()");
  await assertUpdateFeedback(false, "");
  assert.equal(await evaluate("!!audit.releaseAreas"), true, "area metadata remains independent");
  await evaluate('document.querySelector(".refresh-btn").click()');
  assert.equal(await evaluate("audit.areaRequests"), 2, "pending metadata must be deduplicated");
  await evaluate("audit.releaseAreas()");
  await waitFor('document.querySelector(".chip-row").textContent.includes("測試縣市")');
  await evaluate('audit.available = 9; document.querySelector(".refresh-btn").click()');
  await waitFor('document.querySelector(".summary-line").textContent.includes("90,000")');
  assert.equal(
    await evaluate("audit.areaRequests"),
    2,
    "successful metadata must stay cached in memory",
  );
  // Notification delivery uses fresh counts without fetching another chunk, even on older browsers.
  await cdp("Page.navigate", { url: `${targetUrl}?notification-check&legacy-abort` });
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 10');
  await evaluate(
    'audit.available = 8; document.querySelector("[aria-labelledby=alerts-title] .locate-btn[title]").click()',
  );
  await waitFor("audit.notifications.length === 2");
  assert.ok(await evaluate('audit.notifications.every(message => message.body.includes("8"))'));
  assert.ok(
    await evaluate(
      "audit.notifications.every(message => message.renotify && message.requireInteraction)",
    ),
    "trip alerts preserve re-alerting and persistent notification options",
  );
  await evaluate('audit.available = 9; document.querySelector(".saved-routes .route-btn").click()');
  await waitFor("audit.notifications.length === 3");
  assert.ok(
    await evaluate(
      'audit.notifications[2].title.startsWith("路線") && audit.notifications[2].body.includes("9")',
    ),
  );
  assert.equal(notificationChunkRequests, 0, "notification code must ship with the page");

  // The first automatic alert and both manual actions must work after losing connectivity.
  await cdp("Page.navigate", { url: `${targetUrl}?notification-check&legacy-abort&offline` });
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 10');
  await cdp("Network.enable");
  await cdp("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await evaluate(
    'audit.offline = true; document.querySelector("[aria-labelledby=alerts-title] [aria-pressed]").click()',
  );
  await waitFor("audit.watch");
  await evaluate("audit.watch({ coords: { latitude: 25.0478, longitude: 121.5319 } })");
  await waitFor("audit.notifications.length === 1");
  assert.ok(
    await evaluate(
      'audit.notifications[0].title.startsWith("已到達起點") && audit.notifications[0].body.includes("3")',
    ),
    "first offline arrival uses last known counts",
  );
  await evaluate(
    'document.querySelector("[aria-labelledby=alerts-title] .locate-btn[title]").click()',
  );
  await waitFor("audit.notifications.length === 3");
  await waitFor(
    'document.querySelector("[aria-labelledby=alerts-title]").textContent.includes("已送出 2 則")',
  );
  await evaluate('document.querySelector(".saved-routes .route-btn").click()');
  await waitFor("audit.notifications.length === 4");
  await waitFor('document.querySelector(".saved-routes").textContent.includes("已送出系統通知")');
  assert.ok(await evaluate('audit.notifications.every(message => message.body.includes("3"))'));
  assert.deepEqual(await evaluate("audit.rejections"), [], "no unhandled notification rejections");
  assert.equal(notificationChunkRequests, 0, "offline alerts need no deployment-sensitive chunk");
  await cdp("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  assert.deepEqual(errors, [], "browser runtime errors");
  console.log(
    "Loading audit passed: 10,000 stations, nonblocking areas, nearby pagination, lazy map, retained map/tiles/view/selection, refresh progress/button feedback, reduced motion, location, cancellation, failure recovery, online/offline notifications.",
  );
} catch (error) {
  console.error(
    "Loading audit diagnostics:",
    await evaluate(`({
    url: location.href, cards: document.querySelectorAll('.station-list .station-card').length,
    stationRequests: window.audit?.stationRequests, areaRequests: window.audit?.areaRequests,
    text: document.body.innerText.slice(0, 1200)
  })`),
    errors,
  );
  throw error;
} finally {
  close();
}
