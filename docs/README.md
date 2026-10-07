# PairTalk documentation

Reviewed against the working tree on 2026-10-05. These files describe the repository; deployment status and test evidence are dated separately.

## Engineering

| Guide | Purpose |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Services, traffic, and shared enforcement boundaries |
| [Environment and deployment](ENVIRONMENT_AND_DEPLOYMENT.md) | Local setup, configuration, and migration/rollout behavior |
| [HTTP API](API_REFERENCE.md) | Route map, authentication, and recording retrieval |
| [Signaling](WEBSOCKET_EVENTS.md) | Client events, readiness, reconnection, and accounting |
| [State and storage](STATE_AND_STORAGE.md) | Durable models, recording ownership/history, and cleanup |
| [Workflows](CIRCULATION_WORKFLOWS.md) | Call, payment, recording, and notification lifecycle |
| [Shared pricing](PLATFORM_PRICING.md) | Admin publication, live comparison, client choices and Telegram quotes |
| [Operations](OPERATIONS.md) | Recovery, release requirements, and unresolved decisions |
| [Verification](VERIFICATION.md) | Reproducible checks and dated evidence |
| [Cross-device audio](WEBRTC_CROSS_DEVICE_AUDIO_GUIDE.md) | Audio implementation and physical-device test checklist |
| [Fly staging](fly-staging.md) | Optional isolated staging template; no deployment implied |

## Product and learner guidance

- [How it works](HOW_IT_WORKS.md)
- [FAQ](FAQ.md)
- [IELTS speaking practice](IELTS_SPEAKING_GUIDE.md)
- [Community guidelines](COMMUNITY_GUIDELINES.md)
- [Safety guide](SAFETY_GUIDE.md)
- [Privacy repository draft](PRIVACY_POLICY.md)
- [Terms repository draft](TERMS_OF_SERVICE.md)
- [Flexible unit purchases — planned](unit-pricing.md)

The public website renders its own content from `landing/src/content.tsx`; it does not load these Markdown documents. Policy drafts and product proposals do not change deployed terms or current entitlements.

## Maintenance

Keep runtime facts next to source links rather than copying package versions, every database column, or the entire file tree. Use package lockfiles, `gateway/go.mod`, and the Prisma schema for those inventories. Label test results with their date and scope; do not turn an old result into a current production claim. Historical browser/integration summaries in [verification/](verification/) are retained as evidence, not launch approval.

Obsolete redesign notes, overlapping remediation reports, generated file trees, and one-off QA helpers were removed during this cleanup. Useful behavior and open follow-ups were consolidated into the guides above; prior details remain in Git history.
