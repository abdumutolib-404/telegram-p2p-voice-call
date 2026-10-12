import type { PublicPricing } from "../../server/src/contracts/pricing";
import { useEffect } from "react";
import { SiteLayout } from "./components/SiteLayout";
import { LandingPage } from "./components/LandingPage";
import { StatsPage } from "./components/StatsPage";
import { PricingPage } from "./components/PricingPage";
import { GuidePage } from "./components/GuidePage";
import { SafetyPage } from "./components/SafetyPage";
import { HowItWorksPage } from "./components/HowItWorksPage";
import { pages } from "./content";
import { StatsProvider } from "./lib/publicStats";
import type { PublicStats } from "./lib/publicStats";

export function App({
  initialPath,
  initialStats,
  initialPricing,
}: {
  initialPath?: string;
  initialStats?: PublicStats | null;
  initialPricing?: PublicPricing | null;
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
      refund: "refund-policy",
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
          <PricingPage initialPricing={initialPricing} />
        ) : path === "/how-it-works" ? (
          <HowItWorksPage />
        ) : path === "/safety" ? (
          <SafetyPage />
        ) : pages[path] ? (
          <GuidePage page={pages[path]} path={path} />
        ) : (
          <section className="wrap notfound"><div className="state">
            <span className="tile" aria-hidden="true">404</span>
            <h1>A little off course.</h1>
            <p>This page doesn’t exist. Let’s get you back to speaking.</p>
            <a className="btn btn--primary" href="/">
              Back to PairTalk
            </a>
          </div></section>
        )}
      </SiteLayout>
    </StatsProvider>
  );
}
export default App;
