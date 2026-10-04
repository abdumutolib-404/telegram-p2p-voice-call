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
const app = (
  <StrictMode>
    <App initialStats={initialStats} />
  </StrictMode>
);
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
