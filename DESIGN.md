# PairTalk — DESIGN.md

Source: 237 screenshots captured 2026-10-09 from commit `d4e3a1c` (landing 54, client 129, admin 54), synthetic sample data.
Colors marked **observed** were sampled from pixels. Colors marked **proposed** are recommendations. Fonts are **inferred** from rendering (no CSS in the archive), so confirm them against your source before locking them.

---

## 0. Paste-ready prompt (Google Stitch / any design tool)

> Design a unified visual system for **PairTalk**, a Telegram-based IELTS Speaking peer-practice service. Three surfaces share one brand: a public **landing site** (10 routes + 404, light and dark), a **client Mini App** inside Telegram (mobile-first, 390px, also 1440px), and an **admin operations console** (laptop 1440px, dark).
> **Feel:** calm, precise, trustworthy; closer to a well-run language institute than a startup toy. Quiet surfaces, one confident accent, generous but disciplined spacing. Warm in copy, strict in structure.
> **Palette:** teal-tinted ink neutrals (`#111B1D` base, `#152225` band, `#1A2729` card), one signal mint `#8DE6C3` (pressed `#5BD4B6`), coral/peach `#FFDDCE` only as the "other speaker" color, crimson `#BE3453` for end-call/destructive, amber `#FFD230` for time warnings. Light theme: cool paper `#F4F7F5`, ink `#101A24`, forest `#225B47` for accent text.
> **Type:** one geometric sans (Manrope-style) at weights 500–700, tight tracking on display sizes, tabular figures for timers and numbers. Sentence case everywhere.
> **Signature element:** the **paired voices**: two round/squircle initials (A mint, B peach) joined by a two-tone waveform. Use it in the hero, in the call screen, and as the loading/search motif. Everything else stays quiet.
> **Components:** mint filled CTA with dark ink text, segmented controls, plan cards with Stars/UZS toggle, ticket-stub "Free" card, FAQ accordion, call screen with large timer and a 3-button control bar (Mute, Record, End call), practice-prompt drawer (Part 1/2/3), icon-tile empty/error states, admin sidebar with grouped nav and count badges, dense tables, confirm dialogs with audit-note field.
> **Constraints:** WCAG AA, 44px touch targets, visible focus rings, reduced-motion respected, no all-caps eyebrow above every heading, no decorative gradients.

---

## 1. Audit of the current system

Score: **62 / 100**. The brand is recognizable and the state coverage is excellent (loading, empty, error, access, recovery, dialogs for every flow). The weakness is that three surfaces were built as three systems.

### Token coverage
| Category | Finding |
|---|---|
| Neutrals | **Three different dark bases.** Landing `#111B1D` (teal-tinted), client `#111315` (neutral), admin `#0B0F14` / `#141B23` (blue-slate). Same product, three blacks. |
| Accent | **Two mints.** Landing `#8DE6C3`; client/admin buttons `#5BD4B6`. |
| Warning | **Two ambers + an orange.** Client timer `#FFD230`, admin badge `#F59E0B`, prep button bright orange. |
| Admin chips | Blue, purple, amber, green, red used as unlabeled category colors with no stated meaning. |
| Light theme | Landing only. Client and admin are dark-only. |
| Type | Landing uses a geometric display sans; client/admin render in a system UI stack. |

### Naming and copy consistency
| Issue | Where | Fix |
|---|---|---|
| Same person is "partner", "learner", "candidate" | Client search: "looking for a **candidate**"; admin nav "Candidates"; landing "partner" | **Partner** during a call, **learner** in community/stats, drop "candidate" from learner-facing UI |
| Alias format differs | Landing "River"; client "P2P-RIVER" | Show the friendly alias ("River"); keep the `P2P-` ID in admin only |
| Title Case actions | "Cancel Matchmaking", "Find Next Partner", "Upgrade Plan & Get Credits", "Approve Payment & Fulfill Plan" | Sentence case: "Cancel search", "Find next partner", "See plans", "Approve payment" |
| "Credits" vs "calls" | Upgrade button says credits; plans sell calls | Say **calls** everywhere |
| Nav label vs page title | Landing nav "Compare prices", page "Compare plans" | One name: **Plans** |
| Native `<select>` | Score dialog, report dialog | Replace with the system's custom select; native arrows break the visual language |

### Component completeness
| Component | States | Variants | Docs | Score |
|---|---|---|---|---|
| Button | ✅ | ✅ | ❌ | 7/10 |
| Card / panel | ✅ | ⚠️ three radius families | ❌ | 6/10 |
| Dialog / drawer | ✅ | ✅ | ❌ | 8/10 |
| Empty / error / access state | ✅ | ✅ | ❌ | 9/10 |
| Form field | ⚠️ | ⚠️ native selects | ❌ | 5/10 |
| Table | ✅ | ⚠️ admin only | ❌ | 6/10 |
| Badge / status chip | ⚠️ | ❌ no semantic map | ❌ | 4/10 |

### Landing "tells" to retire
These patterns read as templated, and they work against the "professional / enterprise" goal:
1. An **all-caps tracked eyebrow above nearly every heading** ("A SPACE TO SPEAK, NOT JUST STUDY", "LESS SEARCHING. MORE SPEAKING."). Keep one only where it carries information (e.g. a breadcrumb or category).
2. **Every H1/H2 ends in a mint second line.** Use the accent line once on the hero, not on every section.
3. **Duplicated taglines.** "Your level. Your focus." appears as a floating chip, a card caption, and a step label. Say each thing once.
4. **Arrow glyphs on every link and button** (↗ and →). Reserve ↗ for links that leave the site.
5. **Warm cream light theme** (`#F7F5EF`). It is a very common default. A cooler paper tone feels more institutional.
6. **Numbered markers** are fine on "How it works" (a real sequence) and wrong anywhere else.

---

## 2. Design direction

**Concept: a quiet room for two voices.** The product is two people speaking. The interface should get out of the way, be exact about time, limits and safety, and let a single motif carry the personality: **paired voices** (two initials, one two-tone waveform).

**Spend boldness in one place:** the paired-voices motif and the large call timer. Everything else (cards, tables, nav) stays calm and disciplined.

**Keep from today:** the mint-on-ink identity, the squircle initial avatars, the "ticket stub" Free card with side notches and dashed divider, the honest stats page with definitions, the plan-finder calculator, the icon-tile access/error states.

---

## 3. Tokens

### 3.1 Color — dark theme (default for client and admin)
| Token | Hex | Status | Use |
|---|---|---|---|
| `ink-950` | `#0B1214` | proposed (replaces `#0B0F14`) | sunken areas, code blocks, call control bar |
| `ink-900` | `#111B1D` | observed (landing) | page background |
| `ink-850` | `#152225` | observed | alternate section band |
| `ink-800` | `#1A2729` | observed | cards, panels |
| `ink-700` | `#2E3B3B` | observed | borders, dividers |
| `forest-800` | `#19312A` | observed | highlighted band (Free / pricing), selected nav item tint |
| `text-primary` | `#EDF3EF` | observed | headings, body |
| `text-secondary` | `#A9B8B5` | proposed | supporting text (≥ 8:1 on `ink-900`) |
| `mint-400` | `#8DE6C3` | observed | primary CTA fill, accent text on dark, focus ring |
| `mint-500` | `#5BD4B6` | observed (was the client's button color) | pressed/hover state of primary |
| `peach-200` | `#FFDDCE` | observed | the "other speaker" (avatar B, second waveform tone) |
| `danger-600` | `#BE3453` | observed | End call, destructive fill |
| `danger-300` | `#FDA4AF` | observed | recording-on label, error text on dark |
| `warning-400` | `#FFD230` | observed | last-minute timer, warnings |
| `info-400` | `#4381BD` | observed (admin) | informational chips, links in admin |

Contrast (measured): mint on `ink-900` 11.9:1; ink text on mint button 11.9:1; white on End-call crimson 5.3:1; amber on base 12.9:1; recording pink on base 9.9:1.

### 3.2 Color — light theme
| Token | Hex | Status |
|---|---|---|
| `paper-50` | `#F4F7F5` | proposed (observed today: `#F7F5EF` cream) |
| `paper-100` | `#E9EFEC` | proposed (observed: `#EEEEE6`) |
| `paper-0` (card) | `#FFFFFF` | proposed (observed: `#FFFDFA`) |
| `mint-wash` | `#E6F0E7` | observed (highlighted band) |
| `ink` (text) | `#101A24` | observed |
| `forest-700` (accent text) | `#225B47` | observed, 7.25:1 on cream |
| `mint-400` (fills only) | `#8DE6C3` | observed |

**Rule:** mint is a *fill* on light backgrounds, never text (1.35:1). Accent text on light is `forest-700`.

### 3.3 Semantic mapping (fixes the admin "rainbow chips")
| Meaning | Color | Examples |
|---|---|---|
| Positive / active / completed | mint | Active, Completed, Verified, Healthy |
| Pending / needs review | amber | Pending payment, Pending appeal, Warned |
| Negative / blocked | crimson | Rejected, Banned, Reported |
| Informational / neutral | info blue or `ink-700` | Plan name, Part 1, Taxonomy |
| Premium tier | one accent only (use `peach-200` or `info-400`) | Pro, Boss |

### 3.4 Typography
| Role | Family | Notes |
|---|---|---|
| Display + UI | Geometric sans, Manrope-style (landing, **inferred**) | One family across all three surfaces. Weights 500 / 600 / 700. Enable tabular figures for timers, prices, tables. |
| Code / commands | System monospace | `/appeal <your explanation>`, order IDs, invite links |

Type scale (approximate from 1440 captures; confirm against CSS):
| Style | Desktop | Mobile | Weight | Tracking |
|---|---|---|---|---|
| Display (hero) | 80 / 84 | 44 / 46 | 600 | −0.03em |
| H1 (page) | 64 / 68 | 40 / 44 | 600 | −0.025em |
| H2 (section) | 44 / 48 | 30 / 34 | 600 | −0.02em |
| H3 (card) | 24 / 30 | 20 / 26 | 600 | −0.01em |
| Body L | 18 / 28 | 16 / 26 | 400 | 0 |
| Body | 16 / 26 | 15 / 24 | 400 | 0 |
| Small | 13 / 20 | 13 / 20 | 500 | 0 |
| Timer (call) | 56 / 60 | 48 / 52 | 600 tabular | −0.02em |
| Label | 12 / 16, sentence case | | 600 | +0.01em |

Line length ≤ 70 characters in the speaking guide, privacy and terms. Headings in sentence case.

### 3.5 Space, shape, elevation, motion
- **Grid:** 8pt base (4, 8, 12, 16, 24, 32, 48, 64, 96). Landing content max-width ≈ 1240px with ≈ 100px side margins at 1440; section padding 96 desktop / 64 mobile.
- **Radius (three, not five):** `r-sm` 8 (inputs, chips), `r-md` 12 (buttons, controls), `r-lg` 20 (cards, dialogs). Avatars use a 30% squircle. Pills are fully round.
- **Elevation:** flat by default (1px `ink-700` border). One shadow for floating layers (dialog, drawer, hero preview card): `0 24px 48px -16px rgba(0,0,0,.45)`. No shadow on resting cards.
- **Motion:** one orchestrated moment per page (hero waveform settles on load). Response motion only: dialog open/close 160–200ms, accordion 200ms, tab switch 120ms. Search ring pulse is the only looping animation; stop it under `prefers-reduced-motion`.

---

## 4. Components

### Button
| Variant | Use | Look |
|---|---|---|
| Primary | One per view: Start speaking, Start speaking practice, Save speaking scores | `mint-400` fill, `ink` text, 12px radius, 48px tall (mobile 52) |
| Secondary | Compare plans, Edit scores | 1px `ink-700` border, text-primary |
| Tertiary link | See how it works | Text + underline on hover; ↗ only for external |
| Destructive | End call, Reject, Submit report | `danger-600` fill (End call) or crimson outline (report, reject) |
| Call control | Mute, Record, Stop | 3-up tiles, icon above label, 56px tall, in `ink-950` bar |

States: default, hover (`mint-500`), pressed, focus (2px `mint-400` ring, 2px offset), disabled (40% opacity, no pointer), loading (spinner replaces icon, label stays, width fixed).

### Paired voices (signature)
Two 56px squircle initials (A on mint-wash, B on `peach-200`) with a centered two-tone waveform (mint + peach bars, 24 bars, 3px wide, 2px gap). Live variant: bars animate with each speaker's level. Idle: static at 30% height (the call screen's dotted bars today). Search variant: concentric rings with a single orbiting dot (already in the client).

### Alias chip
Squircle initial + "Your practice alias" label + name + shield icon. Show **River**, not `P2P-RIVER`. Always paired with "Your partner sees your alias, not your Telegram profile."

### Cards
- **Content card:** `ink-800`, 1px border, 20px radius, 24–32px padding.
- **Ticket-stub card** (Free plan): side notches, dashed divider, "Free" at display size. Use only here.
- **Plan card:** title, one-line promise, price (Stars + UZS), four allowance rows, CTA. The recommended plan gets a `mint-400` 1px border and a "Current" or "Fits your routine" tag.
- **KPI tile (admin):** label (small), value (H3), optional trend. 5–6 across at 1440.

### Segmented control
Used for Part 1 / 2 / 3, Stars / UZS, and admin All / Active / Warned / Blocked / Banned. Selected: `ink-800` fill + mint text + 1px border. Min 44px tall.

### Form fields
56px tall inputs, 12px radius, label above (not placeholder-as-label), helper text below, error text with icon in `danger-300`. **Replace native selects** (score and report dialogs) with a styled listbox. Number inputs in the plan finder keep their inline unit labels.

### FAQ accordion
Full-width rows, 1px dividers, `+` / `–` indicator on the right, one open at a time on mobile. Question text H4, answer body.

### Call screen
```
┌──────────────────────────┐
│ pairtalk.        Questions│
│                           │
│     Time in conversation  │
│          02:05            │  ← timer, tabular
│       12:55 remaining     │  ← turns amber under 1:00
│  ┌─────────────────────┐  │
│  │      ( River )      │  │
│  │ Band 7.0 · Partner  │  │
│  │ ●●●● waveform ●●●●  │  │
│  │ Recording note      │  │
│  └─────────────────────┘  │
│ ● No room recording       │
│ [Mute] [Record] [End call]│
└──────────────────────────┘
```
States to keep: waiting/connecting, active, muted, recording on (pink status + Stop), recording error, reconnecting, last minute (amber), audio-unlock, microphone permission. The recording indicator must never rely on color alone (dot + words).

### Practice-prompt drawer
Header "Practice prompts", Part tabs, topic chips, "Question 1 of N", the cue card with "You should say" list, **Exam prep timer** (use `warning-400`, not bright orange), Previous / Next. On mobile it covers the call above the control bar so Mute / End call stay reachable.

### Dialog
Title, one sentence of consequence, fields, actions right-aligned (Cancel left of primary). Destructive dialogs name the object ("Approve payment #A123 for River, 25,000 UZS"). Admin approvals include an optional **Audit note** field. Focus trapped, Esc closes, focus returns to trigger.

### State screens (empty / error / access)
Pattern already strong; formalize it: icon tile (64px) → status pill → H2 (what happened) → one sentence (what to do) → one primary action → optional secondary. Covers: registration required, terms required, call allowance reached, restricted, suspended, rate limited, server unavailable, browser opened directly, auth rejected, no initData, connection error ("Let's reconnect."), call ended, empty history/partners/hall of fame. Never apologize; always say the next step.

### Admin shell and table
- Sidebar ≈ 240px: grouped **Operations** (Overview, Learners, IELTS questions, Contests), **Finance** (Plans and limits, Payments), **Review** (Appeals, Analytics, Audit history). Count badges in amber.
- Top bar: breadcrumb left, Sign out right. Page header: H2 + one-line purpose + Refresh.
- Tables: 48px rows, sticky header, left-aligned text, right-aligned numbers, row actions as icon+label buttons colored by *meaning* (approve = mint, reject = crimson, others neutral).
- Health strip (Database, Redis, Voice service, Telegram bot) with latency, always at the top of Overview.

---

## 5. Screens and layout rules

### Landing (10 routes + 404, light/dark, 1440 and 390)
Home, How it works, IELTS speaking guide, Pricing (+ UZS view), Stats ("Our community"), FAQ, Safety, Community guidelines, Privacy, Terms.
- **Header:** logo, 4 links (How it works, Speaking guide, Community, Plans), theme toggle, primary CTA. Mobile: hamburger with full-height sheet.
- **Home order:** hero → proof strip → how it works (3 steps, numbered because sequential) → practice prompt demo → safety/alias → free plan stub → FAQ → final CTA.
- **Hero:** left-aligned text, paired-voices preview on the right, **one** primary CTA plus one text link. Replace the "Illustrative preview" card with a real app screenshot or short recording as soon as possible.
- **Document pages** (guide, privacy, terms, guidelines): breadcrumb, H1, sticky "On this page" rail at left, 70-character column, callout with 2px left border for practice questions, section numbers only if the content is ordered.
- **Pricing:** plan finder (calls, minutes per call, recordings, retention) → recommended plan sentence → 4 plan cards (Free, Plus, Pro, Boss) → comparison table. Stars / UZS toggle persists. Show "Prices checked <date>".
- **Stats:** headline numbers, six-month bar chart with an accessible data table beneath it, ratings distribution, "What the numbers mean" definitions. Keep the plain-language honesty; it is a trust asset.
- **Light/dark:** both are first-class. Test every screen in both.

### Client Mini App (390 mobile first, 1440 desktop)
Practice (home), Partner search, Calls, History & audio, Saved partners, Invites & rewards, Hall of Fame, Account, Upgrade, Guidelines, Privacy.
- **Header:** logo left; right pill changes with context (Menu → Questions → Partner search → Account access). Keep the logo as the only constant.
- **Practice home:** H1 "Ready for a conversation?", one primary CTA, microphone hint, "Your practice space" card (alias, target band, calls available, recordings, audio retention).
- **Menu:** slide-in sheet with Practice, History & audio, Partners, Invites, Hall of Fame, Account, Upgrade. Selected row uses `forest-800` tint.
- **Back pattern:** "← Back to practice" above every secondary page title.
- **Telegram constraints:** respect the safe-area insets; use Telegram's theme color for the header; payments stay in the bot ("Complete your payment in Telegram").
- **Desktop 1440:** center a single 560–640px column; do not stretch cards.

### Admin console (laptop 1440, dark)
Sign-in (password → OTP), Overview, Learners, IELTS questions (Questions, Cue cards, Topics, Crawler, Bulk import), Contests (setup wizard, active, ended), Plans and limits, Payments (Pending receipts, Refund requests, Payment history), Appeals, Analytics, Audit history, Runtime errors.
- Density: 13–14px body, 40–48px rows. Use the same tokens as the client; only the layout is denser.
- **Plans and limits:** show the published table first ("Published to PairTalk"), then four edit columns. Mark unpublished drafts with an amber "Draft" banner. Long labels like "Calls per billing period (999+ means unlimited)" become label + helper text.
- **Safety-critical actions** (approve payment, refund, unban) always open a confirm dialog with the object, the effect, and an audit note.

---

## 6. Content and voice
- **Tone:** warm, plain, specific. Say what happens: "Save speaking scores", "Find next partner", "End call".
- **Sentence case** in every heading, button, nav item and chip.
- An action keeps its name through the flow (Save partner → "Partner saved").
- Errors say what happened and the next step, never "oops": "Connection took too long. Check microphone permissions and your network, then retry."
- Safety copy is concrete: alias, not Telegram profile; leave any time; report afterwards; agree before recording.
- Never promise a score. Keep the independence disclaimer ("not affiliated with IELTS, British Council, IDP or Cambridge") in the footer and in the guide.

---

## 7. Accessibility floor
- AA contrast on every text/background pair; 44px minimum targets (call controls ≥ 56px); 2px visible focus ring on all interactive elements.
- Timers announce changes at 5:00, 1:00 and 0:10 only (`aria-live="polite"`), not every second.
- Recording state conveyed by text + icon + color.
- Charts have a data table; decorative waveforms are `aria-hidden`.
- `prefers-reduced-motion`: stop the search ring and waveform animation.
- Skip link on all surfaces (already present on landing and admin).
- Test inside Telegram's in-app browser on iOS and Android, not only Chrome.

---

## 8. Do / Don't
| ✅ Do | ❌ Don't |
|---|---|
| One primary action per view | Two filled mint buttons side by side |
| Use `forest-700` for accent text on light | Put mint text on cream or white |
| Use the paired-voices motif as the hero, call and search visual | Add new illustration styles |
| Map status colors by meaning | Use a different chip color per category |
| Show "River" to learners | Show `P2P-RIVER` outside admin |
| Replace native selects | Mix native and custom controls in one dialog |
| Keep Stars and UZS side by side on pricing | Hide the UZS price behind a toggle only |

---

## 9. Priority actions
1. **Unify tokens** across landing, client and admin (one ink scale, one mint, one amber, three radii).
2. **Fix terminology and casing** (partner/learner, alias, sentence case, "calls" not "credits").
3. **Replace native selects** and document all form fields.
4. **Define the status-chip color map** and apply it in admin.
5. **Trim landing templating:** one eyebrow per page at most, mint second line on the hero only, one tagline per idea.
6. **Replace "Illustrative preview"** with a real product screenshot or recording.
7. **Ship a cool paper light theme** and re-verify contrast.
8. Document Button, Card, Field, Dialog, Chip and Table in this file with props and states once tokens are locked.

---

## 10. Open questions
- What fonts are actually loaded? (Landing looks like Manrope; client and admin render as a system UI stack.)
- Is the light theme going to extend to the client and admin, or stay landing-only?
- Is the `P2P-` alias prefix a product requirement or a leftover from internal naming?
- Do you want the plan names (Free / Plus / Pro / Boss) kept, or renamed for a more institutional tone?
- Is "Hall of Fame" a permanent feature or a campaign page?

---

## 11. Round 2: decisions from the test report

These decisions come from the owner's test report. **Where this section disagrees with sections 1 to 10, this section wins.** Superseded: the "show River, not `P2P-RIVER`" rule (the app now shows the real `P2P-XXXXX` alias exactly as the owner specified), the old practice home, the tab-style navigation, the account layout, and the call-history card.

### 11.1 Principles that came out of the report
1. **Less on every screen.** If a learner does not need it to act, it is not on the page.
2. **A link lives where it is needed, once.** No link rows or "Payments in Telegram" buttons scattered across pages.
3. **Answer an action on the thing that was touched.** No top-of-page banners or toasts. Use motion on the element: stars fill, a heart pops in, a row collapses, a button turns into a check.
4. **State must stick.** If a partner was saved yesterday, the UI says so today.
5. **Every secondary page has a way back.** A "Dashboard" back control plus the navigation drawer.
6. **Buttons never touch.** Use `.btn-row` (side by side, 12px gap) or `.btn-stack` (full width, 12px gap).
7. **A call cannot be left by wandering.** No menu, back link or external link during a call.

### 11.2 Client app (all built in `app.html`)
| Report item | Decision |
|---|---|
| Dashboard shows too much | Only **Target band**, **Calls available** and one **circular "Find a partner"** call starter. Limits sit at the top. The "Speaking practice" pill is gone. |
| Navigation bar wraps and looks bad | A **hamburger opens a right-side drawer**: Practice, History & audio, Partners, Invites, Hall of Fame, Account. A separate **Upgrade card** sits at the bottom of the drawer. |
| Footer clutter | One line only: `© PairTalk 2026. All rights reserved.` No version, no links. |
| "Report submitted." and "Partner removed." banners | Removed. Replaced by motion on the element (see 11.3). |
| "Your rating" label | Removed. Stars fill, stay, then collapse into the header as `P2P-XXX12 – 4/5 ★`. |
| Saved partner looks unsaved the next day | Saved and reported state persists and is shown as ♥ and ⚠ marks on the card. Marks open a popover explaining themselves ("You saved this partner", "You reported this partner"). |
| Delete partner has no second thought | Confirmation sheet: "Are you sure you want to delete P2P-XXX12? This action cannot be undone!" with **No / Yes, delete**. The row then collapses out. |
| Hall of Fame merged with invitations | Two pages. **Invites** has the link, total invites, bonus granted, bonus pending, and the rule. **Hall of Fame** has the leaderboard only. |
| "Available until Jan 1, 1970" | Bonus calls **never expire**, so no date is shown. A null or missing date must never be formatted as a date. |
| Giant band scores, hidden limits | **Limits first**, big. Scores are one compact row: `FC · LR · GRA · P · O`, with an **Edit** button that opens a stepper sheet. O (overall) is calculated. |
| Do not disturb checkbox | A **ring with "DND" inside**: **yellow = off, red = on**. Tap to toggle. |
| "Payments in Telegram" and stacked buttons | Removed. **Upgrade** is a drawer section and its own page. On Account, an Upgrade button shows **only on the Free plan**. Only the plan buttons say "Pay in Telegram". |
| Cannot get back to the dashboard | Every secondary page shows **← Dashboard** and the drawer button. |
| Leaving a call | The call screen has **no hamburger, no back, no links** and shows "Navigation is locked until the call ends." |

### 11.3 Call history card (new spec)
```
Oct 7, 2026 – 14m 25s
P2P-RV482 – 2/5 ★                          ♥  ⚠      ← only when saved / reported
```
Unrated:
```
Oct 6, 2026 – 10m 22s
P2P-SK917
[★][★][★][★][★]
How was your call?
[ Save ] [ Report ] [ Download ]
```
- Rating: stars fill one by one, the row collapses, `– N/5 ★` appears in the header.
- **Save** and **Report** each open their own bottom sheet. Report requires a reason. After confirming, the button leaves and the ♥ or ⚠ mark pops in.
- **Download** sends the audio to the learner's Telegram chat through the bot. The button shows a spinner, then **"Sent ✓"** in a small popover. No separate banner.
- Only actions still available are shown (a saved partner has no Save button).

### 11.4 Bot behavior (not built in this preview; needs your bot code)
1. **Payments only.** The bot does not show plan details. Plans and limits live on the web (`/pricing` and the in-app Upgrade page).
2. **`/terms` sends the PDF and nothing else.** No Accept or Decline buttons. Terms are accepted once, at registration, and that acceptance is stored. Declining must never end a registration that already completed.
3. **"View refund policy" opens `https://pairtalk.online/refund-policy`**, the dedicated page, not the full terms.
4. Refund requests are made with the refund command in the bot (stated on the refund page).

### 11.5 Admin console
Every section now has sample data: Overview, Learners, IELTS questions, Contests, Plans and limits, Payments, Appeals, Analytics and Audit history. Actions are connected: approving a payment or an appeal, or publishing a plan, adds a row to Audit history.

### 11.6 Landing
Treated as **polish only**, as requested (7/10). Changes made: a dedicated Refund policy page, a Refund policy link in every footer, and the pricing page now shares the full footer. No layout was redesigned.

### 11.7 Open questions for the owner
- **Landing 7/10:** which parts cost the three points? The report does not say, so no further landing changes were made.
- **Admin and calls:** "Not even me as the owner" is built as: no app screen can leave a call. Should an admin still be able to end a call server-side for a safety violation?
- **Alias format:** the app now shows `P2P-XXXXX`. Should the landing page examples ("River") switch to the same format?
- **Bonus rule:** confirm that a bonus call is granted once per invitee, after that invitee's first call of 30 seconds or more.

## 12. Implemented component contracts

The production interfaces use the tokens above. Section 11 still takes precedence over earlier layout suggestions. The preview's sample accounts, statistics and payment amounts are fixtures; production screens use authenticated API responses.

| Component | Interface | States and behavior |
|---|---|---|
| Button | Native `button`; primary, secondary or danger class; `disabled`, `aria-busy`, icon, label and action callback. Icon-only controls require `aria-label`. | Idle, hover, focus, pressed, pending, acknowledged and failed. Targets are at least 44px. A pending mutation prevents duplicate requests; acknowledgement follows the server response. |
| Card | Semantic `article` or `section` with a heading; dashboard cards, history cards and admin panels share the border, surface and radius tokens. | Normal, empty, error and pending. Saved/report marks persist with the underlying session. A removed partner collapses only after deletion succeeds. |
| Field | Label plus controlled input or textarea; custom Select takes value, options and change callback. Help and error text belong beside the field. | Empty, filled, focus, disabled and invalid. Errors preserve entered values. Speaking-score steppers use 0.5 increments; overall is calculated. |
| Dialog | Client `DashboardDialog`: title, pending, onClose and children. Admin `Dialog`: open, title, pending, onClose, children and optional className. `ConfirmDialog` adds consequence, affectedItem, auditNote, severity and confirmation callback. | Entering, open, pending and closing. Focus is trapped, Escape respects pending requests and focus returns to the opener. Closing client overlays remain inert until their exit finishes. |
| Chip | Admin `StatusBadge`: label, semantic variant, dot, size, className and style. Plan names are display labels, separate from status meaning. | Success mint, pending amber, danger crimson, information blue and neutral ink. Published plan acknowledgement uses a brief pop on the chip. |
| Table | Semantic table inside the scrollable DataTable region; headers identify columns and rows; numeric columns align right. | Loading, populated, empty and failed. Headers remain sticky. Overflow stays inside the labelled region. Actions retain object-specific accessible names. |

Motion follows the supplied prototype: the right drawer slides over 240ms with a 200ms scrim; bottom sheets move 28px over 240ms with 180–200ms opacity; action buttons leave over 200ms after the sheet closes; rating stars stagger by 70ms and settle into the header after the row collapses; saved/report marks pop over 450ms; deleted rows collapse over 320ms; the copy check draws over 350ms; FAQ expansion lasts 200ms; admin dialogs enter over 180ms. Reduced motion disables visual transitions and removes exit delays. Recordings and invitation states depend on backend acknowledgement.

## 13. Review polish

The latest review supersedes the reference drawer with a compact anchored menu. Dropdowns use 160ms opacity and 4px movement with a 0.98 scale and cubic-bezier(.2,.8,.2,1), without an overshoot. They remain inert during exit, preserve their anchor through viewport changes, and support Escape, outside dismissal and keyboard selection. Native admin dialogs retain content for their 180ms exit; reduced motion removes this delay. Buttons use short explicit hover and pressed transitions. Acknowledged rating text stays fully opaque throughout its subtle scale animation. Web interface labels use text and SVG icons rather than emoji.


## Shared call feedback

The after-call screen reuses History's controls for rating, saving a partner, reporting, and Telegram audio delivery. It loads the completed room specifically and refreshes briefly while the call is being saved. Report choices use full-row touch targets, a visible selected state, bounded optional details and the shared accessible dialog. Saved/reported marks remain visible; opening their explanation closes it after three seconds. Existing theme tokens, focus behavior and reduced motion apply to these controls. Superseded development design notes were consolidated into this maintained reference; ignored screenshot archives remain available locally.
