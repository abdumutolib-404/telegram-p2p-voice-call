# PairTalk Privacy Policy, Audio Retention & Refund Guarantee

**Document Version:** 2026.2.0  
**Effective Date:** August 2026  
**Scope:** Global Privacy Standards, Data Processing & Consumer Protection Policy  

---

## 1. Introduction & Privacy Commitment

**PairTalk** ("we", "us", "our") operates an autonomous peer-to-peer IELTS Speaking preparation platform accessible via Telegram Mini Apps and web clients at `pairtalk.online`. 

We are committed to absolute data minimization, transparent data lifecycle management, and rigorous user privacy. This Privacy Policy details our data collection boundaries, WebRTC voice encryption, authoritative audio retention matrix, and our server-enforced **100% 48-Hour Money-Back Guarantee**.

---

## 2. Zero-Knowledge Architecture: What We Collect vs. What We Ignore

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                DATA PROCESSING BOUNDARIES                              │
├──────────────────────────────┬──────────────────────────┬──────────────────────────────┤
│ COLLECTED MINIMAL METADATA:  │ WHAT WE NEVER COLLECT:   │ STORAGE DURATION:            │
│ • Numeric Telegram User ID   │ • Real Names & Surnames  │ • Active account lifetime    │
│ • Target Band Scores (5-9)   │ • Telephone Numbers      │ • In-memory queue (<10s)     │
│ • Anonymous Alias (P2P-XXXX) │ • Contact Books & Avatars│ • Recordings (1-90 days max) │
│ • Subscription Status & Stars│ • Live Unrecorded Audio  │ • Purged permanently upon    │
│ • Session Timestamp & Peer ★ │ • IP / Geolocation logs  │   retention expiration       │
└──────────────────────────────┴──────────────────────────┴──────────────────────────────┘
```

### 2.1 Essential Service Data Collected
- **Telegram Numeric User ID**: Required solely for cryptographic account authentication, session authorization, and state persistence.
- **Cryptographic Alias**: A randomly generated identifier (e.g., `P2P-0284DB68`) displayed to peers.
- **Target IELTS Bands & Sub-scores**: Self-reported integers (5 to 9) for `FC`, `LR`, `GRA`, and `P` used to drive the matchmaking algorithm.
- **Call Telemetry**: Session duration, completion status, and peer assessment scores used to calculate community ratings.

### 2.2 Data We Explicitly Do Not Collect
- We **never** extract your real name, phone number, Telegram bio, personal avatar, or address book.
- We **never** inspect or listen to live voice streams.

---

## 3. WebRTC Voice Encryption & Cloud Recording Retention Matrix

### 3.1 In-Transit Voice Stream Encryption
All live peer-to-peer audio communications are routed through dedicated Selective Forwarding Units (SFUs) using **Datagram Transport Layer Security (DTLS)** and **Secure Real-time Transport Protocol (SRTP)** with AES-128/256 bit encryption.

### 3.2 Authoritative Cloud Recording Retention Matrix
Cloud audio recording is **completely optional** and requires explicit consent. If activated, recorded audio files are retained strictly according to the plan tier:

| Plan Tier | Monthly Calls | Max Session Length | Cloud Recordings Included | Retention Window | Storage Purge Method |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **FREE Tier** | Complimentary | 15 mins | 1 recording | **24 Hours (1 Day)** | Automated cron hard-delete |
| **PLUS Plan** | 10 calls | 30 mins | 3 recordings | **7 Days** | Automated cron hard-delete |
| **PRO Plan** | 25 calls | 60 mins | 7 recordings | **30 Days** | Automated cron hard-delete |
| **BOSS Plan** | 50 calls | 90 mins | 15 recordings | **90 Days** | Automated cron hard-delete |

*When a recording reaches the end of its retention window, the audio binary is permanently erased from cloud object storage and cannot be restored.*

---

## 4. 100% 48-Hour Money-Back Guarantee & Refund Policy

PairTalk offers a transparent, server-enforced **100% Money-Back Guarantee** on all paid accelerator subscriptions.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         100% 48-HOUR REFUND ELIGIBILITY CRITERIA                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ✅ Condition 1: Refund request initiated within 48 HOURS of original purchase; AND   │
│  ✅ Condition 2: LESS THAN 10% of the purchased monthly practice call allowance used.  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Ineligible Scenarios
A refund cannot be issued under any of the following circumstances:
1. More than **48 hours** have elapsed since subscription activation.
2. The user has utilized **10% or more** of their monthly call credits (e.g., used 1 or more calls on a 10-call plan, or 3 or more calls on a 25-call plan).
3. The account has been sanctioned, suspended, or permanently banned due to violations of our [Community Guidelines](./COMMUNITY_GUIDELINES.md) or [Safety Guide](./SAFETY_GUIDE.md).

### 4.2 Refund Settlement Mechanics
- **Telegram Stars (XTR)**: Eligible Telegram Star transactions are reversed automatically via the bot using `/refund`. The refund is credited immediately back to your Telegram Stars balance, and the account returns to the Free tier.
- **National Bank Card Payments (UZS)**: Card refunds submitted via `/refund` or support are reviewed by billing administration and returned to the originating payment card within **1 to 3 business days**.

---

## 5. Right to Erasure & Data Subject Rights

In compliance with international data protection frameworks (including GDPR principles):
- **Right to Access**: View your current band calibrations, subscription status, and call history at any time inside the app.
- **Right to Erasure ("Right to be Forgotten")**: You may request complete, permanent deletion of your account record, peer ratings, and active recordings by contacting support via `@PairTalkSupport` or submitting `/support` in the bot. Account purge requests are executed within 24 hours.

---

## 6. Infrastructure & Sub-processors

PairTalk partners with industry-leading infrastructure providers under strict Data Processing Agreements:
- **LiveKit Cloud / Self-Hosted SFU**: Real-time WebRTC media routing.
- **Cloudflare**: Global CDN, DDoS mitigation, and edge SSL termination.
- **PostgreSQL & Redis**: Encrypted database and in-memory queue management.

---

## 7. Contact & Inquiries

For privacy concerns, billing assistance, or formal data requests:
- **Customer Support**: `@PairTalkSupport` (Telegram)
- **Telegram Bot Commands**: `/refund`, `/support`, `/paysupport`
- **Official Web Portal**: [pairtalk.online](https://pairtalk.online)

---

## 8. Summary of Related Guides

- [How Matchmaking Works](./HOW_IT_WORKS.md)
- [Official IELTS Speaking Guide](./IELTS_SPEAKING_GUIDE.md)
- [Community Guidelines & Moderation Ladder](./COMMUNITY_GUIDELINES.md)
- [Safety & Anti-Solicitation Guide](./SAFETY_GUIDE.md)
- [Terms of Service](./TERMS_OF_SERVICE.md)
- [FAQ](./FAQ.md)
