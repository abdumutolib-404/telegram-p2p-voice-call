import { useEffect } from "react";
import { SiteLayout } from "./components/SiteLayout";
import { LandingPage } from "./components/LandingPage";
import { StatsPage } from "./components/StatsPage";
import { PricingPage } from "./components/PricingPage";
import { GuidePage } from "./components/GuidePage";
import { pages } from "./content";
import { StatsProvider } from "./lib/publicStats";
import type { PublicStats } from "./lib/publicStats";

export function App({
  initialPath,
  initialStats,
}: {
  initialPath?: string;
  initialStats?: PublicStats | null;
}) {
  const path =
    (
      initialPath ??
      (typeof window === "undefined" ? "/" : window.location.pathname)
    )
      .replace(/\/index\.html$/, "/")
      .replace(/\.html$/, "")
      .replace(/\/$/, "") || "/";
  useEffect(() => {
    const aliases: Record<string, string> = {
      guidelines: "community-guidelines",
      ielts: "ielts-speaking",
      refund: "pricing",
    };
    const hash = window.location.hash.slice(1);
    const destination = aliases[hash] ?? hash;
    if (
      path === "/" &&
      (pages[`/${destination}`] ||
        destination === "stats" ||
        destination === "pricing")
    )
      window.location.replace(`/${destination}`);
  }, [path]);
  return (
    <StatsProvider
      initial={initialStats}
      enabled={path === "/" || path === "/stats"}
    >
      <SiteLayout path={path}>
        {path === "/" ? (
          <LandingPage />
        ) : path === "/stats" ? (
          <StatsPage />
        ) : path === "/pricing" ? (
          <PricingPage />
        ) : pages[path] ? (
          <GuidePage page={pages[path]} />
        ) : (
          <section className="container page-intro">
            <p className="eyebrow">404 · PAGE NOT FOUND</p>
            <h1>A little off course.</h1>
            <p>This page doesn’t exist. Let’s get you back to speaking.</p>
            <a className="button" href="/">
              Back to PairTalk
            </a>
          </section>
        )}
      </SiteLayout>
    </StatsProvider>
  );
}
export default App;
