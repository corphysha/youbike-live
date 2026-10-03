import { describe, expect, test } from "bun:test";
import { formatDistance, getDistanceMeters } from "../src/lib/distance";

describe("getDistanceMeters", () => {
  test("returns zero for the same location", () => {
    expect(getDistanceMeters({ lat: 25, lng: 121 }, { lat: 25, lng: 121 })).toBe(0);
  });

  test("returns a realistic short distance between Taipei landmarks", () => {
    const distance = getDistanceMeters(
      { lat: 25.0478, lng: 121.5319 },
      { lat: 25.03396, lng: 121.564472 },
    );
    expect(distance).toBeGreaterThan(3000);
    expect(distance).toBeLessThan(4000);
  });

  test("returns infinity for invalid coordinates", () => {
    expect(getDistanceMeters({ lat: Number.NaN, lng: 121 }, { lat: 25, lng: 121 })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

test("formats distances for nearby and farther stations", () => {
  expect(formatDistance(340)).toBe("340 公尺");
  expect(formatDistance(1250)).toBe("1.3 公里");
  expect(formatDistance(Number.POSITIVE_INFINITY)).toBe("距離未知");
});
