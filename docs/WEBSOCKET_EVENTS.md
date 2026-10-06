# Signaling and call lifecycle

Reviewed 2026-10-05. The Mini App uses Socket.IO via [socket.ts](../client/src/services/socket.ts). The production Go gateway and Node signaling implementation must preserve the same client-facing lifecycle.

## Connection and identity

The client connects to `VITE_SERVER_URL` or the current origin, supplies launch data as `auth.token` and `X-Telegram-Init-Data`, and replaces the connection when launch credentials change. Identity is server-validated; payload user IDs and plan metadata do not grant permissions. The gateway also exposes its native WebSocket transport for the existing protocol harness.

## Client events

| Event | Payload / purpose |
| --- | --- |
| join_queue | UserMatchData: band and criterion preferences; server rechecks identity, moderation, and entitlement |
| cancel_queue | Current client's queue cancellation; repeat cancellation is safe |
| peer_ready | `{ roomName }` after media-room setup |
| get_recording_status | `{ roomName }` for the active participant's personal intent and room capture snapshot |
| toggle_record | `{ roomName, record: boolean }` |
| finish_call | `{ roomName, userId, reason? }`; payload identity/reason are not charge authority |

Room actions require membership in the persisted active session before allocating retained room state. Implementations apply their existing validation and rate limits. Do not introduce new events based solely on this guide.

## Server events

| Event | Relevant fields |
| --- | --- |
| match_found | roomName, livekitToken (legacy token alias), livekitUrl, partnerAlias, partnerBand, duration limit in seconds |
| call_started | startedAt and expiresAt in milliseconds; durationSeconds |
| record_status | roomName and record boolean for this user's saved-copy intent |
| room_recording_status | roomName, state (`on`, `off`, `unknown`), updatedAt in milliseconds |
| recording_error | message and optional code |
| call_finished | optional duration and reason |
| partner_connection_lost | optional userId and gracePeriodSec |
| partner_reconnected | optional userId and reconnectedAt |
| error | message and optional code |

Queue acknowledgements may be emitted by backend implementations. Consumer types and exact parsing live in [client types](../client/src/types/index.ts) and [Go signaling](../gateway/internal/signaling/handler.go); these are preferable to hand-built Engine.IO packet examples.

## Readiness, timers, and completion

Initial room tokens allow microphone publication but deny subscriptions and data publication. Both canonical participants must become ready before the server durably records media authorization and enables provider subscriptions. Readiness is persisted across Node/Go replicas; repeated readiness retries permission updates without resetting the admission clock. The handshake window is 90 seconds and disconnect grace is 15 seconds.

The authoritative clock begins at persisted session admission (`createdAt`). When readiness completes, timeout is scheduled for the **remaining** duration, not a fresh full allowance. Reconnection and late readiness cannot reset that origin.

Shared completion persists a terminal transition and accounting once. Completed sessions lasting at least five seconds consume call allowance, including when a client supplies a microphone-denied reason or a false charge hint. A session with durable media authorization cannot become a free cancellation merely because participants have left. Never-authorized failed joins remain free, and provider uncertainty triggers a retry. Genuine short failures remain free. Charged failures use ordinary completion messaging rather than promising unused allowance.

## Recording

record_status represents active intent; it does not prove an output file is ready. Stop preserves saved ownership and the latest egress binding for delayed callbacks. Only the current binding updates the latest URL, while all generated keys remain tracked for deletion. Completion uses current persisted state rather than cached recording snapshots.

room_recording_status describes room-wide capture independently of personal intent. Transitions are distributed over Redis to Node and Go sockets. Uncertain starts/stops or unavailable provider status use `unknown`, rather than a false off guarantee. Clients refresh the snapshot on reconnect and periodically while in a call, ignore other-room/stale updates, and label `off` as no recording reported. Egress requires media authorization first. Recording keys use a hashed room namespace and a fresh UUID per attempt, while existing saved paths remain retrievable.

## Recovery and checks

Use the authenticated active-call endpoint when recovering a session. Tokens and remaining duration come from current server state. A stale client must not revive a completed call. Test duplicate readiness, unauthorized rooms, delay before readiness, reconnect during grace, repeated finish, recording stop/restart, and completion racing a webhook.

Sources: [Node signaling](../server/src/socket/signaling.ts), [Go handler](../gateway/internal/signaling/handler.go), [Go timers](../gateway/internal/signaling/timers.go), and both shared completion helpers. See [Verification](VERIFICATION.md).
