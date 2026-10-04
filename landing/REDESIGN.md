# PairTalk landing redesign

Status: implemented locally, awaiting visual review. No commit, push, or deployment performed.

## Direction

- Ink `#101A24`, ivory `#F7F5EF`, mint `#8DE6C3`, coral `#FF9B85`, slate `#526171`.
- Locally hosted Manrope variable font, with system fallbacks.
- Approved mint waveform logo, matched across the landing header/footer, favicon, and share preview.
- Clean, responsive layouts with a native HTML/CSS conversation illustration. All 3D models, embeds, viewer adapters, and model assets have been removed.
- Light ivory and dark ink themes across the homepage, guides, statistics, pricing, and policy pages. Mint/coral accents and the approved logo remain consistent in both themes.
- Editorial spacing, a clear Telegram action, readable guide pages, and consistent navigation.
- Normal scrolling, browser zoom, keyboard focus, and native FAQ disclosures.

## Completed

- Replaced the previous landing and guide layouts; removed obsolete screen components and Tailwind dependencies.
- Homepage: staggered introduction and conversation graphic, responsive community strip, animated matching journey, interactive IELTS prompt board, alias/boundary diagram, welcome-pass free-start section, editorial FAQ, and conversation-echo final action.
- Ten public routes: `/`, `/how-it-works`, `/ielts-speaking`, `/stats`, `/pricing`, `/faq`, `/safety`, `/community-guidelines`, `/privacy`, `/terms`.
- Fixed the old Safety/Guidelines and Terms/Privacy routing collisions.
- Pre-rendered complete React HTML for every public route, with individual titles, descriptions, canonicals, social metadata, and relevant JSON-LD.
- Added a noindex 404 document. Restored the owner's original `robots.txt`, `sitemap.xml`, `llms.txt`, and `llms-full.txt`; builds copy them byte for byte. Original backend crawler-serving behavior is restored too.
- New 1200×630 social preview, matching brand mark, and favicon assets.
- Removed unsupported wait-time promises, fixed-dollar Stars comparisons, keyword-heavy copy, blocked zoom, and blocking Telegram SDK loading.
- Added public statistics with definitions, rating sample limits, UTC monthly activity, dated snapshots, retry behavior, and accessible chart tables.

## Rendering and performance

React + TypeScript + Vite remain the foundation. No 3D engine, canvas, iframe, remote viewer runtime, or model downloads remain. Visuals use HTML/CSS and the existing icon library, with no added animation dependencies. Initial JavaScript is approximately 77 KiB gzip.

Effects include staggered hero lines, waveform pulses, matching illustrations, drawn connections, prompt transitions, alias reveals, a welcome stamp, FAQ expansion, and closing echoes. A single IntersectionObserver triggers sections when they enter view. Animations use transforms and opacity, run finitely, and pause in hidden tabs. There is no page-owned animation loop or scroll interception. Reduced-motion preferences, Save-Data, and devices reporting two or fewer logical cores receive a quieter presentation. Pre-rendered content remains visible without JavaScript.

Layouts use fluid typography/spacing and distinct compositions. Below 960px the hero stacks; below 720px the matching journey becomes vertical and the content sections use one column. The community strip becomes compact rows below 480px. Interactive prompt buttons expose their selected state, keep the prompt area stable at typical phone widths, and update a persistent polite live region.

The first visit follows the device theme. A header button changes between light and dark; the choice is saved locally and applies across routes and refreshes. A small head script applies the selected colors before paint, while React keeps server and hydration markup consistent. If storage is unavailable, the button still changes the current page.

Targets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at the 75th percentile, measured separately for mobile and desktop after deployment. Device-size tests do not substitute for testing a physical older phone.

## Statistics and minimal backend changes

`GET /api/public/stats` exposes completed calls with positive duration, session hours (not doubled participant hours), distinct participating accounts, active topics with active questions, valid post-call rating aggregates, and six months of activity. It does not expose IDs, aliases, comments, reports, recordings, or billing records.

Aggregates are computed in PostgreSQL under a read-consistent transaction, with bounded query time. A 15-minute in-process cache and shared refresh promise reduce database work. Failures return a generic 503, use a retry cooldown, and do not generate synthetic statistics. Ratings are deduplicated by participant/session; negative ratings are retained. Averages and distributions need at least five ratings.

The database does not tag internal test accounts. An operational audit is needed before describing totals as independently verified. The UI discloses this limitation.

The server serves the new `.html` documents at clean URLs and a real 404 for unknown public URLs. Crawler routes retain their repository behavior. The latest revision changes presentation and theme only; pricing/statistics content and further backend work remain deferred to the next backend phase.

## Local review

```powershell
cd D:\telegram-p2p-voice-call\landing
npm ci
npm run build
npm run check
npm run preview -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/`. Review the homepage, mobile navigation, `/stats`, `/pricing`, and the guide/policy pages. Vite development mode is useful for editing; the production preview is the appropriate place to review pre-rendered metadata.

## Deployment settings

Copy `.env.example` if overrides are needed. `VITE_BOT_USERNAME` chooses the bot and `VITE_PUBLIC_STATS_URL` chooses the unauthenticated aggregate endpoint. These are public frontend settings; never include admin tokens or passwords.

Deploy the backend endpoint with the landing changes to populate live figures. The site remains usable if the endpoint is absent. To include actual numbers in the initial crawlable HTML, set `PUBLIC_STATS_BUILD_URL` to the deployed aggregate endpoint in the build environment. Build-time retrieval is optional and time-bounded; snapshots keep their original timestamp and refresh in the browser.

Deploy `landing/dist` as static files. Hosts must serve extensionless routes from the generated `.html` files and return `404.html` with HTTP 404 for unknown pages. The existing Node deployment has been updated accordingly. Do not configure a blanket rewrite of every URL to `index.html`, which would discard page-specific metadata and create soft 404s.

The repository Docker build runs `npm run build` for landing and copies this output. Other packages and hosting providers have not been redeployed.

## Validation

- Landing TypeScript and production build.
- Automated built-output checks: all routes, unique metadata, JSON-LD, internal links/fragments, byte-for-byte crawler-file preservation, zoom, essential assets, theme control/bootstrap, and absence of 3D embeds/runtime.
- Backend TypeScript.
- Targeted statistics tests: response shape, negative ratings, sample suppression, concurrent refresh caching, and safe failure behavior.
- Existing auth tests from the first redesign. Original edge-routing tests restored and rerun (38 passing).
- Browser review of phone, tablet, landscape, and large-screen layouts from 280 to 1920 CSS pixels. The 320px community-strip overflow was corrected. Review includes both themes, selected prompt content for all three Speaking parts, FAQ expansion, theme persistence, guide readability, section motion, and mobile navigation/Escape focus behavior.

Live production totals, production database query execution, search indexing, and physical-device performance remain deployment checks. No ranking position is guaranteed.
