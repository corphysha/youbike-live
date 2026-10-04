import { FeedError } from "./feed-error";
import type { FeedData } from "./parse-feed";
import { throwIfAborted } from "./request";

class WorkerUnavailable extends Error {}
let worker: Worker | null = null;
let unavailable = false;
let nextId = 0;
const pending = new Map<
  number,
  {
    resolve: (data: FeedData[keyof FeedData]) => void;
    reject: (error: Error) => void;
  }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./feed-parser.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (
    event: MessageEvent<{
      id: number;
      data: FeedData[keyof FeedData];
      error?: string;
    }>,
  ) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if (event.data.error) job.reject(new FeedError(event.data.error));
    else job.resolve(event.data.data);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    unavailable = true;
    worker?.terminate();
    worker = null;
    for (const job of pending.values()) job.reject(new WorkerUnavailable());
    pending.clear();
  };
  return worker;
}

/** Keep JSON parsing and schema validation off the UI thread when workers are supported. */
export async function parseFeedAsync<K extends keyof FeedData>(
  kind: K,
  source: string,
  signal?: AbortSignal,
): Promise<FeedData[K]> {
  throwIfAborted(signal);
  if (!unavailable && typeof window !== "undefined" && typeof Worker !== "undefined") {
    let parser: Worker | null = null;
    try {
      parser = getWorker();
    } catch {
      unavailable = true;
    }
    if (parser) {
      const id = ++nextId;
      let onAbort: () => void = () => {};
      try {
        return await new Promise<FeedData[K]>((resolve, reject) => {
          onAbort = () => {
            pending.delete(id);
            reject(signal?.reason ?? new DOMException("Request cancelled", "AbortError"));
          };
          pending.set(id, { resolve: (data) => resolve(data as FeedData[K]), reject });
          signal?.addEventListener("abort", onAbort, { once: true });
          parser.postMessage({ id, kind, source });
        });
      } catch (error) {
        if (!(error instanceof WorkerUnavailable)) throw error;
      } finally {
        pending.delete(id);
        signal?.removeEventListener("abort", onAbort);
      }
    }
  }
  // Unsupported or blocked workers retain the same validation and error behavior.
  const { parseFeed } = await import("./parse-feed");
  throwIfAborted(signal);
  return parseFeed(kind, source);
}
