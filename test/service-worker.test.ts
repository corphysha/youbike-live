import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

const source = await Bun.file(new URL("../public/sw.js", import.meta.url)).text();

function harness(scope: string) {
  let handler: (event: unknown) => void;
  let requests = 0;
  let offline = false;
  const entries = new Map<string, Response>();
  const key = (request: string | { url: string }) =>
    typeof request === "string" ? request : request.url;
  runInNewContext(source, {
    URL,
    Response,
    self: {
      location: { origin: "https://example.com" },
      registration: { scope },
      addEventListener: (type: string, listener: typeof handler) => {
        if (type === "fetch") handler = listener;
      },
    },
    caches: {
      open: async () => ({
        match: async (request: Parameters<typeof key>[0]) => entries.get(key(request))?.clone(),
        put: async (request: Parameters<typeof key>[0], response: Response) =>
          entries.set(key(request), response),
      }),
    },
    fetch: async () => {
      requests++;
      if (offline) throw new Error("offline");
      return new Response(`network ${requests}`);
    },
  });
  return {
    request(url: string, mode = "cors") {
      let result: Promise<Response> | undefined;
      handler({
        request: { url, method: "GET", mode },
        respondWith: (response: Promise<Response>) => {
          result = response;
        },
      });
      return result;
    },
    requests: () => requests,
    setOffline: () => {
      offline = true;
    },
  };
}

const scopes = ["https://example.com/", "https://example.com/youbike-live/"];

test.each(scopes)("hashed assets are cache-first and build hashes update at %s", async (scope) => {
  const app = harness(scope);
  const asset = `${scope}_next/static/chunks/app-abc123.js`;
  expect(await (await app.request(asset))?.text()).toBe("network 1");
  expect(await (await app.request(asset))?.text()).toBe("network 1");
  expect(app.requests()).toBe(1);
  expect(await (await app.request(asset.replace("abc123", "def456")))?.text()).toBe("network 2");
});

test.each(scopes)(
  "HTML stays fresh/offline and external feeds bypass the cache at %s",
  async (scope) => {
    const app = harness(scope);
    const page = scope;
    expect(await (await app.request(page, "navigate"))?.text()).toBe("network 1");
    expect(await (await app.request(page, "navigate"))?.text()).toBe("network 2");
    app.setOffline();
    expect(await (await app.request(page, "navigate"))?.text()).toBe("network 2");
    expect(app.request("https://apis.youbike.com.tw/json/station-yb2.json")).toBeUndefined();
    expect(app.requests()).toBe(3);
  },
);
