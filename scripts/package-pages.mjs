// Package vinext's static export (dist/client) for GitHub Pages served from the custom domain root.
//
// Without a basePath, vinext emits:
//   dist/client/index.html      (prerendered page)
//   dist/client/_next/...       (hashed assets, root-relative URLs)
//
// GitHub Pages maps the artifact root to https://uu.xcc.tw/,
// so the artifact must contain index.html and _next/ at its root.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const clientDir = join(import.meta.dir, "..", "dist", "client");
const siteDir = join(import.meta.dir, "..", "dist", "pages-site");
const publicDir = join(import.meta.dir, "..", "public");

if (!existsSync(join(clientDir, "index.html")) || !existsSync(join(clientDir, "_next"))) {
  console.error("[package-pages] missing vinext export output — run `vinext build` first");
  process.exit(1);
}

rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });
// Skip vite build metadata (.vite/) — not needed on the site.
cpSync(clientDir, siteDir, {
  recursive: true,
  filter: (src) => !src.startsWith(join(clientDir, ".vite")),
});
if (existsSync(publicDir)) cpSync(publicDir, siteDir, { recursive: true });

// .nojekyll: skip Jekyll so files starting with _ are served.
writeFileSync(join(siteDir, ".nojekyll"), "");

// Verify root-relative URLs resolve inside the artifact.
const html = readFileSync(join(siteDir, "index.html"), "utf-8");
const refs = [...html.matchAll(/(?:src|href)="(\/[^/"][^"]*)"/g)].map((m) => m[1]);
const missing = refs.filter((ref) => {
  const pathname = new URL(ref, "https://pages.invalid").pathname;
  const relativePath = pathname.replace(/^\/+/, "") || "index.html";
  return !existsSync(join(siteDir, relativePath));
});
if (missing.length > 0) {
  console.error(`[package-pages] ${missing.length} referenced assets missing:`, missing);
  process.exit(1);
}

console.log(
  `[package-pages] ok — ${refs.length} asset refs verified, root-level artifact at dist/pages-site`,
);
