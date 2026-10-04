/** AbortSignal's newer convenience methods are not available on older Safari. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Request cancelled", "AbortError");
  }
}

/** Own the timeout/listener so both can be released after the body and parser finish. */
export function createRequest(timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);
  const abort = () => {
    clearTimeout(timer);
    controller.abort(parent?.reason ?? new DOMException("Request cancelled", "AbortError"));
  };
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}
