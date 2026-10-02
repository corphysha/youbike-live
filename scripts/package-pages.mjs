// Package vinext's static export (dist/client) for GitHub Pages project sites.
//
// vinext with basePath "youbike-live" emits:
//   dist/client/youbike-live.html        (prerendered page)
//   dist/client/youbike-live/_next/...   (hashed assets, /youbike-live/-prefixed URLs)
//
// GitHub Pages serves the artifact root at https://<user>.github.io/youbike-live/,
// so the artifact must be:
//   youbike-live/index.html
//   youbike-live/_next/...
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
mkdirSync(join(siteDir, "youbike-live"), { recursive: true });
cpSync(assetsDir, join(siteDir, "youbike-live"), { recursive: true });
copyFileSync(pageFile, join(siteDir, "youbike-live", "index.html"));

// .nojekyll: skip Jekyll so files starting with _ are served
// (we output to youbike-live/_next anyway; belt and suspenders)
const { writeFileSync } = await import("node:fs");
writeFileSync(join(siteDir, ".nojekyll"), "");

// sanity: every absolute URL referenced by the page must resolve inside the artifact
const html = readFileSync(join(siteDir, "youbike-live", "index.html"), "utf-8");
const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
const missing = refs.filter((r) => !existsSync(join(siteDir, r)));
if (missing.length > 0) {
  console.error(`[package-pages] ${missing.length} referenced assets missing:`, missing);
  process.exit(1);
}

console.log(`[package-pages] ok — ${refs.length} asset refs verified, artifact at dist/pages-site`);
