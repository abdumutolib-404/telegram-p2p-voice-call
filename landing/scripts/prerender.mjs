import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  render,
  routes,
  metadata,
  structuredData,
  isPublicStats,
  isPublicPricing,
  siteUrl,
  contentReviewed,
} from "../dist-ssr/entry-server.js";
import { publicMarkdown } from "./public-markdown.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
const template = await readFile(path.join(out, "index.html"), "utf8");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const safeJson = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
let snapshot = null;
// Opt in to build-time data; never fabricate a statistic or make offline builds depend on an API.
const endpoint = process.env.PUBLIC_STATS_BUILD_URL;
if (endpoint) {
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!isPublicStats(data))
      throw new Error("Invalid public statistics payload");
    snapshot = data;
  } catch (error) {
    console.warn(`Statistics snapshot omitted: ${error.message}`);
  }
}
let pricingSnapshot = null;
if (process.env.PUBLIC_PRICING_BUILD_URL) {
  try {
    const response = await fetch(process.env.PUBLIC_PRICING_BUILD_URL, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    if (!response.ok || !isPublicPricing(data))
      throw new Error("Invalid current pricing");
    pricingSnapshot = data;
  } catch (error) {
    console.warn(`Pricing snapshot omitted: ${error.message}`);
  }
}
for (const route of [...routes, "/404"]) {
  const meta = metadata(route);
  const canonical = `${siteUrl}${route}`;
  const markdownPath = route === "/" ? "/index.md" : `${route}.md`;
  let html = template
    .replace(/<title>.*?<\/title>/s, `<title>${escape(meta.title)}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/,
      `$1${escape(meta.description)}$2`,
    )
    .replace(
      /(<link rel="canonical" href=")[^"]*("\s*\/?>)/,
      `$1${canonical}$2`,
    )
    .replace(
      /(<meta property="og:url" content=")[^"]*("\s*\/?>)/,
      `$1${canonical}$2`,
    );
  for (const name of ["og:title", "twitter:title"])
    html = html.replace(
      new RegExp(
        `(<meta\\s+(?:property|name)="${name}"\\s+content=")[^"]*("\\s*\\/?>)`,
      ),
      `$1${escape(meta.title)}$2`,
    );
  for (const name of ["og:description", "twitter:description"])
    html = html.replace(
      new RegExp(
        `(<meta\\s+(?:property|name)="${name}"\\s+content=")[^"]*("\\s*\\/?>)`,
      ),
      `$1${escape(meta.description)}$2`,
    );
  html = html
    .replace(
      "<!--markdown-alternate-->",
      route === "/404"
        ? ""
        : `<link rel="alternate" type="text/markdown" href="${siteUrl}${markdownPath}" />`,
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${render(route, snapshot, pricingSnapshot)}</div>`,
    )
    .replace(
      "<!--route-schema-->",
      route === "/404"
        ? ""
        : `<script type="application/ld+json">${safeJson(structuredData(route))}</script>`,
    )
    .replace(
      "<!--stats-snapshot-->",
      snapshot
        ? `<script id="public-stats-snapshot" type="application/json">${safeJson(snapshot)}</script>`
        : "",
    );
  if (route === "/pricing" && pricingSnapshot)
    html = html.replace(
      "</body>",
      `<script id="public-pricing-snapshot" type="application/json">${safeJson(pricingSnapshot)}</script></body>`,
    );
  if (route === "/404")
    html = html.replace(
      "index, follow, max-image-preview:large",
      "noindex, follow",
    );
  await writeFile(
    path.join(out, route === "/" ? "index.html" : `${route.slice(1)}.html`),
    html,
  );
  if (route !== "/404")
    await writeFile(
      path.join(out, markdownPath.slice(1)),
      publicMarkdown(html, {
        title: meta.title,
        canonical,
        route,
        reviewed: contentReviewed,
      }),
    );
}
// Curated crawler documents live in public/; builds copy them without rewriting policies.
const ssr = path.resolve(root, "dist-ssr");
if (path.dirname(ssr) !== root || path.basename(ssr) !== "dist-ssr")
  throw new Error("Unexpected build cleanup path");
await rm(ssr, { recursive: true, force: true });
console.log(
  `Pre-rendered ${routes.length} public routes plus a noindex 404. ${snapshot ? "Includes a dated statistics snapshot." : "Statistics load from the public API when available."}`,
);
