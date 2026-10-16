# Launch verification evidence

Scope: the existing PairTalk development services and baseline main `5937a962f685433fafe6a6debfdb76d4a63ae416`. Follow [the ordered plan](LAUNCH_PLAN_2026-10-16.md). This document is a running evidence ledger, not a launch approval.

## 1. Benchmark

Five cold-context production-build runs per surface, 390×844, 4× CPU slowdown, verified 150ms response-header delay and a nominal shared 200,000 compressed bytes/s scheduler. Windows timer scheduling can reduce effective throughput. This is an owned delivery model, not calibrated mobile network or field INP evidence. Retained CPU-only experiments are explicitly incomparable; a control request proved this Chrome build did not enforce its accepted CDP network-throttle setting.

| Surface | Median LCP before → after | Median FCP before → after | CLS after | Initial JS gzip | Encoded page after |
| --- | --- | --- | --- | --- | --- |
| Public home | 2.476s → 2.044s | 2.476s → 2.044s | <0.001 | 91.9 KiB | 142.4 KiB |
| Pricing | 2.096s → 1.448s | 2.096s → 1.448s | 0.024 | 91.9 KiB | 139.2 KiB |
| Mini App normal launch | 2.792s → 2.520s | 2.156s → 2.088s | 0 | 106.2 KiB | 159.2 KiB |
| Admin sign-in | 1.852s → 1.656s | 1.624s → 1.456s | 0 | 67.0 KiB | 101.4 KiB |

Changes: the Mini App uses the authenticated `hasActiveCall:false` result to avoid a second serial lookup; explicit call links, true flags and absent legacy flags still fetch fresh media credentials. A regression test failed before the fix and all 19 authentication tests passed afterward. Public and Mini App compiled local CSS travels in HTML to remove a render-blocking request. Total compressed page weight is nearly unchanged, but repeat document navigation transfers style bytes again. Fingerprinted external/lazy assets gain immutable cache headers on all three frontends.

Remaining optimization targets: Mini App LCP misses 2.5s by 20ms in this lab; home/Mini App FCP exceed 1.8s. The largest sampled homepage interaction is 200ms; Mini App/admin are 120/56ms. These lab samples are not field INP. Main-thread hydration and current initial UI/CSS weight remain measurable costs; do not claim all budgets pass. No layout instability or initial bundle-size budget failure was observed.

The owned API run used real Express authentication/routes, PostgreSQL and the Lua-compatible test Redis. All 600 requests returned 200. At concurrency ten, p95 was 21.1ms for the public catalog, 170.9ms for session history and 48.5ms for dashboard summary. It is neither production Redis capacity nor a concurrent voice test. Five gentle live samples per URL all returned 200; median backend health/catalog/proxied catalog was 1962/755/592ms. Health performs one indexed user lookup and a Redis ping concurrently; this short remote sample does not identify a database bottleneck or prove an 800ms live TTFB budget. Retain the variable live latency as a deployment observation.

Raw before/after browser, API and live observations plus the reproducible harness instructions are in [.ecc/benchmarks](../.ecc/benchmarks/README.md). All twelve sequential feedback commands passed: backend/Mini App/admin/landing builds took 22.0/11.0/12.2/9.1s; frontend lint took under 1s each; Mini App/backend suites took 31.5/99.3s (139/994 tests). Installed dependencies and TypeScript caches were warm; Vite performed production transforms. Clean-install, HMR, Docker and Linux race timings are not inferred from unrelated runs. No Docker executable or installed WSL distribution was available.

## 2. SEO

Confirmed and corrected before moving to the next skill: pricing metadata and discovery text described the removed subscription-first purchase flow; discovery refund text applied the legacy OR rule to new purchases; the speaking guide described only whole bands; discovery dates predated the new public policies; static registration links ignored a build's configured bot. Updated current purchase/refund explanations, half-band guidance, reviewed metadata/sitemap/discovery dates and build-specific bot links. The accepted policy prose/PDF is unchanged. Private frontend assets also receive `X-Robots-Tag: noindex, nofollow`, in addition to their existing HTML meta tags.

The rebuilt public surface passed all three Markdown tests and twelve-page structural validation: unique titles/descriptions/canonicals, one H1, real content without JavaScript, social/schema alignment, FAQ text matching, eleven public sitemap entries and matching reviewed dates, local links/fragments and discovery links. The check now rejects removed pricing/refund claims and verifies the bot link matches the deployed schema. No fabricated reviews, fixed queue-time promises or stale dynamic price markup was added.

Gentle reads of the existing development host found eleven intended pages at 200, robots/sitemap at 200, an unknown page at 404 with noindex, and `/pricing.html` and `/pricing/` each redirecting once (307) to `/pricing`. Both private frontend HTML documents already had noindex/nofollow. The current configured canonical `https://pairtalk.online` is reachable at 200 but serves an older, separately scoped public deployment with `@PairTalkBot`; development uses `@ieltsSpeakBot`. Canonical intent is preserved. Publishing development changes does not update that separate public deployment or prove search engines have indexed the new content. The build now derives discovery registration links from its actual configured bot; policy content remains curated.

## Outstanding phases

All six review phases have been performed. Final publication and existing deployment revision checks are still required. The owner confirmed credential revocation/rotation; provider/device verification limits remain explicit below.

## 3. Make interfaces feel better

| Principle / surface | Before | After |
| --- | --- | --- |
| Question administration on narrow screens | Four cramped statistics columns; filter controls overlapped and were clipped | Two statistics columns, wrapping tabs and filters, single-column cards below 600px; no clipped statistic values at 320/390/768/1440 |
| Scoped motion | Seven `transition: all` declarations in admin inputs/question controls | Explicit color/background/border/shadow transitions; reduced-motion disabling retained |
| Keyboard table access | Questions table had no explicit focusable scroll region | Named `Questions table` region with `tabIndex=0`; arrow-key horizontal scrolling verified |
| Short text wrapping | Question status heading and prompts could form awkward narrow lines | Balanced heading, pretty short prompts/subtitle and wrapping long statistics |

The existing global admin control rule already provided 44px targets; the review confirmed it rather than claiming an invented size fix. Eight question-layout cases (four widths × both themes) passed overflow, internal statistic clipping, accessibility, normal/reduced-motion and keyboard scroll checks. Before/after mobile screenshots were visually inspected. The existing design, colors, tabular counters and rounded surfaces were retained.

Actual Mini App components with owned synthetic data passed 72 current cases covering practice/account, history empty/error/report/saved/rating pending/uncertain audio delivery, in-call recovery, after-call and question cue-card states; keyboard menu focus/Escape restoration and microphone-dialog containment passed. Twenty-four current pack-builder/checkout cases passed across landing, Mini App and admin at four widths/both themes. These are browser/component checks, not new live microphone or payment transactions. The first accessibility run sampled three report-dialog text fragments during its entrance fade; waiting for that finite transition produced zero contrast violations across the repeated 72-case matrix. No color change was made to conceal an animation-sampling artifact.

## 4. Security bounty hunter

Owned application scope only; no third-party bounty submission or external attack. Reviewed real HTTP/API entrypoints, Telegram-signed member authentication, admin password/OTP/JWT guards, socket admission/readiness, checkout/campaign ownership, receipt/recording retrieval, webhook signatures and crawler URL sinks. Source pattern searches were triage, not findings.

**Withdrawn candidate — call-resume membership bypass.** An isolated router test initially omitted the membership middleware already installed in server/src/index.ts. Its 200 responses did not demonstrate a deployed bypass. The candidate was explicitly withdrawn, the redundant route guard removed, and the fixture corrected to mount the real server boundary. Do not count this as a discovered live vulnerability or claim the redundant guard improved security. The existing route grant also remains canSubscribe:false until separate media readiness.

**Correctness hardening — consistent suspension dates.** The registered-member and authentication gates used a narrower predicate than checkout/socket admission: a future bannedUntil could be ignored when isBanned was false. The corrected real-boundary tests fail for this stale-record case before the shared isAccountRestricted predicate is applied. Both gates now use that existing predicate. No remotely reachable attacker-controlled write that creates this inconsistent state was found, so this is not presented as an independently exploitable bounty finding. Six restricted membership cases, expired-suspension recovery, outsider denial and original call timing remain regression coverage. The owned real-PostgreSQL runner mounts the same middleware as the main server and creates only synthetic JWTs; no provider requests are made.

Other candidates were rejected after tracing: raw SQL's table identifiers are hardcoded call-site literals and values use bound parameters; external crawler requests validate every redirect and pin validated public DNS answers with byte/time bounds; receipt formats/signatures and sandboxed responses prevent active content from becoming an admin page; recording retrieval checks participant, recorder/segment ownership and owner-specific expiry before storage/signing; the LiveKit webhook verifies its signed raw body before state changes. No raw user-controlled DOM HTML or request-to-shell execution path was found. This scoped review cannot certify absence of all vulnerabilities.

## 5. Security scan (Claude configuration)

The invoked ECC skill specifically scans repository Claude Code configuration with AgentShield. A fresh hidden-file inventory found no `.claude/`, `CLAUDE.md`, `.mcp.json`, `mcp.json` or hooks configuration outside ignored runtime/build directories. Only environment examples are tracked; no private env/key file appeared in the tracked-file inventory. The configuration scan is **not applicable**. No configuration was fabricated, no global package installed, no unrelated personal configuration read and no paid multi-agent analysis run. This outcome is not an application security pass; that is the next review.

## 6. Security review and final checks

Listed before fixing: the backend's old development toolchain had five advisory-bearing packages (two critical, one high, two moderate). These were Vitest, Vite, vite-node, tinypool and esbuild, not five demonstrated runtime exploits. The runtime Docker stage already prunes development tools. Updated to Vitest 5.0.3 / Vite 8.2.1 and Node 24 types, matching the patched frontend stack; the lockfile removes the old dependency tree. The new runner correctly requires a constructible webhook mock, so its test-only arrow constructor became a normal function. Real webhook signature checks and all outcome assertions remain intact. Final full dependency audits for server, client, admin and landing each report zero vulnerabilities.

Reviewed signature freshness/timing-safe comparison, admin HS256/whitelist/expiry and atomic OTP, CORS/custom-header CSRF checks, ownership before financial/file operations, bound SQL values, strict purchase quantities/amount ranges, receipt type/signature/size validation, safe external fetch, escaped React rendering, signed webhooks, recording expiry and bounded provider reads. Admin's tab-scoped bearer fallback supports its cross-site development API alongside the HttpOnly cookie; it is not persistent localStorage. The example Supabase/blockchain requirements do not apply. Existing server headers and sandboxed receipt CSP were checked; this review does not claim a new strict site-wide frontend CSP or a formal penetration-test certificate.

A credential-pattern inventory covered 602 tracked files and 2,507 textual blobs (30.9 MB) reachable from development main. Four credential families were checked without retaining values. Matches were redaction tests, mock harnesses, synthetic verification code and documented placeholder tokens; no new non-fixture secret was validated. This limited pattern scan cannot establish revocation of the two credentials recorded exposed in earlier local diagnostics. The owner explicitly confirmed on October 16 that both credentials were revoked or rotated; that historical gate is closed.

Final verification after the dependency change: **1,001 backend tests / 96 files**, **139 Mini App tests / 22 files**, all frontend/backend production builds and type checks, frontend lint, three public Markdown tests/twelve-page SEO checks, all eight Go packages and `go vet` passed. Admin lint retains one existing Fast Refresh export warning. The four guarded real-PostgreSQL purchase/campaign/notification/recording runners and real-boundary call-resume runner passed. Synthetic provider adapters exercise replay, expiry, ownership, capacity, refund holds, membership and failure recovery; they do not send real messages, charge/refund real money or delete hosted objects.

The repeated 600-request API comparison returned 200 throughout. At concurrency ten, p95 catalog/history/summary was 20.6/135.7/55.8ms, versus 21.1/170.9/48.5ms before; do not overinterpret small local timing differences as hosted capacity. Railway's current existing backend, PostgreSQL and Redis were all online with zero recent failures/pending changes. The backend used approximately 0.104 GB memory over 61 one-minute samples; these idle/light-use observations do not establish saturation capacity.

## Launch decision and remaining gates

Application changes are verified for the existing development release. Unconditional public launch readiness remains unproven until current provider permissions/payment/refund behavior are established by an authorized live check. The owner confirmed both previously exposed GitHub credentials were revoked or rotated. Earlier device confirmations establish two-way calls, reconnect timing and playable dual-voice Telegram delivery on the prior development revision; they are not fresh paid-transaction evidence. Current public-domain deployment is separately scoped and is not updated by a development release. Docker/Linux race execution is unavailable in this Windows runtime; no passing Linux race result is claimed. Remaining lab speed-budget misses are listed in step one.

Cleanup preserves ignored local artifacts, private runtime configuration, databases, dependencies and the pending DOCX. Rejected throttle experiments stay in ignored local output; the shared benchmark folder keeps only the valid baseline/comparison and feedback evidence. Reusable verification tools and the concise plan/evidence ledger remain source files. No production remote, new site/service, hosted deletion, campaign publication or real payment is part of these checks.
