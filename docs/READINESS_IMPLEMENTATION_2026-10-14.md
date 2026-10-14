# Readiness implementation — October 14, 2026

Work list: [the October 13 assessment](READINESS_2026-10-13.md). This record separates completed local verification from development deployment and unexecuted provider journeys. The implementation includes no production migration or billing-policy change.

## Corrections

| Finding | Implementation | Verification |
| --- | --- | --- |
| R1: rejoin duration | The active-call API, Node reconnect and Go reconnect now return the full duration with the persisted authorized start/expiry. The client prefers the full duration and updates it from `call_started`. An authorized timer remains visible and continues while a partner reconnects. | React regression exercises a call reopened after ten minutes, checks five minutes remain and finishes exactly at the original deadline. Another regression covers delayed start events, and a component regression covers an absent partner. API tests check authorized and unstarted timing. The PostgreSQL-bound Go recovery test now passed against an actual disposable database. |
| R2: failed-join cleanup | A rejected voice join sends the existing idempotent finish request and releases local media. Retry has a pending state, rejects duplicate presses and refreshes server session status before searching. If the same room is still active, retry repeats cleanup; it never ends a different active room. | Tests cover rejected joins, delayed cleanup, duplicate retry presses, successful retry after terminal state, status-refresh failure and a different active session. Backend summary tests check participant ownership and terminal state. |
| R3: misleading delivery label | The recording action visibly says “Send to Telegram,” with matching queued/sent behavior and accessible naming. | Existing delivery tests and rendered history checks exercise the authenticated delivery action and queued state. |
| R4: unclear allowance period | Launch verification and dashboard summary return the current period's UTC start/end plus included and bonus balances. Practice shows a compact reset/expiry note; Account explains the full period, renewal and bonus behavior. | Tests cover year rollover, custom subscription validity, expired subscriptions, matching launch/account data, and unavailable period data. Rendered practice/account views exercise the copy at narrow and wide widths. |

Allowance semantics follow the existing implementation: a future subscription expiry uses the subscription period; otherwise usage is counted from the UTC calendar-month boundary. Available referral bonus calls remain non-expiring and are used after included calls. This work makes that behavior visible; it does not introduce lifetime purchased credits or approve a future billing redesign.

The new API tests exposed a test-database limitation: call-session predicates on participant relations were ignored. The in-memory test adapter now evaluates those relations, so the signed nonparticipant recovery test checks the intended boundary. Summary responses also explicitly project the room name. These changes improve local evidence; they do not replace real PostgreSQL verification.

## Additional rendered-UI corrections

The browser sweep found horizontal overflow from the rotating search decoration at 320px. Clipping is confined to that decorative orbit and preserves its visible dot. It also found low text contrast during the delivery note's opacity animation. The note now moves into place while retaining full text opacity.

The visual direction, navigation structure and existing PairTalk identity are retained. Period details are compact in Practice and expanded in Account, keeping partner search as the primary task. The work covers the assessment's affected flows, not a new exhaustive audit of every admin/public-page state.

## Verification evidence

The full backend suite passed **85 files / 859 tests**, including the new API/allowance checks and the UTC month-boundary regression. Backend TypeScript checks and the actual backend production build (Prisma generation, compilation and consent-asset copying) passed. The final client suite passed **18 files / 105 tests**, and client lint/production build passed. A singular/plural copy correction initially required updating one new test assertion; the subsequent complete suite passed.

All eight Go packages and Go vet passed again. The database package then passed with actual PostgreSQL bindings, including accounting, concurrent admission/completion, durable media authorization, bonus boundaries, ownership, terms and UTC checks. The signaling recovery test ran and passed with those bindings rather than being skipped. Redis-bound signaling and full Node/PostgreSQL/Redis integration remain unexecuted.

### Actual PostgreSQL follow-up

An official [EDB PostgreSQL binary archive](https://www.enterprisedb.com/download-postgresql-binaries) provided a portable PostgreSQL 16.15 runtime in an owned disposable temporary directory; no system service was installed. The cluster listened only on loopback 55432 and used synthetic credentials outside the checkout. All **nine committed migrations** applied, and Prisma found **no schema drift**. A dump restored into a separate disposable database preserved a representative 90-day subscription fixture; migration deployment found no pending work and the restored schema also had no drift. This is a synthetic restore rehearsal, not a rehearsal on a production backup.

After verification, the server was stopped and the loopback listener was confirmed absent. The large download archive was removed. The owned binaries, stopped database and private metadata remain outside the checkout for later isolated verification; no test database service is left running.

The server inherited `Asia/Tashkent` as its database default timezone. Three existing Go accounting regressions initially failed, and a Node probe showed database-generated wall timestamps five hours ahead of UTC. Both connection pools now explicitly use UTC sessions, preserving Node's other connection options. The Node probe verified UTC database-generated timestamps across **eight concurrent pool connections**, including preservation of an application-name option alongside an earlier conflicting timezone option.

A separate real-database regression reproduced premature stale-session selection when a Go cutoff carried a non-UTC location. That query now binds the same instant in UTC. The rejoin fixture also supplies its canonical stored timestamp in UTC. These fixes keep the shared `timestamp without time zone` schema consistent with application UTC calculations; no stored timestamps are rewritten. PostgreSQL's timezone/type behavior is described in [the official date/time documentation](https://www.postgresql.org/docs/current/datatype-datetime.html), and Prisma supports connection-start options in [its PostgreSQL connector documentation](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql).

The allowance-period helper also uses one clock reading for start/end metadata. A regression that advances across UTC midnight reproduced a zero-length period before the correction and now passes.

The browser harness loads actual client components and styles with owned synthetic data and blocked external network requests. Its scope includes practice, paid/empty allowance, account, populated/empty/failed/queued history, search, mid-call rejoin, partner reconnect, microphone denial, connecting, ended, failed, pending retry and cancellation. Widths are 320, 375, 768 and 1440px. Keyboard checks exercise menu focus, arrow navigation, Escape focus restoration and microphone-dialog focus containment; reduced-motion checks inspect the waiting spinner. Provider behavior is intentionally not represented by this fixture.

Final browser results: **68 screen/viewport checks**, no horizontal overflow, no automated WCAG A/AA violations in the checked states and no collected browser errors. All four keyboard checks and the reduced-motion spinner check passed. Selected screenshots were inspected visually. These checks do not replace real-device audio or assistive-technology testing.

Local screenshots, the review gallery, machine-readable results and reproducible fixture are under `output/readiness-20261014/`. That directory is ignored by Git. Earlier `output/readiness-20261013/` probes retain the original observed defects and must not be presented as fix tests.

## Remaining release gates

1. Run the actual call journeys in the existing development deployment. The owner confirmed on October 14 that the documented deployment is development, Railway holds its provider configuration, pushing main deploys the development services, and two Telegram accounts/devices are available. This resolves the environment-identification question. The owner has since confirmed equal-band matching, correct-time reopen recovery with both voices, and playable recording/Telegram delivery for the tested two-account setup. See [the dated development observations](DEVELOPMENT_VALIDATION_2026-10-14.md); the remaining device and failure variants are separate open cases.
2. Finish the remaining real-provider cases in [the staging validation checklist](STAGING_READINESS_CHECKLIST.md), including audio/reconnect, microphone denial, recordings, delivery, retention, purchase/refund and provider ambiguity.
3. Finish combined Node/PostgreSQL/Redis integration, Redis-bound gateway checks and a supported Linux race run. Actual PostgreSQL and the Go recovery test are now verified locally; a production-backup migration rehearsal and historical timezone/data review remain separate release work.
4. Confirm historical credential-revocation and recording-reconciliation work independently. This implementation does not establish their completion.
5. Continue following the repository's `origin/main` process for authorized development publication and verify each frontend hosting build against the new main commit. The readiness corrections, Questions, reconnect window and UI follow-ups have now been published; active frontend versions and Railway successful statuses were checked separately from public health responses.

The provider, integration and historical gates above remain partly open. Ordinary development publication is verified; this does not establish launch readiness or production capacity. The owner subsequently clarified that the requested assessment concerns our backend code, assuming Railway's managed PostgreSQL and Redis are healthy. These broader release cases are evidence limits, not requests for the owner to certify Railway or prerequisites for continued development. See [the scoped backend assessment](BACKEND_READINESS_2026-10-14.md).

## Development validation handoff

The existing development deployment is the owner's selected environment for validation. Its bot is `ieltsSpeakBot`; the backend is the Railway service linked by this repository's commit status, and the three Cloudflare main-build triggers target the documented development frontends. The local primary-checkout `.env` contains placeholder configuration and is not evidence of Railway's live variables. Cloudflare build metadata and the Railway GitHub commit status can establish deployment revisions without exporting provider credentials. Microphone permission and audible two-way audio still require the two devices.

Environment confirmation does not authorize spending funds, deleting existing recordings or interrupting providers for destructive tests. Those checklist cases require owned disposable fixtures and appropriate test arrangements. Deployment and observed journey results will be recorded separately from the completed local checks.

## Recording delivery follow-up

The code assessment reproduced automatic duplicate sends after an accepted Telegram request lost its acknowledgement. Recording delivery now uses a durable SENDING claim, parks uncertain/interrupted attempts as UNCONFIRMED, accepts late confirmed receipts, and retries known failures without replaying unknown outcomes. History exposes truthful uncertain/rejected statuses. Legacy recordings use the same durable protection while retaining user-requested delivery. The implementation and verification evidence are in [Backend readiness](BACKEND_READINESS_2026-10-14.md). This is a code correction in the existing application, with no new infrastructure or schema migration.
