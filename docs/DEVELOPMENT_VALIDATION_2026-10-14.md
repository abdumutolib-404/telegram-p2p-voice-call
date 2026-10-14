# Development validation — October 14, 2026

The owner confirmed the documented deployment is development, Railway holds its provider configuration, main pushes deploy development, and two Telegram accounts/devices are available. See [the implementation record](READINESS_IMPLEMENTATION_2026-10-14.md) for preceding local verification and remaining release gates.

## Published readiness corrections

Commit `1cebe4c37d2eb5f95d36606feee85273b53d061b` was pushed normally from the primary checkout to `origin/main`. Cloudflare's active versions map to successful main builds from that commit for all three frontends:

| Frontend | Build | Active version |
| --- | --- | --- |
| `app-pairtalk-dev` | `b5058ecb-cc43-4629-ba85-dd58f00431ab` | `37455b72-d979-49d1-ac98-6d76949accf7` at 100% |
| `admin-pairtalk-dev` | `da1d39f4-a9f7-4a26-bb9e-922216fe3522` | `19ebd060-0652-4344-a532-24bd7d010841` at 100% |
| `telegram-p2p-voice-call` | `e571d38e-9922-47f7-91af-511999c5da52` | `f47e48ab-7338-41e6-9236-faa813a00558` at 100% |

Railway's GitHub status reports successful backend deployment for this commit, deployment `94a7afdd-db9e-4ce3-a215-38aa8dcece14`. Eight public HTTP checks passed after deployment: client/admin/landing HTML, backend readiness, plans, statistics, unsigned recovery rejection and invalid-signature recovery rejection. Polling and WebSocket probes from the development frontend origin both received the expected invalid-signature rejection. These transport checks do not prove signed queue admission or audible audio.

The owner's Railway logs show all nine migrations were present with no pending migrations, Node and Go connected to PostgreSQL/Redis, signed launch requests returned HTTP 200 and a gateway match was dispatched. This is owner-supplied live evidence; live schema drift, database state and media outcomes were not inspected through Railway administration.

## Matchmaking observation and follow-up

The owner reports the two accounts remained searching at 7.5/7.5 but connected after changing to 7.5/7.0. Equal bands are eligible under the existing policy. Supplied logs show `queue_join outcome=queued` immediately followed by `debounce outcome=ignored`, and `match_found outcome=matched` immediately followed by another debounce. They do not identify each attempt's bands or establish the cause of the failed equal-band attempt.

The client could emit a buffered queue request while its socket was disconnected, then emit again on connection. It now waits for connection before joining. A regression checks no preconnection join, one initial join and one rejoin after disconnection. The existing production-Lua concurrency test now explicitly covers 7.5/7.5 and 7.5/7.0 in both orders; all six cases pass locally. That test uses the repository's owned Redis-compatible test server, not Railway Redis. Matching policy is unchanged.

The follow-up was published as `4f6e830a9e68e66b93623dc5539595a3296dc2ea`. Cloudflare confirmed all three development frontends serve versions built successfully from this commit at 100%; Railway reports a successful deployment of the same commit. After being asked to reopen both Mini Apps and retry 7.5/7.5, the owner reported very fast, successful matchmaking. The equal-band device retest is therefore passed for these two accounts. This observation does not establish a wait-time distribution or capacity, and the root cause of the earlier failure remains unproven.

## Questions UI follow-up

The owner requested polish of the in-call questions section. The panel now uses shared theme tokens, clear part selectors, a labeled topic picker, larger prompt text, spaced cue-card bullets and plain timer controls. Previous/Next stays visible while the reading area scrolls, and changing prompts returns to the new prompt. Short landscape viewports scroll the panel while keeping its header and navigation accessible. Call controls remain available below it. Loading, fallback and empty results remain truthful.

The client suite passed 18 files / 106 tests, including the new queue regression and existing question/timer lifecycle tests. Client lint and production build passed. Browser verification covers 28 question states/viewports, including all three speaking parts, empty/loading/offline states, dark/light themes, short phone/landscape layouts, timer start/reset, navigation, Escape and focus restoration. No checked viewport overflow, automated WCAG A/AA violations or collected browser errors remain. The final scroll-position correction is verified by checking the next prompt appears above the fixed footer.

## Remaining live checks

The owner reported that the 15-second reconnect window was too short for the reopen check. Node and Go now allow 60 seconds, and the client uses the server-advertised value with a 60-second fallback. The authorized timer continues during grace and can end the call first. Regression checks cover a return after 30 seconds, teardown of an absent participant at one minute, cancellation on reconnect/shutdown and expiry at the original call deadline.

This change was published as `267d7661100d5fa39dbd5ab585e5c77b4ae853d1`, with successful Railway deployment and successful main builds serving at 100% for all three Cloudflare frontends. The owner then performed the requested close/reopen test and confirmed the time was correct and both voices returned. Original-time recovery and audible two-way audio therefore passed for this two-account device setup. The exact ten-minute point of a fifteen-minute call and the broader device/provider failure matrix are not established by this reply.

For this follow-up, the complete backend suite passed 85 files / 861 tests, the client suite passed 18 files / 107 tests, all eight Go packages and Go vet passed, and the backend/client production builds passed. Four additional reconnect screen/viewport checks passed without overflow, automated WCAG A/AA violations or collected browser errors; the mobile capture was visually inspected. These are local regression and render checks, not a completed provider recovery test.

Equal-band matchmaking, the requested reopen recovery and restored two-way audio have passed the owner's device checks. The owner then played a test recording and confirmed both voices and correct Telegram delivery/status after being asked to check single delivery and sent/queued status. This passes the tested recording and delivery journey; the reply does not establish every segment, ambiguous provider response or delivery retry variant.

Keep payment/refund, retention-failure, live persistence, supported Linux race, backup rehearsal and historical operational cases open until observed against the intended release revision. Use [the staging checklist](STAGING_READINESS_CHECKLIST.md) for those remaining cases.

## Practice, history, account and call completion follow-up

The owner selected Practice/dashboard and History/account for the next UI pass, then reported missing navigation after calls, a black background around the call controls and a false error when a partner ended a call.

Practice now has a visible heading, readable band/call balances, a per-call duration note and direct shortcuts to History and Account. History groups saved audio separately from rating, saving and reporting, exposes each available segment's UTC expiry, and preserves truthful queued/sent behavior. Account groups limits, uses full speaking-score labels, keeps the reset/expiry visible and moves the detailed allowance explanation into an expandable section. Do Not Disturb retains its signed update and acknowledged state through a standard switch.

The after-call header now offers Back to practice alongside the existing History action. Both the controls panel and its inner grid use the current theme instead of the legacy hard-coded dark background. The Go finish handler deletes the LiveKit room before signaling completion; the client now recognizes `ROOM_DELETED` as terminal completion. It shows “Call ended” whether media teardown or `call_finished` arrives first. An unexpected voice transport loss still shows an actionable error. No backend, matching, charging or reconnect-grace behavior changes in this follow-up.

Verification passed: **18 client files / 114 tests**, client lint and production build, and **84 current browser screen/layout checks** with no checked horizontal overflow, automated WCAG A/AA violations or collected browser errors. The scope includes free/paid/exhausted Practice, free/paid Account, populated/empty/failed/queued/unavailable/multiple-segment History, completed/error/pending/cancelled after-call screens and an active call. Both themes are checked on short phone and landscape layouts. Menu keyboard navigation, Escape focus restoration, microphone-dialog focus containment and reduced-motion checks pass. Representative captures were visually inspected, including both layers of the controls background. These are local checks; the new partner-end behavior still needs a two-device development observation after publication.

## Extended state review

The readiness-file audit added an owned browser sweep for Account/history loading, pending and failed preference updates, acknowledged preferences/scores/saved partners, pending ratings, pending/failed/acknowledged Telegram delivery, and the Questions states with the revised call controls. The sweep completed 112 checks. Four light-theme failure captures exposed low-contrast error text: a legacy `!important` peach color overrode the semantic error color on white surfaces. The shared error rule now uses the existing theme's `danger-text` token. A subsequent 16-check focused sweep of Account-save and delivery failures passed at all four widths, plus both themes on short phone/landscape layouts, with no checked overflow, WCAG A/AA findings or collected browser errors. Representative failures and their corrected captures were inspected visually. Client lint and production build passed after the CSS correction; JavaScript behavior is unchanged from the 114-test suite above.

The completion audit confirmed that provider failure variants, combined PostgreSQL/Redis and Linux race checks, production-backup rehearsal, historical credential revocation and recording reconciliation remain open. Docker, Podman and Redis server are unavailable on this workstation; WSL currently lists zero distributions. A disposable Linux verification environment has been requested. No broader release approval follows from the successful UI/device journeys.
