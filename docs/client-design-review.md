# Client design review — October 8, 2026

## Objective and references

Review the current client, identify weak design decisions, fix them individually, and bring the interface closer to the quality of OpenAI, Google and Anthropic while keeping PairTalk's logo, mint accent and responsive behavior.

The browser review used the [OpenAI website](https://openai.com/), [Anthropic website](https://www.anthropic.com/) and [Google Material typography guidance](https://m3.material.io/styles/typography/applying-type). The resulting direction is our interpretation: clear task hierarchy, restrained surfaces, readable type, a consistent app header, and deliberate use of accent color. No third-party brand assets, fonts or interface libraries were added.

## Findings and changes

| ID | What was weak | Why it mattered | Implemented correction |
| --- | --- | --- | --- |
| D01 | Marketing headlines on ordinary dashboard pages | Users had to read a slogan to identify their current task | Plain titles: Call history, Saved partners, Account, Upgrade and Invites & rewards |
| D02 | A floating Menu button below the header | Navigation looked disconnected and consumed another row | Menu now lives in the shared header; the accessible drawer and active destination remain |
| D03 | Green dashboard panels mixed with blue call panels | Related screens looked like different products | Shared charcoal surfaces, quiet borders and mint for primary actions and selected states |
| D04 | Repeated cards inside cards for every metric | Too many boxes competed with the values | Flat score and allowance groups; practice, referrals and account retain different task layouts |
| D05 | Tiny labels and overly bold, capitalized controls | Secondary information was difficult to scan | A clearer type scale, mostly 13–16px supporting text, normal-case controls and tabular numerals |
| D06 | Wide screens retained an oversized single-column call list | History required excessive scrolling and wasted horizontal space | Conversation details and actions share a row on larger screens, then stack on phones |
| D07 | Secondary actions had almost the same visual weight as primary actions | The next step was unclear | Neutral outlined secondary controls, a restrained primary fill and explicit destructive styling |
| D08 | Repeated payment and matching explanations | The same message appeared several times before users could act | Shorter practice/profile copy and removal of duplicate payment text |
| D09 | Plan chooser used glows, promotional badges, tiny specs and warning banners before options | Prices and allowances were buried | Readable plan comparison, explicit validity and allowance period, live catalog prices, and payment/refund details in a disclosure |
| D10 | Policy pages boxed nearly every paragraph and used long capitalized headings | Long documents were tiring to read | Plain document sections, actual h2 headings, shorter labels, larger body type and underlined links; policy body text retained |
| D11 | Access screens used alarmist and internal terminology | “Security lockdown” and “signaling server offline” did not help users recover | Specific, plain-language account/session/connection states, calmer icons and readable recovery information |
| D12 | Recovery instructions still named the removed Find Partner bot button | Users could follow an instruction that no longer worked | Instructions now match the backend's Open dashboard button |
| D13 | Dashboard navigation did not explicitly reset scroll position | A destination could open at the previous page's scroll offset | Navigation resets to the top; regression test covers it |
| D14 | Modal focus handling omitted summary controls and treated some hidden details links as focusable | The new payment disclosure needed correct Tab behavior in both states | Shared focus filtering handles native details/summary and hidden descendants; browser verification covers collapsed and expanded disclosures |
| D15 | Five fixed-width rating controls could exceed the narrowest content area | Narrow phones could develop horizontal scrolling | Rating columns can shrink within the card while retaining usable control height |

## Verification

The local browser harness renders the actual client components with synthetic account, catalog and call data. It does not bypass production authentication or contact Telegram, LiveKit or payment services.

The full screen sweep covers practice, active-session entry, allowances exhausted, populated/empty/failed history, saved partners and incoming invitations, referrals, leaderboard, account/DND, upgrades, ended/error states, delivery queued/sent states, searching, microphone/audio states, question fallback, guidelines, privacy and all access/recovery reasons. Main widths are 320, 375, 768 and 1440px. Additional checks cover 280px, the 1024px breakpoint and 1920px.

Final machine-readable results and screenshots are in `output/client-enterprise/`. Each record identifies its screen and measured browser width. The review gallery also includes selected captures from immediately before this design pass. These are comparisons with the preceding refinement pass, not the project's original design.

Final results: **184 screen/viewport checks**, **31 modal keyboard checks**, zero horizontal overflow and zero automated WCAG A/AA violations in the tested states. All **64 client regression tests**, the production build and lint passed. The keyboard checks cover Tab/Shift+Tab containment, Escape dismissal and focus/scroll restoration, including collapsed and expanded plan disclosures.

The screenshot gallery is `output/client-enterprise/index.html`; the bundle is `output/pairtalk-client-design-review.zip`. It contains 184 current captures, five preceding-pass screenshots for comparison, and the results JSON. Production provider behavior and assistive-technology testing are separate from this visual review.

### Completion audit

| Requirement | Authoritative evidence | Result |
| --- | --- | --- |
| Review the current design in the browser | Live local component review, current captures, reference websites inspected | Complete |
| List every identified weak design decision | D01–D15 above | Complete |
| Fix identified issues individually | Current component/style changes, revised copy and keyboard logic; tested rendered states | Complete |
| Apply the requested design direction to the client | Shared visual tokens, task titles, header/navigation, history/account/invite/upgrade layouts, plan comparison and policy/recovery screens | Complete |
| Preserve identity and responsive behavior | Existing PairTalk logo/mint accent; measured widths 280–1920px with full sweeps at four principal widths | Complete within verified scope |
| Verify the implementation | 184 browser checks, 31 keyboard checks, 64 tests, production build, lint and clean whitespace check | Complete |

Visual quality remains a judgment for the owner to review. These checks verify the implementation and tested states, not live payment settlement, provider availability, every assistive technology or every device. No new animation library, external font request or 3D runtime was added.

No database, deployment configuration, landing/admin interface or production access-control changes were introduced in this design pass. All changes remain local until explicitly published.

### Follow-up: action feedback and motion — October 8, 2026

The owner reopened the interaction review because the preceding pass still displayed success message boxes. The report says: “Rating, reporting, and saving a partner needs animation not a pop-up message.” The previous visual checks did not establish compliance with that requirement. This follow-up removes the visible success messages and verifies actions while requests are pending, after acknowledgement, and after failure.

| Requirement or defect | Implemented behavior |
| --- | --- |
| Success messages interrupt the workflow | No visible success banners or toasts. Screen readers receive quiet status announcements. Confirmation dialogs remain for saving, reporting and removal, as the report requests. |
| Rating gives weak feedback | The stars show a local waiting indicator, then fill in a short sequence only after a successful response. A rejected request leaves them unfilled and retryable. |
| Saved/reported state is unclear | Filled green heart and saved button, or reported button, remain visible in history. Acknowledged mutations stay reflected even if the subsequent history refresh fails. |
| Buttons do not show server progress | Saving, reporting, invitations, preferences, score editing, pagination, recording and microphone retry have local pending states. Duplicate submissions are blocked. |
| Audio confirmation can be misleading | Sending/queued/sent states are distinct. Sent appears only after acknowledgement. Bounded delivery polling restores a way to check again when delivery is still unconfirmed. |
| Links need copy controls | Invite, support, terms, privacy, pricing, refund, purchase and Telegram launch/access links have copy controls. The public-site logo remains ordinary navigation. Clipboard failure provides a selectable URL; older webviews get a compatibility fallback. |
| Motion is missing or disconnected from actions | Added page/card entry, modal/menu entry, press feedback, star and status-icon confirmation, score-value changes, DND changes, question changes and disclosure transitions. No routine action waits for an animation. |
| Recording timers can interfere with later actions | Managed request deadlines replace unmanaged timers. Matching acknowledgements clear the deadline, stop errors preserve the known recording state, and timeout errors remain beside the control. |
| Overlapping fades briefly reduce contrast | Page/card/value entry now uses position changes that keep text readable. The modal backdrop transitions independently. |

Verification: **77 client tests passed**, along with lint and the production build. The added tests cover delayed acknowledgements, duplicate presses, failed ratings, refresh failures, audio polling, exact clipboard values, clipboard fallback/denial, changed copy URLs, recording acknowledgements/errors/timeouts, and failed microphone retries.

The final targeted browser sweep contains **52 screen/viewport checks** at 320, 375, 768 and 1440px. There are also **26 captured interaction states** covering pending/completed/failed actions, copying and reduced motion. No horizontal overflow or automated WCAG A/AA violations were found in those final captures. The plan dialog was checked again for backward/forward focus wrapping and Escape focus restoration after adding its copy controls.

Motion verification inspected the rendered loading animation and pending state before acknowledgement. Reduced-motion declarations were extracted from the actual stylesheet and exercised in the local fixture: the spinner, page and card animations were `none`, and button transitions were `0s`, while the waiting text remained visible. This does not claim a real device's operating-system preference was changed or tested.

Current evidence is in `output/client-actions/results.json`, `interactions.json` and the screenshot gallery `index.html`. The earlier `client-enterprise` gallery records the preceding design pass. The previews use synthetic data and mocked responses, including intentionally slow and failed requests. Live Telegram delivery, microphone permissions and provider settlement still require production testing. This follow-up changes the client interface and its tests; it does not deploy or publish the code.
