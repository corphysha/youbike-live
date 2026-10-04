import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { FeedError, fetchAreas, fetchStations } from "../src/lib/api";

const fetchMock = spyOn(globalThis, "fetch");
const station = {
  station_no: "1",
  name_tw: "測試站",
  area_code: "00",
  status: 1,
  lat: "25.0478",
  lng: "121.5319",
  available_spaces: 3,
  empty_spaces: 7,
};

afterEach(() => fetchMock.mockReset());
afterAll(() => fetchMock.mockRestore());

test("validates and converts stations, dropping invalid coordinates", async () => {
  fetchMock.mockResolvedValue(Response.json([station, { ...station, lat: "invalid" }]));
  const result = await fetchStations();
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ id: "1", lat: 25.0478, available: 3 });
  expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe("no-store");
});

test("reports network, HTTP, malformed JSON and invalid feed failures", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("offline"));
  await expect(fetchStations()).rejects.toBeInstanceOf(FeedError);
  fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  await expect(fetchStations()).rejects.toThrow("503");
  fetchMock.mockResolvedValueOnce(new Response("not JSON"));
  await expect(fetchStations()).rejects.toThrow("不是 JSON");
  fetchMock.mockResolvedValueOnce(Response.json([{ ...station, available_spaces: -1 }]));
  await expect(fetchStations()).rejects.toThrow("驗證失敗");
});

test("area metadata can use browser caching and fails independently", async () => {
  fetchMock.mockResolvedValueOnce(Response.json([{ area_code: "00", area_name_tw: "測試縣市" }]));
  expect(await fetchAreas()).toHaveLength(1);
  expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe("default");
  fetchMock.mockResolvedValueOnce(new Response("bad", { status: 503 }));
  expect(await fetchAreas()).toEqual([]);
  fetchMock.mockResolvedValueOnce(Response.json({ changed: "schema" }));
  expect(await fetchAreas()).toEqual([]);
  fetchMock.mockRejectedValueOnce(new TypeError("offline"));
  expect(await fetchAreas()).toEqual([]);
});

const pendingFetch = Object.assign(
  (_url: RequestInfo | URL, options?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
        once: true,
      });
    }),
  { preconnect: globalThis.fetch.preconnect },
);

test("forwards caller cancellation to a pending station request", async () => {
  fetchMock.mockImplementationOnce(pendingFetch);
  const controller = new AbortController();
  const pending = fetchStations(controller.signal);
  controller.abort();
  await expect(pending).rejects.toBeInstanceOf(FeedError);
  expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

// Scale only request deadlines so a 40 ms body represents a 40 s mobile download.
function shortDeadlines() {
  const schedule = globalThis.setTimeout.bind(globalThis);
  return spyOn(globalThis, "setTimeout").mockImplementation(((
    ...[callback, ms, ...args]: Parameters<typeof setTimeout>
  ) =>
    schedule(
      callback,
      ms === 90_000 ? 90 : ms === 20_000 ? 20 : ms,
      ...args,
    )) as typeof setTimeout);
}

test("bounds stalled requests and reports a timeout instead of invalid JSON", async () => {
  const timer = shortDeadlines();
  try {
    fetchMock.mockImplementationOnce(pendingFetch);
    await expect(fetchStations()).rejects.toThrow("載入逾時");
    expect(timer.mock.calls.some((call) => call[1] === 90_000)).toBe(true);
  } finally {
    timer.mockRestore();
  }
});

test("supports browsers without AbortSignal convenience methods", async () => {
  const properties = [
    [AbortSignal, "any"],
    [AbortSignal, "timeout"],
    [AbortSignal.prototype, "throwIfAborted"],
  ] as const;
  const saved = properties.map(([target, name]) => Object.getOwnPropertyDescriptor(target, name));
  try {
    for (const [target, name] of properties)
      Object.defineProperty(target, name, { configurable: true, value: undefined });
    fetchMock.mockResolvedValueOnce(Response.json([station]));
    expect(await fetchStations(new AbortController().signal)).toHaveLength(1);
    fetchMock.mockResolvedValueOnce(Response.json([{ area_code: "00", area_name_tw: "測試縣市" }]));
    expect(await fetchAreas(new AbortController().signal)).toHaveLength(1);
  } finally {
    properties.forEach(([target, name], i) => {
      const descriptor = saved[i];
      if (descriptor) Object.defineProperty(target, name, descriptor);
    });
  }
});

test("cancels an already-aborted request before fetching and cleans up listeners", async () => {
  const controller = new AbortController();
  const remove = spyOn(controller.signal, "removeEventListener");
  controller.abort();
  await expect(fetchStations(controller.signal)).rejects.toThrow("已取消");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});

test("allows a slow body past the former 20 second deadline and disposes its timer", async () => {
  const timer = shortDeadlines();
  const clear = spyOn(globalThis, "clearTimeout");
  const parent = new AbortController();
  const remove = spyOn(parent.signal, "removeEventListener");
  try {
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode(JSON.stringify([station])));
              controller.close();
            }, 40);
          },
        }),
      ),
    );
    expect(await fetchStations(parent.signal)).toHaveLength(1);
    expect(clear).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  } finally {
    timer.mockRestore();
    clear.mockRestore();
    remove.mockRestore();
  }
});

test("classifies a timeout during body download and permits retry", async () => {
  const timer = shortDeadlines();
  try {
    fetchMock.mockImplementationOnce(
      Object.assign(
        (_url: RequestInfo | URL, options?: RequestInit) =>
          Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  options?.signal?.addEventListener(
                    "abort",
                    () => controller.error(options.signal?.reason),
                    { once: true },
                  );
                },
              }),
            ),
          ),
        { preconnect: globalThis.fetch.preconnect },
      ),
    );
    await expect(fetchStations()).rejects.toThrow("載入逾時");
    fetchMock.mockResolvedValueOnce(Response.json([station]));
    expect(await fetchStations()).toHaveLength(1);
  } finally {
    timer.mockRestore();
  }
});

test("keeps cancellation and body transport errors distinct from malformed JSON", async () => {
  const bodyError = (error: Error) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(error);
        },
      }),
    );
  fetchMock.mockResolvedValueOnce(bodyError(new DOMException("cancelled", "AbortError")));
  await expect(fetchStations()).rejects.toThrow("已取消");
  fetchMock.mockResolvedValueOnce(bodyError(new TypeError("connection reset")));
  await expect(fetchStations()).rejects.toThrow("無法連線");
  fetchMock.mockResolvedValueOnce(new Response("not JSON"));
  await expect(fetchStations()).rejects.toThrow("不是 JSON");
});
