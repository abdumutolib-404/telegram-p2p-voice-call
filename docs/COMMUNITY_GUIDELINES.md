# Community guidelines

PairTalk is for respectful English speaking practice.

- Let your partner finish and offer specific, constructive feedback.
- Do not harass, threaten, discriminate, or use the service for sexual content.
- Do not solicit money, advertise services, collect private contact details, or pressure someone to move to another platform.
- Do not record or redistribute another person's speech without informed permission.
- Do not manipulate ratings/referrals, create abusive duplicate accounts, or disrupt matchmaking.
- Leave a call when uncomfortable. Report the relevant session honestly; do not use reports to punish ordinary mistakes or disagreements.

## Current moderation behavior

Reports are tied to actual call participants and repeated reports for the same pair/session are rejected. Current automatic escalation in [moderation.ts](../server/src/services/moderation.ts) is:

| Warning count | Action |
| --- | --- |
| 1–2 | Warning |
| 3–4 | Six-hour temporary suspension |
| 5 or more | Permanent account suspension |

Admins can review and apply moderation actions separately. Permanent/indefinite suspensions have no invented countdown. Appeals are available through the bot's appeal workflow.

A report is not a guarantee of immediate operator review or permanent pair blocking. Do not promise those features unless implemented. Changes to moderation policy require a separate product decision; this guide describes existing behavior.

See [Safety](SAFETY_GUIDE.md), [FAQ](FAQ.md), and [Terms draft](TERMS_OF_SERVICE.md).
