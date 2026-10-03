import { expect, test } from "bun:test";
import { readLocationPermission, shouldRequestLocationAutomatically } from "../src/lib/location";

test("automatically requests location when permission is already granted", () => {
  expect(shouldRequestLocationAutomatically("granted")).toBe(true);
});

test("automatically requests location when permission has not been decided yet", () => {
  expect(shouldRequestLocationAutomatically("prompt")).toBe(true);
});

test("does not repeatedly trigger a request after location permission is denied", () => {
  expect(shouldRequestLocationAutomatically("denied")).toBe(false);
});

test("falls back to automatic request when the Permissions API is unavailable", async () => {
  await expect(readLocationPermission(undefined)).resolves.toBe("unknown");
  expect(shouldRequestLocationAutomatically("unknown")).toBe(true);
});

test("treats a failed permission lookup as unknown rather than blocking location", async () => {
  const readPermission = async (): Promise<PermissionState> => {
    throw new Error("Permissions API unavailable");
  };

  const permission = await readLocationPermission(readPermission);

  expect(permission).toBe("unknown");
  expect(shouldRequestLocationAutomatically(permission)).toBe(true);
});
