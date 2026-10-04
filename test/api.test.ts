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

test("bounds stalled requests with a timeout so refresh can recover", async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const timeoutMock = spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(10));
  try {
    fetchMock.mockImplementationOnce(pendingFetch);
    await expect(fetchStations()).rejects.toBeInstanceOf(FeedError);
    expect(timeoutMock).toHaveBeenCalledWith(20_000);
  } finally {
    timeoutMock.mockRestore();
  }
});
