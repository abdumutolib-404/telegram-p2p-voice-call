import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { parse } from "parse5";
import { findElement } from "./public-markdown.mjs";
const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const files = (await readdir(out)).filter((f) => f.endsWith(".html"));
assert.equal(files.length, 11, "Expected ten public pages and a 404");
const documents = new Map();
for (const file of files)
  documents.set(
    file === "index.html" ? "/" : `/${file.replace(".html", "")}`,
    await readFile(path.join(out, file), "utf8"),
  );
const titles = new Set();
const descriptions = new Set();
const canonicalUrls = new Set();
const reviewedDates = new Set();
for (const [route, html] of documents) {
  const document = parse(html);
  const attribute = (node, name) =>
    node?.attrs?.find((value) => value.name === name)?.value;
  const description = attribute(
    findElement(
      document,
      (node) =>
        node.tagName === "meta" && attribute(node, "name") === "description",
    ),
    "content",
  );
  assert(
    description && !descriptions.has(description),
    `Missing or duplicate description: ${route}`,
  );
  descriptions.add(description);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert(title && !titles.has(title), `Missing or duplicate title: ${route}`);
  titles.add(title);
  const meta = (key) =>
    attribute(
      findElement(
        document,
        (node) =>
          node.tagName === "meta" &&
          (attribute(node, "name") === key ||
            attribute(node, "property") === key),
      ),
      "content",
    );
  const decodedTitle = findElement(document, (node) => node.tagName === "title")
    ?.childNodes?.[0]?.value;
  for (const key of ["og:title", "twitter:title"])
    assert.equal(meta(key), decodedTitle, `Social title mismatch: ${route}`);
  for (const key of ["og:description", "twitter:description"])
    assert.equal(
      meta(key),
      description,
      `Social description mismatch: ${route}`,
    );
  assert.equal(
    meta("og:url"),
    `https://pairtalk.online${route}`,
    `Social canonical mismatch: ${route}`,
  );
  assert.equal(
    (html.match(/<h1(?:\s|>)/g) ?? []).length,
    1,
    `One meaningful heading required: ${route}`,
  );
  assert(
    html.includes(`rel="canonical" href="https://pairtalk.online${route}"`),
    `Canonical mismatch: ${route}`,
  );
  assert(
    html.includes('<main id="main">') && html.includes("Skip to content"),
    `Missing accessible landmarks: ${route}`,
  );
  assert(
    !html.includes("user-scalable=no") && !html.includes("maximum-scale=1"),
    "Zoom must be allowed",
  );
  assert(
    !html.includes("telegram-web-app.js"),
    "The public site must not block on Telegram SDK",
  );
  assert(
    !/sketchfab|<iframe|<canvas/i.test(html),
    "No model embeds or canvas on public pages",
  );
  assert(
    html.includes("pairtalk-theme") && html.includes("Switch to dark theme"),
    "Theme preference and keyboard-accessible control required",
  );
  assert(
    !html.includes("under 3 seconds") && !html.includes("aggregateRating"),
    "No unsupported claims or review markup",
  );
  if (route === "/404")
    assert(html.includes("noindex, follow"), "404 must be noindex");
  else {
    const json = html.match(
      /<script type="application\/ld\+json">(.*?)<\/script>/s,
    )?.[1];
    assert(json, `Missing structured data: ${route}`);
    const schema = JSON.parse(json);
    const page = schema["@graph"].find((node) =>
      ["WebPage", "FAQPage"].includes(node["@type"]),
    );
    assert.equal(page.url, `https://pairtalk.online${route}`);
    assert.equal(
      page.description,
      description,
      `Schema description mismatch: ${route}`,
    );
    canonicalUrls.add(page.url);
    reviewedDates.add(page.dateModified);
    assert(
      !schema["@graph"].some((node) => node.offers || node.aggregateRating),
      "Only verified public facts belong in schema",
    );
    const markdownPath = route === "/" ? "/index.md" : `${route}.md`;
    assert(
      html.includes(
        `rel="alternate" type="text/markdown" href="https://pairtalk.online${markdownPath}"`,
      ),
      `Missing Markdown discovery: ${route}`,
    );
    assert(
      html.includes('rel="describedby" type="text/plain" href="/llms.txt"'),
      `Missing AI document discovery: ${route}`,
    );
    const markdown = await readFile(
      path.join(out, markdownPath.slice(1)),
      "utf8",
    );
    assert(
      markdown.startsWith("# ") && markdown.includes(`Source: ${page.url}`),
      `Invalid Markdown export: ${route}`,
    );
    assert(
      !/<(?:script|svg|input|button|iframe)\b/.test(markdown),
      `UI markup leaked to Markdown: ${route}`,
    );
    if (route === "/pricing" || route === "/stats")
      assert(
        markdown.includes("dated build snapshot"),
        `Snapshot context missing: ${route}`,
      );
    if (route === "/faq") {
      for (const question of page.mainEntity) {
        assert(
          markdown.includes(question.name),
          "FAQ questions must match the public page",
        );
        assert(
          markdown.includes(question.acceptedAnswer.text),
          "FAQ answers must match the public page",
        );
      }
    }
  }
  for (const match of html.matchAll(/href="(\/(?!\/)[^"]*|#[^"]*)"/g)) {
    const [destination, fragment] = match[1].split("#");
    const targetRoute = destination || route;
    const target = documents.get(targetRoute);
    if (target) {
      if (fragment)
        assert(
          target.includes(`id="${fragment}"`),
          `Broken fragment ${match[1]} on ${route}`,
        );
    } else
      assert(
        (await stat(path.join(out, destination))).isFile(),
        `Missing linked asset: ${destination}`,
      );
  }
}
for (const file of ["robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt"])
  assert.deepEqual(
    await readFile(path.join(out, file)),
    await readFile(path.join(out, "../public", file)),
    `Builds must preserve the reviewed ${file} byte for byte`,
  );
const sitemap = await readFile(path.join(out, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
  (match) => match[1],
);
assert.equal(
  sitemapUrls.length,
  canonicalUrls.size,
  "Sitemap must list each public page once",
);
assert.deepEqual(
  new Set(sitemapUrls),
  canonicalUrls,
  "Sitemap must match the canonical HTML routes",
);
assert.deepEqual(
  new Set(
    [...sitemap.matchAll(/<lastmod>(.*?)<\/lastmod>/g)].map(
      (match) => match[1],
    ),
  ),
  reviewedDates,
  "Sitemap and page modification dates must match the content review, not the build date",
);
const robots = await readFile(path.join(out, "robots.txt"), "utf8");
assert(
  robots.includes("Sitemap: https://pairtalk.online/sitemap.xml"),
  "Robots must discover the sitemap",
);
for (const crawler of [
  "Googlebot",
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
]) {
  assert(
    robots.includes(`User-agent: ${crawler}`),
    `Existing crawler permission missing: ${crawler}`,
  );
}
for (const name of ["llms.txt", "llms-full.txt"]) {
  const content = await readFile(path.join(out, name), "utf8");
  assert(content.startsWith("# PairTalk"), `Invalid AI document: ${name}`);
  assert(
    !/sub-3|under 3 seconds|100% money-back|studio-grade|80\+ countries|\$1\.58|#pricing/i.test(
      content,
    ),
    `Outdated claim in ${name}`,
  );
  for (const match of content.matchAll(
    /https:\/\/pairtalk\.online([^\s)<>,]*)/g,
  )) {
    const destination = new URL(`https://pairtalk.online${match[1]}`).pathname;
    if (destination === "/" || documents.has(destination)) continue;
    assert(
      (await stat(path.join(out, destination))).isFile(),
      `Broken AI document link: ${match[0]}`,
    );
  }
}
const discovery = JSON.parse(
  await readFile(path.join(out, ".well-known/agents.json"), "utf8"),
);
assert.equal(
  discovery.reviewed_at,
  [...reviewedDates][0],
  "AI discovery review date mismatch",
);
assert(
  !/sub-3|100% money-back/i.test(JSON.stringify(discovery)),
  "Unverified claim in AI discovery",
);
for (const file of ["social-preview.png", "robots.txt", "llms.txt"])
  assert((await stat(path.join(out, file))).isFile());
const assets = await readdir(path.join(out, "assets"));
const main = assets.find((f) => /^index-.*\.js$/.test(f));
assert(
  main && !assets.some((file) => /sketchfab|voiceScene/i.test(file)),
  "No 3D viewer bundle should ship",
);
for (const file of assets.filter((file) => file.endsWith(".js")))
  assert(
    !/sketchfab\.com|sketchfab-viewer/.test(
      await readFile(path.join(out, "assets", file), "utf8"),
    ),
    "No third-party 3D runtime requests",
  );
const mainBytes = gzipSync(
  await readFile(path.join(out, "assets", main)),
).byteLength;
assert(
  mainBytes < 125000,
  `Initial compressed JavaScript too large: ${mainBytes}`,
);
console.log(
  `PASS: ${files.length} HTML pages, ${canonicalUrls.size} Markdown pages, metadata, schema, sitemap, AI document links, accessible theme control, and no 3D runtime. Initial JS: ${(mainBytes / 1024).toFixed(1)} KiB gzip.`,
);
