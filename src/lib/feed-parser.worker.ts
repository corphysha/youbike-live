import { type FeedData, parseFeed } from "./parse-feed";

self.onmessage = (event: MessageEvent<{ id: number; kind: keyof FeedData; source: string }>) => {
  const { id, kind, source } = event.data;
  try {
    self.postMessage({ id, data: parseFeed(kind, source) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "資料處理失敗" });
  }
};
