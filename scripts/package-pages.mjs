// Package vinext's static export (dist/client) for GitHub Pages project sites.
//
// vinext with basePath "youbike-live" emits:
//   dist/client/youbike-live.html        (prerendered page)
//   dist/client/youbike-live/_next/...   (hashed assets, /youbike-live/-prefixed URLs)
//
// GitHub Pages maps the artifact root to https://<user>.github.io/youbike-live/,
// so the artifact must contain index.html and _next/ at its root.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const clientDir = join(import.meta.dir, "..", "dist", "client");
const siteDir = join(import.meta.dir, "..", "dist", "pages-site");

const pageFile = join(clientDir, "youbike-live.html");
const assetsDir = join(clientDir, "youbike-live");

if (!existsSync(pageFile) || !existsSync(assetsDir)) {
  console.error("[package-pages] missing vinext export output — run `vinext build` first");
  process.exit(1);
}

rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });
cpSync(assetsDir, siteDir, { recursive: true });
copyFileSync(pageFile, join(siteDir, "index.html"));

// .nojekyll: skip Jekyll so files starting with _ are served.
const { writeFileSync } = await import("node:fs");
writeFileSync(join(siteDir, ".nojekyll"), "");

// Verify basePath-prefixed absolute URLs resolve inside the artifact.
const basePath = "/youbike-live";
const html = readFileSync(join(siteDir, "index.html"), "utf-8");
const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
const missing = refs.filter((ref) => {
  const pathname = new URL(ref, "https://pages.invalid").pathname;
  if (pathname !== `${basePath}/` && !pathname.startsWith(`${basePath}/`)) return false;
  const relativePath = pathname.slice(basePath.length).replace(/^\/+/, "") || "index.html";
  return !existsSync(join(siteDir, relativePath));
});
if (missing.length > 0) {
  console.error(`[package-pages] ${missing.length} referenced assets missing:`, missing);
  process.exit(1);
}

console.log(
  `[package-pages] ok — ${refs.length} asset refs verified, root-level artifact at dist/pages-site`,
);
