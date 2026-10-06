# PairTalk project notes

The maintained overview is [README.md](README.md). Setup lives in [Environment and deployment](docs/ENVIRONMENT_AND_DEPLOYMENT.md), and follow-ups live in [Operations](docs/OPERATIONS.md).

## Product boundaries

- The landing, Telegram Mini App, and admin console have separate audiences and entry points.
- Practice bands are self-reported preferences, not official examiner scores.
- Prices and entitlements come from backend plan configuration. Independent credit purchases remain a [product specification](docs/unit-pricing.md).
- Preserve the approved waveform brand, light/dark themes, responsive layouts, and reduced-motion behavior.
- Keep `landing/public/robots.txt`, `sitemap.xml`, `llms.txt`, and `llms-full.txt` under owner control.
- Security changes affecting call accounting or recordings must cover both Node and the production Go gateway.
- Verification uses synthetic credentials and isolated persistence. Local checks do not establish production provider behavior.

Reviewed against the working tree on 2026-10-05.
