import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

let targetUrl = process.env.TARGET_URL;
let localServer;
const port = Number(process.env.CDP_PORT ?? 9333);
if (!targetUrl) {
  const outputRoot = resolve(process.cwd(), "dist/pages-site");
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  localServer = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const prefix = "/youbike-live/";
    const relativePath =
      pathname === "/youbike-live" || pathname === prefix
        ? "index.html"
        : pathname.startsWith(prefix)
          ? pathname.slice(prefix.length)
          : null;
    if (relativePath === null) {
      response.writeHead(404).end("Not found");
      return;
    }
    const filePath = resolve(outputRoot, relativePath);
    if (
      !filePath.startsWith(`${outputRoot}/`) ||
      !existsSync(filePath) ||
      !statSync(filePath).isFile()
    ) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.setHeader(
      "Content-Type",
      contentTypes[extname(filePath)] ?? "application/octet-stream",
    );
    createReadStream(filePath).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => {
    localServer.once("error", rejectListen);
    localServer.listen(4180, "127.0.0.1", resolveListen);
  });
  targetUrl = "http://127.0.0.1:4180/youbike-live/";
}
const profile = `/home/openclaw/.hermes/cache/scratch/youbike-audit-${process.pid}`;
const chrome = spawn(
  process.env.CHROME_BIN ?? "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let socket;
try {
  let version;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(version, "Chrome DevTools did not start");

  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: "PUT",
  }).then((r) => r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await cdp("Browser.grantPermissions", {
    origin: new URL(targetUrl).origin,
    permissions: ["geolocation"],
  });
  await cdp("Emulation.setGeolocationOverride", {
    latitude: 25.0478,
    longitude: 121.5319,
    accuracy: 20,
  });
  await cdp("Page.navigate", { url: targetUrl });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate('document.querySelector(".station-card") !== null')) break;
    await delay(250);
  }

  const viewportResults = [];
  for (const width of [320, 360, 390, 430, 768, 1024]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await delay(120);
    viewportResults.push(
      await evaluate(`(() => {
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
      };
      const header = document.querySelector(".masthead-inner");
      const card = document.querySelector(".station-card");
      const map = document.querySelector(".map-canvas");
      const locateButton = document.querySelector(".locate-btn");
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        header: rect(header),
        headerChildren: [...header.children].filter((el) => !el.classList.contains("header-spacer")).map((el) => ({ name: el.className, ...rect(el) })),
        card: card ? {
          box: rect(card),
          name: rect(card.querySelector(".station-name")),
          address: rect(card.querySelector(".station-name-en")),
          numbers: rect(card.querySelector(".station-nums")),
          favorite: rect(card.querySelector(".fav-btn")),
        } : null,
        themeToggle: rect(document.querySelector(".theme-toggle")),
        refreshButton: rect(document.querySelector(".refresh-btn")),
        firstChip: rect(document.querySelector(".chip")),
        map: map ? rect(map) : null,
        locateButton: locateButton ? rect(locateButton) : null,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        background: getComputedStyle(document.body).backgroundColor,
      };
    })()`),
    );
  }

  if (process.env.SCREENSHOT_PATH) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(120);
    const screenshot = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(resolve(process.env.SCREENSHOT_PATH), Buffer.from(screenshot.data, "base64"));
  }

  console.log(JSON.stringify({ viewports: viewportResults }, null, 2));
  for (const result of viewportResults) {
    assert.ok(
      result.documentWidth <= result.width,
      `horizontal document overflow at ${result.width}px: ${result.documentWidth}px`,
    );
    assert.ok(
      result.headerChildren.every((item) => item.left >= 0 && item.right <= result.width),
      `header content clipped at ${result.width}px: ${JSON.stringify(result.headerChildren)}`,
    );
    assert.ok(
      result.map && result.map.width > 0 && result.map.height >= 300,
      `map is missing or too short at ${result.width}px: ${JSON.stringify(result.map)}`,
    );
    assert.ok(
      result.locateButton &&
        result.locateButton.left >= 0 &&
        result.locateButton.right <= result.width,
      `location button clipped at ${result.width}px: ${JSON.stringify(result.locateButton)}`,
    );
    if (result.width <= 430 && result.card) {
      assert.ok(
        result.card.name.right <= result.card.box.right &&
          result.card.address.right <= result.card.box.right,
        `station text escapes its card at ${result.width}px`,
      );
      assert.equal(
        result.card.address.left,
        result.card.name.left,
        `station address was pushed into the metrics column at ${result.width}px`,
      );
      assert.ok(
        result.card.favorite.width >= 44 && result.card.favorite.height >= 44,
        `favorite target too small at ${result.width}px: ${JSON.stringify(result.card.favorite)}`,
      );
      assert.ok(
        result.firstChip.height >= 44,
        `filter chip target too small at ${result.width}px: ${JSON.stringify(result.firstChip)}`,
      );
      assert.ok(
        result.themeToggle.width >= 44 && result.themeToggle.height >= 44,
        `theme toggle target too small at ${result.width}px: ${JSON.stringify(result.themeToggle)}`,
      );
      assert.ok(
        result.refreshButton.height >= 44,
        `refresh target too small at ${result.width}px: ${JSON.stringify(result.refreshButton)}`,
      );
      assert.ok(
        result.locateButton.width >= 44 && result.locateButton.height >= 44,
        `location target too small at ${result.width}px: ${JSON.stringify(result.locateButton)}`,
      );
    }
    assert.ok(result.themeToggle.width > 0, "theme toggle is missing");
  }

  const initial = await evaluate(
    "({ scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.dataset.theme ?? null })",
  );
  assert.equal(
    initial.scheme,
    "dark",
    `device dark mode was not applied: ${JSON.stringify(initial)}`,
  );
  assert.notEqual(initial.bg, "rgb(247, 246, 242)", "dark mode kept the light page background");
  await cdp("Runtime.evaluate", { expression: 'document.querySelector(".theme-toggle").click()' });
  await delay(100);
  const light = await evaluate(
    '({ scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.dataset.theme ?? null, saved: localStorage.getItem("youbike-theme") })',
  );
  assert.equal(
    light.scheme,
    "light",
    `theme toggle did not switch to light: ${JSON.stringify(light)}`,
  );
  assert.equal(light.saved, "light", "light preference was not saved");

  await cdp("Page.reload");
  await delay(1200);
  const restoredLight = await evaluate(
    "({ scheme: getComputedStyle(document.documentElement).colorScheme, theme: document.documentElement.dataset.theme ?? null })",
  );
  assert.equal(
    restoredLight.scheme,
    "light",
    `saved light preference did not survive reload: ${JSON.stringify(restoredLight)}`,
  );

  await cdp("Runtime.evaluate", { expression: 'document.querySelector(".theme-toggle").click()' });
  await delay(100);
  const dark = await evaluate(
    '({ scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.dataset.theme ?? null, saved: localStorage.getItem("youbike-theme") })',
  );
  assert.equal(dark.scheme, "dark", `theme toggle did not switch to dark: ${JSON.stringify(dark)}`);
  assert.equal(dark.saved, "dark", "dark preference was not saved");

  await cdp("Runtime.evaluate", { expression: 'document.querySelector(".theme-toggle").click()' });
  await delay(100);
  const system = await evaluate(
    '({ theme: document.documentElement.dataset.theme ?? null, saved: localStorage.getItem("youbike-theme") })',
  );
  assert.equal(system.theme, null, "theme toggle did not return to device-follow mode");
  assert.equal(system.saved, null, "system mode did not clear the manual preference");

  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });
  await delay(100);
  assert.equal(
    await evaluate("getComputedStyle(document.documentElement).colorScheme"),
    "light",
    "system light mode was not followed",
  );

  await cdp("Runtime.evaluate", { expression: 'document.querySelector(".theme-toggle").click()' });
  await delay(100);
  assert.equal(
    await evaluate("document.documentElement.dataset.theme ?? null"),
    "dark",
    "a light device could not explicitly enable dark mode",
  );
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await delay(100);
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });
  await delay(100);
  assert.equal(
    await evaluate("getComputedStyle(document.documentElement).colorScheme"),
    "dark",
    "manual dark mode should override later device changes",
  );
  await cdp("Runtime.evaluate", { expression: 'document.querySelector(".theme-toggle").click()' });
  await delay(100);
  assert.equal(
    await evaluate("getComputedStyle(document.documentElement).colorScheme"),
    "light",
    "returning to system mode should use the current light device preference",
  );

  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await delay(100);
  assert.equal(
    await evaluate("getComputedStyle(document.documentElement).colorScheme"),
    "dark",
    "system dark mode was not followed",
  );
  let locationResult;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    locationResult = await evaluate(`(() => ({
      message: document.querySelector(".location-message")?.textContent ?? "",
      distances: [...document.querySelectorAll(".station-distance")].slice(0, 8).map((item) => Number(item.dataset.distanceMeters)),
      userMarker: document.querySelector(".user-location-dot") !== null
    }))()`);
    if (locationResult.userMarker && locationResult.distances.length >= 2) break;
    await delay(200);
  }
  assert.ok(locationResult.message.includes("本站不會接收"), "location request did not succeed");
  assert.ok(locationResult.userMarker, "user location marker is missing from the map");
  assert.ok(
    locationResult.distances.length >= 2 &&
      locationResult.distances.every(
        (distance, index, distances) => index === 0 || distances[index - 1] <= distance,
      ),
    `station list is not sorted by distance: ${JSON.stringify(locationResult.distances)}`,
  );

  let markerTitle = await evaluate(
    'document.querySelector(".station-pin-icon[title]")?.getAttribute("title") ?? null',
  );
  for (let attempt = 0; attempt < 100 && !markerTitle; attempt += 1) {
    await delay(100);
    markerTitle = await evaluate(
      'document.querySelector(".station-pin-icon[title]")?.getAttribute("title") ?? null',
    );
    if (await evaluate('document.querySelectorAll(".station-cluster-icon").length > 0')) break;
  }
  for (let attempt = 0; attempt < 6 && !markerTitle; attempt += 1) {
    await cdp("Runtime.evaluate", {
      expression: 'document.querySelector(".leaflet-control-zoom-in")?.click()',
    });
    await delay(250);
    markerTitle = await evaluate(
      'document.querySelector(".station-pin-icon[title]")?.getAttribute("title") ?? null',
    );
  }
  if (!markerTitle) {
    console.log(
      "Map marker inventory:",
      JSON.stringify(
        await evaluate(`(() => ({
          markerIcons: document.querySelectorAll(".leaflet-marker-icon").length,
          stationPins: document.querySelectorAll(".station-pin-icon").length,
          stationClusters: document.querySelectorAll(".station-cluster-icon").length,
          mapLoading: document.querySelector(".map-loading")?.textContent ?? null,
          zoomInTitle: document.querySelector(".leaflet-control-zoom-in")?.title ?? null,
          userMarker: document.querySelector(".user-location-dot") !== null
        }))()`),
      ),
    );
  }
  assert.ok(markerTitle, "no station marker became selectable after zooming in");
  await cdp("Runtime.evaluate", {
    expression: 'document.querySelector(".station-pin-icon[title]")?.click()',
  });
  await delay(100);
  const selected = await evaluate(`({
    name: document.querySelector(".selected-station h3")?.textContent ?? "",
    markerTitle: document.querySelector(".station-pin.is-selected")?.parentElement?.getAttribute("title") ?? ""
  })`);
  assert.ok(
    selected.name && selected.markerTitle.startsWith(selected.name),
    "map marker did not populate selected station details",
  );
  console.log("Responsive and theme audit passed.");
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  localServer?.close();
}
