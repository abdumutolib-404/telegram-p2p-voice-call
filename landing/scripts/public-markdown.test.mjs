import assert from "node:assert/strict";
import test from "node:test";
import { publicMarkdown } from "./public-markdown.mjs";

const context = {
  title: "PairTalk guide",
  canonical: "https://pairtalk.online/faq",
  route: "/faq",
  reviewed: "2026-10-07",
};
test("exports readable main content, decoded entities, and absolute links while excluding controls", () => {
  const markdown = publicMarkdown(
    `<header>Navigation</header><main><h1>Intro</h1><aside>Index</aside>
    <h2>Privacy &amp; support</h2><p>Use an alias &lt;name&gt; and <a href="/privacy#rights">request help</a>.</p>
    <ul><li>One partner</li><li>Recording agreement</li></ul><button>Retry</button><input value="private" />
    <div aria-hidden="true">Decorative figure</div><script>secret()</script>
    <table><tr><th>Plan</th><th>Calls</th></tr><tr><td>Free</td><td>3</td></tr></table></main>`,
    context,
  );
  assert(markdown.startsWith("# PairTalk guide"));
  assert(markdown.includes("## Privacy & support"));
  assert(
    markdown.includes("[request help](https://pairtalk.online/privacy#rights)"),
  );
  assert(markdown.includes("alias <name>"));
  assert(markdown.includes("- One partner\n"));
  assert(markdown.includes("Plan | Calls"));
  assert(markdown.includes("| --- | --- |"));
  assert(markdown.includes("Free | 3"));
  assert(
    !/Navigation|Index|Retry|private|Decorative figure|secret\(\)/.test(
      markdown,
    ),
  );
});
test("preserves a dated pricing snapshot and explains its freshness", () => {
  const markdown = publicMarkdown(
    "<main><h1>Prices</h1><p>Prices checked 2026-10-07 12:00 UTC.</p><p>79 Stars</p></main>",
    {
      ...context,
      route: "/pricing",
      canonical: "https://pairtalk.online/pricing",
    },
  );
  assert(markdown.includes("79 Stars"));
  assert(markdown.includes("2026-10-07 12:00 UTC"));
  assert(markdown.includes("dated build snapshot"));
});
test("requires public content rather than exporting a broken shell", () => {
  assert.throws(
    () => publicMarkdown("<div>Loading</div>", context),
    /Public content missing/,
  );
});
