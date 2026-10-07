import { parse } from "parse5";

const attr = (node, name) =>
  node.attrs?.find((value) => value.name === name)?.value;
export function findElement(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes ?? []) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

// Export the rendered public content, not navigation, controls, or private data.
// parse5 decodes HTML entities and preserves the same document structure as a browser.
export function publicMarkdown(html, { title, canonical, route, reviewed }) {
  const main = findElement(parse(html), (node) => node.tagName === "main");
  if (!main) throw new Error(`Public content missing: ${route}`);
  function text(node) {
    if (node.nodeName === "#text") return node.value.replace(/\s+/g, " ");
    if (node.nodeName === "#comment") return "";
    const tag = node.tagName;
    if (
      [
        "script",
        "style",
        "svg",
        "nav",
        "aside",
        "button",
        "input",
        "select",
        "label",
        "h1",
      ].includes(tag) ||
      attr(node, "aria-hidden") === "true" ||
      attr(node, "class")
        ?.split(/\s+/)
        .some((value) =>
          ["article-number", "eyebrow", "breadcrumb"].includes(value),
        )
    )
      return "";
    const children = () => (node.childNodes ?? []).map(text).join("");
    if (tag === "br") return " ";
    if (tag === "a") {
      const label = children().trim();
      const href = attr(node, "href");
      if (!label || !href) return label;
      const url = new URL(href, canonical);
      return ["https:", "http:"].includes(url.protocol)
        ? `[${label}](${url.href}) `
        : label;
    }
    if (tag === "code") return `\`${children().trim()}\``;
    if (tag === "strong" || tag === "b") return `**${children().trim()}** `;
    if (/^h[2-6]$/.test(tag))
      return `\n\n${"#".repeat(Number(tag[1]))} ${children().trim()}\n\n`;
    if (tag === "li") return `\n- ${children().trim()}\n`;
    if (tag === "table") {
      const rows = [];
      function collectRows(node) {
        if (node.tagName === "tr")
          rows.push(
            (node.childNodes ?? [])
              .filter((cell) => ["td", "th"].includes(cell.tagName))
              .map((cell) =>
                text(cell).replace(/\s+/g, " ").trim().replaceAll("|", "\\|"),
              ),
          );
        else for (const child of node.childNodes ?? []) collectRows(child);
      }
      collectRows(node);
      if (!rows.length) return "";
      const lines = rows.map((row) => `| ${row.join(" | ")} |`);
      lines.splice(1, 0, `| ${rows[0].map(() => "---").join(" | ")} |`);
      return `\n\n${lines.join("\n")}\n\n`;
    }
    if (tag === "tr")
      return `\n${(node.childNodes ?? []).map(text).filter(Boolean).join(" | ")}\n`;
    if (tag === "td" || tag === "th") return children().trim();
    if (
      [
        "div",
        "section",
        "article",
        "p",
        "ul",
        "ol",
        "table",
        "details",
        "summary",
        "caption",
      ].includes(tag)
    ) {
      return `\n\n${children().trim()}\n\n`;
    }
    return `${children()}${tag === "span" ? " " : ""}`;
  }
  const snapshotNote =
    route === "/pricing"
      ? "Prices, if present, are a dated build snapshot. Check the live pricing page and Telegram invoice for a current quote."
      : route === "/stats" || route === "/"
        ? "Community figures, if present, are a dated build snapshot. Check the live statistics page for current available figures."
        : "";
  const body = text(main)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `# ${title}\n\nSource: ${canonical}\nReviewed: ${reviewed}\n${snapshotNote ? `\n${snapshotNote}\n` : ""}\n${body}\n`;
}
