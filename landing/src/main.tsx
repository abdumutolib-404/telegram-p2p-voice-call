import { isPublicPricing } from "../../server/src/contracts/pricing";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource-variable/manrope/index.css";
import "./index.css";
import App from "./App";
import { isPublicStats } from "./lib/publicStats";
const root = document.getElementById("root")!;
const snapshot = document.getElementById("public-stats-snapshot")?.textContent;
let initialStats = null;
try {
  const parsed: unknown = snapshot ? JSON.parse(snapshot) : null;
  if (isPublicStats(parsed)) initialStats = parsed;
} catch {
  /* A missing snapshot never blocks the site. */
}
let initialPricing = null;
try { const parsed: unknown = JSON.parse(document.getElementById("public-pricing-snapshot")?.textContent || "null"); if (isPublicPricing(parsed)) initialPricing = parsed; } catch { /* Live prices will be checked on load. */ }
const app = (
  <StrictMode>
    <App initialStats={initialStats} initialPricing={initialPricing} />
  </StrictMode>
);
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
