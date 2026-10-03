import { expect, test } from "bun:test";

const navigation = await import("../src/lib/navigation").catch(() => null);

const station = {
  lat: 25.03396,
  lng: 121.564472,
  name: "台北車站",
};

test("builds Apple Maps walking directions and Google Maps fallback", () => {
  expect(navigation).not.toBeNull();
  if (!navigation) return;

  expect(navigation.buildStationNavigationTargets(station, "ios")).toEqual({
    nativeUrl: "maps://?daddr=25.03396,121.564472&dirflg=w",
    googleMapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=25.03396%2C121.564472&travelmode=walking",
  });
});

test("builds Android navigation intent and Google Maps fallback", () => {
  expect(navigation).not.toBeNull();
  if (!navigation) return;

  expect(navigation.buildStationNavigationTargets(station, "android")).toEqual({
    nativeUrl: "geo:0,0?q=25.03396%2C121.564472%20(%E5%8F%B0%E5%8C%97%E8%BB%8A%E7%AB%99)",
    googleMapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=25.03396%2C121.564472&travelmode=walking",
  });
});

test("uses Google Maps directly on platforms without a known native URL scheme", () => {
  expect(navigation).not.toBeNull();
  if (!navigation) return;

  expect(navigation.buildStationNavigationTargets(station, "other")).toEqual({
    nativeUrl: null,
    googleMapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=25.03396%2C121.564472&travelmode=walking",
  });
});

test("detects iOS, Android, and iPadOS desktop user-agent strings", () => {
  expect(navigation).not.toBeNull();
  if (!navigation) return;

  expect(
    navigation.detectNavigationPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"),
  ).toBe("ios");
  expect(navigation.detectNavigationPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe(
    "android",
  );
  expect(
    navigation.detectNavigationPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5),
  ).toBe("ios");
  expect(navigation.detectNavigationPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("other");
});

test("falls back to Google Maps when the native app does not take over", () => {
  expect(navigation).not.toBeNull();
  if (!navigation) return;

  const targets = navigation.buildStationNavigationTargets(station, "ios");
  const nativeUrl = targets.nativeUrl;
  if (!nativeUrl) throw new Error("Expected an Apple Maps URL");
  const visited: string[] = [];
  let timer: (() => void) | undefined;
  let unsubscribed = false;
  const runtime = {
    navigate: (url: string) => visited.push(url),
    isHidden: () => false,
    subscribeToDeparture: () => () => {
      unsubscribed = true;
    },
    schedule: (callback: () => void, delayMs: number) => {
      expect(delayMs).toBe(1200);
      timer = callback;
    },
  };

  navigation.launchStationNavigation(targets, runtime);
  expect(visited).toEqual([nativeUrl]);
  timer?.();
  expect(visited).toEqual([nativeUrl, targets.googleMapsUrl]);
  expect(unsubscribed).toBe(true);
});

test("does not open the Google Maps fallback after the native app takes over", () => {
  expect(navigation).not.toBeNull();
  if (!navigation) return;

  const targets = navigation.buildStationNavigationTargets(station, "android");
  const nativeUrl = targets.nativeUrl;
  if (!nativeUrl) throw new Error("Expected an Android navigation URL");
  const visited: string[] = [];
  let timer: (() => void) | undefined;
  let departureListener: (() => void) | undefined;
  const runtime = {
    navigate: (url: string) => visited.push(url),
    isHidden: () => true,
    subscribeToDeparture: (callback: () => void) => {
      departureListener = callback;
      return () => {
        departureListener = undefined;
      };
    },
    schedule: (callback: () => void) => {
      timer = callback;
    },
  };

  navigation.launchStationNavigation(targets, runtime);
  departureListener?.();
  timer?.();
  expect(visited).toEqual([nativeUrl]);
});
