# Designer implementation record

The design source is the supplied `pairtalk-preview (1).zip` and its [DESIGN.md](../DESIGN.md). Section 11 contains the latest client decisions and supersedes the earlier client layouts. The HTML preview is a design reference; its accounts, plans, prices, statistics, payment outcomes and audit entries are demonstration data.

Implementation order is client, landing, admin. Each surface must pass its functional checks and rendered review before implementation starts on the next surface.

## Client

Implemented: shared designer palette and Manrope type, centered Mini App, two-metric dashboard and circular call starter, right drawer with separate Upgrade card, compact history with persistent saved/reported marks, server-confirmed rating animation, bottom sheets with report choices and optional details, inline live Upgrade plans, limits-first Account, score steppers and calculated overall, DND ring, separate Invites and Hall of Fame, call navigation lock, call/search/state/policy styling, keyboard focus and reduced motion.

The existing Telegram authentication, signed dashboard requests, LiveKit lifecycle, public plan feed and recording delivery confirmation remain in use. The report endpoint accepts bounded optional details. Qualifying referral totals now count all rewards, independently of the five recent reward rows. Six additional light-theme audits of the menu, score sheet, save/report sheets, confirmed history and call question drawer pass without WCAG A/AA violations.

Verified: 78 client tests, production build, lint, server TypeScript check, and 30 focused report/referral tests. The final browser review covered 60 dark-theme screen/viewport combinations (320, 390, 640 and 1440 pixels) and 45 light-theme combinations (320, 390 and 1440 pixels), with no browser errors or horizontal overflow; the 390-pixel accessibility audits reported no WCAG A/AA violations in either theme. Drawer, score, history rating, save, report, audio confirmation and question drawer interactions were also exercised. Browser screenshots and fixture results are under ignored `output/client-design-check/`. Fixtures exist only in the ignored preview harness; they are not bundled into the application.

## Landing

Implemented the designer's public layouts, header/footer, paired voices, ordered steps and practice timeline, prompt switcher, alias/safety layout, ticket-stub Free card, grouped FAQ, plan finder/cards, community charts, document rail, both themes and dedicated Refund policy. The published pricing/statistics feeds, metadata, prerendering and Markdown exports remain connected; no sample totals or prices ship in production.

Verified: production build, three Markdown tests and the complete metadata/link/schema/sitemap checks for 12 HTML and 11 Markdown pages. Browser review covered 72 route/theme/viewport combinations (320, 390 and 1440 pixels) plus 18 focused combinations after final polish, with no browser errors, overflow or reported WCAG A/AA violations. Navigation/Escape, prompt switching, currency persistence and API-unavailable states passed. Evidence is under ignored `output/landing-design-check/`.

## Admin

Implemented: shared palette and Manrope, grouped Operations/Finance/Review sidebar, health-first Overview, learner tables and controls, question tables and custom dropdowns, contest wizard, published-plans-first editor with draft banner, payment/refund review, appeals, analytics and audit details. Both themes use semantic status colors. Confirmations identify the affected learner or payment and include audit notes; appeal notes now reach the server audit record. Keyboard focus, Escape, 44-pixel button targets and reduced motion are supported.

Verified: production build and lint (one existing Fast Refresh warning in `AuthContext.tsx`). The final main-page review covered 58 screen/theme/viewport combinations, including password and OTP sign-in, all nine sections at 390, 1024 and 1440 pixels, dropdown and appeal confirmation. A further 38 checks covered both themes in learner controls, moderation confirmation, payment approval/failure, refund proof requirements, question/cue-card/topic editing, crawler and import views, all four contest steps, audit details and plan draft/failure states. Sixteen focused combinations passed again after the final copy polish. These checks reported no browser errors, horizontal overflow or WCAG A/AA violations. Failed requests preserve entered values; closing a dropdown with Escape keeps its parent dialog open. Evidence is under ignored `output/admin-design-check/`. Browser mutations use a loopback fixture server, not production credentials or accounts.

## Integration

Implemented the section 11 bot changes: plan allowances link to the web instead of appearing in checkout, `/terms` sends only the reviewed PDF without changing registration state, and refund-policy buttons open `/refund-policy`. Registration still stores durable consent; a replayed Decline cannot undo completed registration. The dedicated refund page retains the reviewed policy and explains the bot command.

Final regression verification: all 853 server tests in 84 files and all 78 client tests in 12 files pass. Server TypeScript checking and all three frontend production builds pass. Landing checks confirm 12 HTML pages, 11 Markdown exports, metadata, schema, links and sitemap, with three Markdown tests passing. Production plan feeds, Telegram authentication, voice lifecycle, recording delivery and administrator API calls remain connected to the existing implementations.

## External checks

Local browser fixtures verify rendering and UI interaction. Real Telegram on iOS/Android, two-device voice calls, provider recording delivery and production administrator actions require device/provider smoke checks; fixture results do not certify them.

## Motion and template follow-up

The supplied CSS and JavaScript were audited against the production components. The follow-up adds the missing drawer and bottom-sheet entry/exit, staggered rating followed by header acknowledgement, save/report button departure and mark pop, confirmation-before-row-collapse, drawn clipboard check with reset, score and DND acknowledgement, recording spinner and transient delivery popover, invitation acknowledgement reset, FAQ expansion, admin dialog entry, plan acknowledgement chip and newly fetched audit-row entry. These effects follow actual request acknowledgement; the prototype's simulated network delays are not used to report success.

Closing client overlays remain inert during exit. Rapid reopening cancels a scheduled removal. Reduced motion removes transition delays. The call waveform uses the reference's 24 mint/peach bars, rests at 30% height without audio, and samples real levels during calls. Reduced motion freezes the visualizer. Delete and Report confirmations use crimson outlines. Invites now show total bonus granted, and Hall of Fame contains the leaderboard without a separate contest heading.

Component props and states are documented in DESIGN.md section 12. The complete ZIP reference, including its original DESIGN.md, is also retained unchanged in the personal `artifact-template-pairtalk` skill. A local static Sites project configuration and build script package the supplied files; no hosted Site was registered or published.

Follow-up verification: 85 client tests in 14 files pass, including acknowledgement-before-deletion, deletion failure, overlay reopening and reduced-motion waveform checks. Client build and lint pass. Admin build and lint pass with the same existing AuthContext Fast Refresh warning. Landing build, three content tests and all generated-page checks pass. Browser checks cover six client interaction/accessibility states after animations settle, 18 landing theme/viewport combinations, FAQ exclusivity, keyboard activation, rapid reversal and reduced motion in both themes, and 38 admin interaction states. The reviewed states report no browser errors or accessibility failures. Evidence is in ignored `output/*motion*.log` files.

## Interface polish and public routing

The October 12 review replaces the client drawer and landing mobile navigation with compact anchored menus. Admin selects use retained popovers, a viewport-aware position, subdued option hover, a selected check, multi-letter search, disabled-option skipping and keyboard navigation. Panels close smoothly, become inert during exit, cancel pending removal when reopened, and flip upward when needed. Native admin dialogs now retain their final content during exit and restore focus synchronously; reduced motion releases the dialog immediately.

Emoji labels were removed from the web interfaces. Button hover and pressed states use short explicit transitions. Rating acknowledgements retain readable text during motion, and the light-theme label contrast is corrected. Large overshoots were replaced with small scale changes. Client and admin Manrope fonts are served with their builds, including the SIL license, so rendering does not wait on an external font stylesheet.

The landing browser reads `/api/public/plans` and `/api/public/stats` from its own origin. Both Vite and the production Worker use the same limited proxy and the existing public data validators. Only GET and HEAD are accepted; credentials and query parameters are not forwarded. HTML fallbacks, redirects, malformed or oversized responses, and unavailable upstreams produce dated-independent JSON errors with a retry hint. Prices are not cached. Unknown API paths return JSON 404 responses rather than site HTML. The backend remains intentionally offline during development; no deployment or backend restart was performed.

Verification: 96 client tests pass, with focused motion, dropdown and public proxy tests rerun after fixes. All 23 focused backend public endpoint tests pass. The three frontend builds, landing generated-page checks and three content tests pass. Worker type checking and deployment dry-run pass. Client lint is clean; admin lint retains only the existing AuthContext Fast Refresh warning. Browser checks pass for seven dropdown scenarios, six client interaction/accessibility states, 18 landing theme/viewport combinations, FAQ motion and rapid reversal in both themes, and 38 admin interaction states. Local public endpoints correctly return JSON 503 while the upstream is offline. Evidence is retained under ignored `output/` paths.
