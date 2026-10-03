export type NavigationPlatform = "ios" | "android" | "other";

export interface StationDestination {
  lat: number;
  lng: number;
  name: string;
}

export interface StationNavigationTargets {
  nativeUrl: string | null;
  googleMapsUrl: string;
}

export interface NavigationRuntime {
  navigate: (url: string) => void;
  isHidden: () => boolean;
  subscribeToDeparture: (onDeparture: () => void) => () => void;
  schedule: (callback: () => void, delayMs: number) => unknown;
}

const NATIVE_FALLBACK_DELAY_MS = 1200;

export function detectNavigationPlatform(
  userAgent: string,
  maxTouchPoints = 0,
): NavigationPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
    return "ios";
  }

  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

export function buildStationNavigationTargets(
  station: StationDestination,
  platform: NavigationPlatform,
): StationNavigationTargets {
  const coordinates = `${station.lat},${station.lng}`;
  const googleParams = new URLSearchParams({
    api: "1",
    destination: coordinates,
    travelmode: "walking",
  });
  const googleMapsUrl = `https://www.google.com/maps/dir/?${googleParams.toString()}`;

  const nativeUrl =
    platform === "ios"
      ? `maps://?daddr=${coordinates}&dirflg=w`
      : platform === "android"
        ? `geo:0,0?q=${encodeURIComponent(`${coordinates} (${station.name})`)}`
        : null;

  return { nativeUrl, googleMapsUrl };
}

export function launchStationNavigation(
  targets: StationNavigationTargets,
  runtime: NavigationRuntime,
): void {
  if (!targets.nativeUrl) {
    runtime.navigate(targets.googleMapsUrl);
    return;
  }

  let nativeAppTookOver = false;
  const unsubscribe = runtime.subscribeToDeparture(() => {
    nativeAppTookOver = true;
  });

  runtime.navigate(targets.nativeUrl);
  runtime.schedule(() => {
    unsubscribe();
    if (!nativeAppTookOver && !runtime.isHidden()) {
      runtime.navigate(targets.googleMapsUrl);
    }
  }, NATIVE_FALLBACK_DELAY_MS);
}

export function createBrowserNavigationRuntime(): NavigationRuntime {
  return {
    navigate: (url) => window.location.assign(url),
    isHidden: () => document.visibilityState === "hidden",
    subscribeToDeparture: (onDeparture) => {
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") onDeparture();
      };
      const onPageHide = () => onDeparture();

      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pagehide", onPageHide);
      return () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pagehide", onPageHide);
      };
    },
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  };
}

export function navigateToStation(station: StationDestination): void {
  const platform = detectNavigationPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const targets = buildStationNavigationTargets(station, platform);
  launchStationNavigation(targets, createBrowserNavigationRuntime());
}
