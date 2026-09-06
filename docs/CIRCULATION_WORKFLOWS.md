# PairTalk End-to-End Circulation Workflows

> **Standard**: Cloudflare / Stripe Architecture Sequencing Standards  
> **Audience**: Systems Integrators, Core Engineers, Product Engineers  
> **Diagram Format**: Mermaid.js Sequence & State Diagrams

---

## 1. Matchmaking Queue Circulation

The PairTalk Matchmaking Engine executes non-blocking atomic Redis Lua routines to evaluate IELTS whole-band competencies and pair candidates with complementary strengths.

```mermaid
sequenceDiagram
    autonumber
    participant ClientA as Candidate A (Band 6.5, Weak FC, Strong LR)
    participant ClientB as Candidate B (Band 6.5, Weak LR, Strong FC)
    participant GW as Go Gateway Voice Core
    participant Redis as Redis 7 In-Memory State

    Note over ClientA,Redis: Phase 1: Candidate A Joins Matchmaking Radar
    ClientA->>GW: emit("join_queue", { band: 6.5, skills: { subFC: 5.5, subLR: 7.5, subGRA: 6.5, subP: 6.5 }, options: { plan: "FREE" } })
    GW->>GW: DetermineWeakAndStrongSkills() -> Weak: FC, Strong: LR
    GW->>GW: Calculate Own Bucket: "match_queue:6.5:FC:LR"<br/>Complementary Bucket: "match_queue:6.5:LR:FC"
    GW->>Redis: Eval(MatchQueueMultiClaimScript, candidateBuckets, [UserQueuePrefix, userAId])
    Redis-->>GW: Nil (No available partner in candidate pools)
    GW->>Redis: Pipeline: SADD "match_queue:6.5:FC:LR" userAId<br/>SADD "match_queue:band:6.5" userAId<br/>SET "user_queue:userAId" "match_queue:6.5:FC:LR" EX 900
    GW-->>ClientA: emit("queue_joined", { status: "waiting" })

    Note over ClientB,Redis: Phase 2: Candidate B Joins with Complementary Skills
    ClientB->>GW: emit("join_queue", { band: 6.5, skills: { subFC: 7.5, subLR: 5.5, ... }, options: { plan: "PRO" } })
    GW->>GW: Weak: LR, Strong: FC<br/>Complementary Bucket: "match_queue:6.5:FC:LR"
    GW->>Redis: Eval(MatchQueueMultiClaimScript, [priorityPools, "match_queue:6.5:FC:LR", ...], [UserQueuePrefix, userBId])
    Redis->>Redis: Atomically SPOP Candidate A from "match_queue:6.5:FC:LR"<br/>Delete "user_queue:userAId" and sweep all registered pools
    Redis-->>GW: Return [userAId, "match_queue:6.5:FC:LR"]

    Note over GW,ClientB: Phase 3: Room Instantiation & Token Dispensation
    GW->>GW: Generate roomName = "room_" + UUIDv4()<br/>Calculate Duration Limit = max(15, 60) = 60 minutes
    GW->>GW: Mint LiveKit WebRTC JWTs for Candidate A & Candidate B
    GW->>GW: ScheduleAuthoritativeSessionTeardown(roomName, 3600)
    par Notify Candidate A
        GW-->>ClientA: emit("match_found", { roomName, partnerAlias: "P2P-Partner-B", livekitToken, livekitUrl, callDurationLimit: 3600 })
    and Notify Candidate B
        GW-->>ClientB: emit("match_found", { roomName, partnerAlias: "P2P-Partner-A", livekitToken, livekitUrl, callDurationLimit: 3600 })
    end
```

### Technical Invariants

1. **Deterministic Skill Resolution**: Sub-criteria scores are sorted stably: `FC (0) -> LR (1) -> GRA (2) -> P (3)`. Ties preserve stable index order.
2. **Progressive Bucket Search Order**:
   - Priority Queues (`match_queue:priority:BOSS`, `PRO`, `PLUS`).
   - Exact Complementary Match at same band (`match_queue:<band>:<strongSkill>:<weakSkill>`).
   - Same Skill Profile at same band (`match_queue:<band>:<weakSkill>:<strongSkill>`).
   - Same Band General Fallback (`match_queue:band:<band>`).
   - Adjacent Bands ($\pm 0.5$ and $\pm 1.0$ general pools).
3. **Ghost Prevention**: When Candidate A is matched, the atomic Lua script deletes their `user_queue:userAId` pointer and removes them from all candidate sets simultaneously.

---

## 2. Voice Call & Cloud Audio Egress Circulation

```mermaid
sequenceDiagram
    autonumber
    participant ClientA as Candidate A
    participant ClientB as Candidate B
    participant SFU as LiveKit SFU (WebRTC)
    participant GW as Go Gateway Voice Core
    participant S3 as AWS S3 / Cloudflare R2
    participant Node as Node.js Application Server
    participant TG as Telegram Bot API

    ClientA->>SFU: Connect via LiveKit WebRTC SDK (livekitToken)
    ClientB->>SFU: Connect via LiveKit WebRTC SDK (livekitToken)
    SFU-->>ClientA: Subscribe to Candidate B Opus Audio Track
    SFU-->>ClientB: Subscribe to Candidate A Opus Audio Track

    Note over ClientA,S3: Cloud Audio Recording Initiation
    ClientA->>GW: emit("toggle_record", { roomName, record: true })
    GW->>SFU: StartRoomCompositeEgress(roomName, MP3Format, S3OutputConfig)
    SFU-->>GW: Egress Started (egressId: "EG_abc123")
    GW-->>ClientA: emit("record_status", { record: true })
    GW-->>ClientB: emit("record_status", { record: true })

    Note over SFU,S3: Active Call & Egress Upload
    SFU->>S3: Stream composite 2-channel mixed MP3 to "recordings/room_...mp3"

    Note over ClientA,TG: Mutual Call Completion or Timer Expiry
    ClientA->>GW: emit("finish_call", { roomName, reason: "user_completed" })
    GW->>SFU: StopAudioEgress(egressId)
    GW->>SFU: DeleteRoom(roomName)
    GW->>GW: Compute actual billable duration (e.g. 842 seconds)
    GW->>GW: Calculate recording retention expiresAt = now + (30 days * 24h)
    GW->>GW: CompleteCallSession() in PostgreSQL
    GW-->>ClientA: emit("call_finished", { duration: 842, reason: "user_completed" })
    GW-->>ClientB: emit("call_finished", { duration: 842, reason: "user_completed" })

    Note over GW,TG: Async Post-Call Card Dispatch (Pub/Sub)
    GW->>Node: Redis Publish "pairtalk:events" (CALL_FINISHED payload)
    Node->>Node: Deduct call credits & evaluate referral milestones
    Node->>TG: sendMessage(chatIdA, "🎉 Practice Call Completed (14m 02s)!\nTap below to leave feedback...")
    Node->>TG: sendMessage(chatIdB, "🎉 Practice Call Completed (14m 02s)!\nTap below to leave feedback...")
```

---

## 3. Direct Call to Favorite Partner Circulation

Allows candidates to call saved practice partners directly with a 60-second invitation timeout.

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Caller (Telegram Mini App)
    participant Bot as PairTalk Telegram Bot
    participant Redis as Redis State Cache
    participant Callee as Favorite Partner (Telegram App)
    participant GW as Go Voice Gateway

    Caller->>Bot: Tap "Call Favorite" -> Callback `direct_call:<calleeUserId>`
    Bot->>Redis: Check Rate Limit "DIRECT_CALL" (4 req / 30s)
    Bot->>Bot: Check Callee DND (Do-Not-Disturb) & Active Call status
    Bot->>Redis: Store Invite State: SET `bot:fave_invite:<inviteToken>` { callerId, calleeId, roomName } EX 60
    Bot->>Callee: Send Telegram Message with Inline Keyboards:<br/>"📞 <b>P2P-Partner-7821</b> is inviting you to an IELTS Speaking Call!"<br/>[ ✅ Accept Call ] [ ❌ Decline ]
    Bot-->>Caller: "Invitation sent! Waiting for partner to accept (60s)..."

    alt Callee Accepts within 60s
        Callee->>Bot: Taps [ ✅ Accept Call ] (Callback `fave_accept:<inviteToken>`)
        Bot->>Redis: GETDEL `bot:fave_invite:<inviteToken>`
        Bot->>GW: Hub.CreateDirectRoom(roomName, callerId, calleeId)
        Bot->>Callee: Send WebApp Launch Button: [ 🎙️ Enter Voice Room ]
        Bot->>Caller: Send Telegram Alert: "Partner accepted! Entering room..."
    else Callee Declines or 60s Times Out
        alt Callee Declines
            Callee->>Bot: Taps [ ❌ Decline ]
            Bot->>Caller: "Partner declined the invitation."
        else Timeout
            Note over Redis,Caller: 60s TTL expires in Redis
            Bot->>Caller: "Call invitation timed out. Partner did not respond."
        end
    end
```

---

## 4. Upgrade Payment Circulation (Telegram Stars & Manual UZS Card)

PairTalk provides dual-path payment processing to serve global users (Telegram Stars) and regional candidates in Central Asia (Uzbekistan Som Humo/Uzcard transfers).

```mermaid
sequenceDiagram
    autonumber
    participant User as Candidate
    participant TMA as Mini App / Bot
    participant Bot as grammY Payment Engine
    participant TG as Telegram Cloud Payments
    participant Admin as Operations Desk (Admin Console)
    participant DB as PostgreSQL 16

    alt Path A: Telegram Stars (XTR) Automated In-App Flow
        User->>TMA: Select PRO Plan (255 Stars / 30 Days)
        TMA->>Bot: Request Stars Invoice Link
        Bot->>TG: createInvoiceLink(title="PRO Plan", currency="XTR", prices=[{ amount: 255 }])
        TG-->>Bot: Returns invoice URL
        Bot-->>TMA: Open Telegram Stars Native Checkout
        User->>TG: Confirm Star Payment
        TG->>Bot: Webhook: `pre_checkout_query`
        Bot-->>TG: answerPreCheckoutQuery(ok=true)
        TG->>Bot: Webhook: `successful_payment`
        Bot->>DB: Upsert StarsTransaction (status: "PAID", telegramPaymentId)<br/>Update User plan="PRO", subscriptionExpiresAt=now+30d
        Bot->>User: "🌟 Welcome to PRO Plan! 25 calls & 7 recordings unlocked."
    else Path B: Manual UZS Card Transfer (Humo / Uzcard)
        User->>Bot: Choose Card Payment -> Select PRO Plan (55,000 UZS)
        Bot->>DB: Create ManualPaymentRequest (orderNumber: "A042", status: "PENDING")
        Bot-->>User: "Send exactly 55,000 UZS to <code>9860...</code><br/>Order: #A042<br/>Attach receipt screenshot below."
        User->>Bot: Uploads Receipt Screenshot / PDF
        Bot->>DB: Update ManualPaymentRequest paymentProof="uploads/rec_...jpg"
        Bot->>Admin: Push notification to Admin Telegram Channel with inline approval buttons
        Note over Admin,DB: Admin Verifies via Web Portal (/api/admin/payments/manual)
        Admin->>DB: POST /api/admin/payments/manual/req_123/approve
        DB->>DB: Set status="APPROVED", update User plan="PRO"
        DB->>DB: Record AuditLog (action: "MANUAL_PAYMENT_APPROVAL")
        Bot->>User: "✅ Payment Verified! Your PRO Plan is now active for 30 days."
    end
```

---

## 5. Disciplinary & Ban Appeal Circulation

Enforces platform conduct standards while providing a transparent, audited appeal review mechanism.

```mermaid
sequenceDiagram
    autonumber
    participant Abuser as Reported / Suspended User
    participant Admin as Operations Administrator
    participant DB as PostgreSQL 16
    participant Bot as Telegram Bot

    Note over Abuser,Admin: Phase 1: Suspension Imposed
    Admin->>DB: POST /api/admin/users/:id/ban { ban: true, permanent: false, durationHours: 24, reason: "Offensive language" }
    DB->>DB: User.isBanned = true, User.bannedUntil = now + 24h
    DB->>DB: Record AuditLog (action: "USER_MODERATION", targetId: userId)
    Bot->>Abuser: "⚠️ Your account has been suspended for 24 hours.<br/>Reason: Offensive language.<br/>You may submit an appeal."

    Note over Abuser,DB: Phase 2: Appeal Submission
    Abuser->>DB: Submit Appeal via Mini App: POST /api/admin/appeals<br/>{ appealText: "Misunderstanding with partner. Apologies." }
    DB->>DB: Insert UnblockAppeal (status: "PENDING")

    Note over Admin,Abuser: Phase 3: Admin Review & Adjudication
    Admin->>DB: GET /api/admin/appeals (Status: "PENDING")
    alt Appeal Approved
        Admin->>DB: POST /api/admin/appeals/:id/approve
        DB->>DB: UnblockAppeal.status = "APPROVED"<br/>User.isBanned = false, User.bannedUntil = null
        DB->>DB: Record AuditLog (action: "APPEAL_APPROVAL")
        Bot->>Abuser: "🎉 Your appeal was reviewed and APPROVED! Your account is now restored."
    else Appeal Rejected
        Admin->>DB: POST /api/admin/appeals/:id/reject
        DB->>DB: UnblockAppeal.status = "REJECTED"
        Bot->>Abuser: "❌ Your appeal has been rejected. Your suspension remains in effect until the specified timestamp."
    end
```
