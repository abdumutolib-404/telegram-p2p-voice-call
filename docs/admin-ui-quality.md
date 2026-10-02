# Admin UI quality review

Verified on 2026-10-02 with local synthetic API fixtures. No production accounts or financial operations were used.

## Confirmed defects and changes

| Area | Confirmed failure | Result |
| --- | --- | --- |
| Shell | App stylesheet was not imported; navigation and tables did not adapt consistently | Shared stylesheet, persistent navigation, mobile drawer, lazy screens, screen error boundaries and contained table scrolling |
| Overview and analytics | Placeholder growth, health and activity values could appear as real metrics; coupled requests hid successful data | Independent requests, explicit unavailable states, last successful snapshots with errors and retry, UTC registration sample labels |
| Requests | Caller headers/signals were overwritten; expired requests could affect newer searches; forbidden responses ended valid sessions | Combined cancellation and bounded timeout, stale-response guards, protected 401 logout, 403 retained authentication, no automatic mutation retry |
| Dialogs | Inconsistent modal semantics, focus and pending behavior | Shared native dialogs, accessible names, focus trap/restoration, nested Escape handling, scroll locks and blocked dismissal during mutations |
| Plans | Invented defaults and partial updates risked losing unrelated configuration | Actual server configuration only, synchronized call fields, zero preservation, validated limits, unsaved-edit protection and authoritative save responses |
| Candidates | Limit changes included a plan and could reset subscription expiration; UI options differed from backend behavior | Limits-only PATCH, deliberate default/override clearing, fractional IELTS bands, actual six-hour suspension and contest award presets |
| Payments and appeals | Errors closed forms or appeared as empty queues; receipt viewing bypassed authenticated requests | Inline retained errors, one pending mutation, protected blob previews, object URL cleanup, independent refund proof validation and queue badge refresh |
| Questions | Only the first records were available; cue-card type and legacy bullets were fragile | Server pagination, independent topic/source loads, CUE_CARD type, defensive legacy parsing, selected filter states, failed-form retention and destructive confirmation |
| Contests | Editable prizes were not honored; failed conclusion could attempt another mutation | Fixed backend award policy displayed, selected contest endpoint only, validated duration and pending locks |
| Audit | Date handling and action grouping were inconsistent; copy success was premature | UTC date filters, financial classification, shared detail dialogs and awaited clipboard feedback |

## Validation

- `npm run build` in `admin`: passed TypeScript and Vite production build.
- `npm run lint` in `admin`: passed with one existing `react(only-export-components)` Fast Refresh warning in AuthContext; no lint errors.
- All nine screens were checked at 375×812, 768×1024 and 1440×900. The final reports contain 27 screen/viewport combinations, no horizontal page overflow, and zero axe-core violations. This automated result is not a complete accessibility certification.
- Browser workflows: obsolete search loses to the newer result; later question pages are accessible; zero values and failed forms remain; pending controls are disabled and Escape cannot dismiss the mutation; 403 keeps authentication; 401 returns to login; partial overview failures retain earlier successful values.
- Keyboard checks: focus stays inside a dialog, nested Escape closes only the top dialog, the parent stays scroll-locked, and closing the parent restores focus to its opening Limits button.
- Browser API fixtures never forward a request to real services. Start with `SYNTHETIC_ADMIN_PORT=4183 node scripts/admin-mock-browser.cjs` after building admin. The QA toolbar and synthetic authentication exist only in this fixture server and are not included in the production admin bundle.

See [verification/admin-browser.json](verification/admin-browser.json) for machine-readable synthetic layout/accessibility results.

## Limits

Live administrator Telegram OTP delivery, production receipts, payment-provider transactions, real announcement delivery and live voice rooms were not exercised. Synthetic fixtures verify UI behavior and request handling; backend ownership and concurrency checks are separate. Existing subscriptions and prices were preserved.
