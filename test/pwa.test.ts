import { expect, test } from "bun:test";

const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);

test("PWA manifest targets the GitHub Pages project scope", async () => {
  const manifest = await Bun.file(manifestUrl).json();

  expect(manifest.name).toBe("YouBike 即時查詢");
  expect(manifest.start_url).toBe("/youbike-live/");
  expect(manifest.scope).toBe("/youbike-live/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#f7f6f2");
});

test("manifest includes installable raster icons for common PWA sizes", async () => {
  const manifest = await Bun.file(manifestUrl).json();
  const icons = manifest.icons as Array<{ src: string; sizes: string; type: string }>;

  for (const size of ["192x192", "512x512"]) {
    const icon = icons.find((entry) => entry.sizes === size && entry.type === "image/png");
    expect(icon).toBeDefined();
    if (icon) {
      const iconUrl = new URL(
        `../public/${icon.src.replace("/youbike-live/", "")}`,
        import.meta.url,
      );
      expect(await Bun.file(iconUrl).exists()).toBe(true);
    }
  }
});

test("service worker provides an offline navigation fallback and preserves network-first freshness", async () => {
  const source = await Bun.file(new URL("../public/sw.js", import.meta.url)).text();

  expect(source).toContain('addEventListener("install"');
  expect(source).toContain('addEventListener("fetch"');
  expect(source).toContain('request.mode === "navigate"');
  expect(source).toContain("offline.html");
  expect(source).toContain("fetch(request)");
});
