import { renderToString } from "react-dom/server";
import { App } from "./App";
import { pages, faqs } from "./content";
import type { PublicStats } from "./lib/publicStats";
export { isPublicStats } from "./lib/publicStats";
export const routes = [
  "/",
  "/how-it-works",
  "/ielts-speaking",
  "/stats",
  "/pricing",
  "/faq",
  "/safety",
  "/community-guidelines",
  "/privacy",
  "/terms",
];
export function render(path: string, stats: PublicStats | null) {
  return renderToString(<App initialPath={path} initialStats={stats} />);
}
export function metadata(path: string) {
  const custom: Record<string, { title: string; description: string }> = {
    "/": {
      title: "PairTalk | IELTS Speaking Practice Partners on Telegram",
      description:
        "Find an IELTS speaking partner on Telegram. Practice Parts 1, 2, and 3 with another learner, explore speaking prompts, and start with a free plan.",
    },
    "/stats": {
      title: "PairTalk Community Statistics | Calls, Practice Hours & Ratings",
      description:
        "Explore completed speaking calls, practice hours, participating learners, and post-call ratings on PairTalk, with transparent definitions and dated snapshots.",
    },
    "/pricing": {
      title: "PairTalk Plans | Free IELTS Speaking Practice & Paid Options",
      description:
        "Start IELTS speaking practice for free. Compare PairTalk plan options and learn about call allowances, recording retention, and refund eligibility.",
    },
  };
  return (
    custom[path] ??
    pages[path] ?? {
      title: "Page Not Found | PairTalk",
      description:
        "This page could not be found. Explore PairTalk speaking practice, guides, and community information.",
    }
  );
}
export function structuredData(path: string) {
  const base = "https://pairtalk.online";
  const meta = metadata(path);
  const graph: object[] = [
    {
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: "PairTalk",
      url: base,
      logo: `${base}/favicon.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: "PairTalk",
      url: base,
      inLanguage: "en",
      publisher: { "@id": `${base}/#organization` },
    },
    {
      "@type": path === "/faq" ? "FAQPage" : "WebPage",
      "@id": `${base}${path}#page`,
      url: `${base}${path}`,
      name: meta.title,
      description: meta.description,
      inLanguage: "en",
      isPartOf: { "@id": `${base}/#website` },
      ...(path === "/faq"
        ? {
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }
        : {}),
    },
  ];
  if (path === "/")
    graph.push({
      "@type": "SoftwareApplication",
      "@id": `${base}/#application`,
      name: "PairTalk",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Telegram",
      url: base,
      description: meta.description,
    });
  else
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "PairTalk", item: base },
        {
          "@type": "ListItem",
          position: 2,
          name: meta.title.split("|")[0].trim(),
          item: `${base}${path}`,
        },
      ],
    });
  return { "@context": "https://schema.org", "@graph": graph };
}
