import { expect, test } from "bun:test";
import { bikeCounts, bikeSummary } from "../src/lib/format";

test("bike counts split the rentable total into regular and electric bikes", () => {
  expect(bikeCounts({ available: 5, detail: { eyb: 2 } })).toEqual({ regular: 3, electric: 2 });
  expect(bikeSummary({ available: 5, detail: { eyb: 2 } })).toBe("可借 5 輛（一般車 3、電輔車 2）");
});

test("bike counts always add up to the total when the detail is missing or inconsistent", () => {
  expect(bikeCounts({ available: 4, detail: { eyb: 0 } })).toEqual({ regular: 4, electric: 0 });
  expect(bikeCounts({ available: 1, detail: { eyb: 3 } })).toEqual({ regular: 0, electric: 1 });
  expect(bikeCounts({ available: 0, detail: { eyb: 0 } })).toEqual({ regular: 0, electric: 0 });
});
