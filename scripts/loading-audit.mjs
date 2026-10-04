import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { startBrowserAudit } from "./browser-audit.mjs";

const { cdp, evaluate, targetUrl, close, waitFor, errors, on } = await startBrowserAudit();
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
    if (location.search.includes("denied")) audit.denied = true;
    if (location.search.includes("failure")) audit.fail = true;
    if (location.search.includes("fallback")) delete window.IntersectionObserver;
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
        return new Promise((resolve) => {
          audit.releaseAreas = () => resolve(Response.json([
            { area_code: "00", area_name_tw: "測試縣市", sort: 1 }
          ]));
        });
      }
      if (String(url).includes("station-yb2.json")) {
        audit.stationRequests++;
        if (audit.held) await new Promise((resolve, reject) => {
          audit.releaseStations = resolve;
          options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
        });
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
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*tile.openstreetmap.org/*" }] });
  // The shared CDP helper exposes events through a listener below.
  on("Fetch.requestPaused", async ({ requestId }) => {
    tileRequests++;
    await cdp("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "image/png" }],
      body: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    });
  });
  await cdp("Page.navigate", { url: targetUrl });
  await waitFor(
    'document.querySelectorAll(".station-list .station-card").length === 10',
    "nearest ten cards before area response",
  );
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

  // A changed position while hidden is applied once, without replacing the map.
  await evaluate(
    'document.querySelector(".map-toggle").click(); audit.lat += 0.03; document.querySelector(".locate-btn").click()',
  );
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 10');
  await evaluate('document.querySelector(".map-toggle").click()');
  await waitFor("Math.abs(audit.map.getCenter().lat - audit.lat) < 0.00001");
  assert.equal(await evaluate("audit.mapCreates"), 1);

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
  await evaluate(
    'audit.held = true; audit.fail = true; document.querySelector(".refresh-btn").click(); document.querySelector(".refresh-btn").click()',
  );
  await waitFor(`audit.stationRequests === ${requests + 1}`);
  await evaluate("audit.releaseStations(); audit.held = false");
  await delay(100);
  assert.equal(
    await evaluate('document.querySelectorAll(".station-list .station-card").length'),
    10,
  );
  await evaluate(
    'audit.fail = false; audit.available = 4; document.querySelector(".refresh-btn").click()',
  );
  await waitFor('document.querySelector(".summary-line").textContent.includes("40,000")');
  assert.equal(
    await evaluate("audit.areaRequests"),
    1,
    "station refresh must not refetch area names",
  );
  // No GPS preserves nationwide browsing; a failed first request can be retried.
  await cdp("Page.navigate", { url: `${targetUrl}?denied&failure&fallback` });
  await waitFor('document.querySelector(".status-strip.error")');
  assert.equal(await evaluate('document.querySelectorAll(".station-card").length'), 0);
  await evaluate(
    'audit.fail = false; document.querySelector(".status-strip .refresh-btn").click()',
  );
  await waitFor('document.querySelectorAll(".station-list .station-card").length === 40');
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
  assert.deepEqual(errors, [], "browser runtime errors");
  console.log(
    "Loading audit passed: 10,000 stations, nonblocking areas, nearby pagination, lazy map, retained map/tiles/view/selection, refresh, location, cancellation, failure recovery.",
  );
} finally {
  close();
}
