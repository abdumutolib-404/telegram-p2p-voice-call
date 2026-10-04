import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
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
for (const [route, html] of documents) {
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert(title && !titles.has(title), `Missing or duplicate title: ${route}`);
  titles.add(title);
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
    JSON.parse(json);
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
    `UI builds must preserve the owner's ${file} byte for byte`,
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
  `PASS: ${files.length} pages, metadata, links, unchanged crawler files, accessible theme control, and no 3D embeds/runtime. Initial JS: ${(mainBytes / 1024).toFixed(1)} KiB gzip.`,
);
