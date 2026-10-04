import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function startBrowserAudit() {
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
      const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
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
    targetUrl = "http://127.0.0.1:4180/";
  }
  const profile = mkdtempSync(join(tmpdir(), "youbike-audit-"));
  const chrome = spawn(
    process.env.CHROME_BIN ?? "/usr/bin/google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let chromeOutput = "";
  let chromeFailure = "";
  let chromeExited = false;
  chrome.stderr.on("data", (chunk) => {
    chromeOutput = (chromeOutput + chunk.toString()).slice(-4096);
  });
  chrome.on("error", (error) => {
    chromeFailure = error.message;
  });
  chrome.once("exit", () => {
    chromeExited = true;
  });

  let socket;
  const close = () => {
    socket?.close();
    chrome.kill("SIGTERM");
    localServer?.close();
    chrome.once("exit", () => rmSync(profile, { recursive: true, force: true }));
  };
  try {
    let version;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (chromeFailure || chromeExited) break;
      try {
        version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
        break;
      } catch {
        await delay(100);
      }
    }
    assert.ok(
      version,
      `Chrome DevTools did not start: ${chromeFailure || chromeOutput.trim() || "no browser output"}`,
    );

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
    const errors = [];
    const listeners = new Map();
    const on = (method, handler) => listeners.set(method, handler);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown")
        errors.push(message.params.exceptionDetails);
      if (listeners.has(message.method)) {
        Promise.resolve(listeners.get(message.method)(message.params)).catch((error) =>
          errors.push(String(error)),
        );
      }
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
    const waitFor = async (expression, message = expression) => {
      for (let attempt = 0; attempt < 160; attempt += 1) {
        if (await evaluate(`Boolean(${expression})`)) return;
        await delay(50);
      }
      throw new Error(`Timed out: ${message}`);
    };
    return { cdp, evaluate, targetUrl, close, waitFor, errors, on };
  } catch (error) {
    close();
    throw error;
  }
}
