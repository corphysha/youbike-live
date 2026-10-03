export type LocationPermissionState = "granted" | "prompt" | "denied" | "unknown";

export async function readLocationPermission(
  readPermission: (() => Promise<PermissionState>) | undefined,
): Promise<LocationPermissionState> {
  if (!readPermission) return "unknown";

  try {
    const state = await readPermission();
    return state === "granted" || state === "prompt" || state === "denied" ? state : "unknown";
  } catch {
    return "unknown";
  }
}

export function shouldRequestLocationAutomatically(
  permissionState: LocationPermissionState,
): boolean {
  return permissionState !== "denied";
}
