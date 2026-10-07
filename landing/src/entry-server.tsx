import type { PublicPricing } from "../../server/src/contracts/pricing";
export { isPublicPricing } from "../../server/src/contracts/pricing";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { pages, faqs } from "./content";
import { practiceUrl, supportUrl } from "./components/SiteLayout";
import type { PublicStats } from "./lib/publicStats";
export { isPublicStats } from "./lib/publicStats";
export const siteUrl = "https://pairtalk.online";
// Update after a public content review, never on every build or request.
export const contentReviewed = "2026-10-07";
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
export function render(
  path: string,
  stats: PublicStats | null,
  pricing: PublicPricing | null = null,
) {
  return renderToString(
    <App initialPath={path} initialStats={stats} initialPricing={pricing} />,
  );
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
      title: "PairTalk Pricing | Compare Stars, UZS, Calls & Recordings",
      description:
        "Compare current PairTalk plans in Telegram Stars and UZS. Find call allowances, session limits, recordings, retention, and the plan that fits your practice.",
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
  const base = siteUrl;
  const meta = metadata(path);
  const graph: object[] = [
    {
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: "PairTalk",
      url: base,
      logo: {
        "@type": "ImageObject",
        url: `${base}/favicon.png`,
        width: 180,
        height: 180,
      },
      sameAs: [practiceUrl.split("?")[0]],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: supportUrl,
      },
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
      dateModified: contentReviewed,
      inLanguage: "en",
      isPartOf: { "@id": `${base}/#website` },
      publisher: { "@id": `${base}/#organization` },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: `${base}/social-preview.png`,
        width: 1200,
        height: 630,
      },
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
      publisher: { "@id": `${base}/#organization` },
      installUrl: practiceUrl,
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
