# PairTalk: How It Works — Technical & Pedagogical Architecture

**Document Version:** 2026.2.0  
**Effective Date:** August 2026  
**Scope:** Global Autonomous Peer-to-Peer IELTS Speaking Simulation Network  

---

## 1. Executive Overview

**PairTalk** is an autonomous, high-concurrency peer-to-peer IELTS Speaking preparation platform. Operating directly within Telegram Mini Apps and standard modern web browsers, PairTalk connects motivated candidates across 80+ countries in under three seconds. 

By replacing slow, unresponsive study groups and expensive 1-on-1 private tutors ($20–$50/hour) with real-time criteria-matched voice simulation rooms, PairTalk delivers high-repetition, exam-authentic speaking practice accessible to every candidate.

---

## 2. Sub-3-Second Matchmaking Architecture

```
 Candidate A (Band 7.0)                 Redis In-Memory Queue                 Candidate B (Band 7.0)
 ┌──────────────────────┐             ┌─────────────────────────┐             ┌──────────────────────┐
 │ • FC: 7  • LR: 7     │ ──Join───>  │ Bucket: "7"             │  <──Join─── │ • FC: 7  • LR: 7     │
 │ • GRA: 7 • P: 7      │             │ • Non-blocking atomic pop│             │ • GRA: 7 • P: 7      │
 │ • Alias: P2P-0284DB68│             │ • Latency < 50ms        │             │ • Alias: P2P-4A91E02C│
 └──────────────────────┘             └────────────┬────────────┘             └──────────────────────┘
                                                   │
                                       Pair Matched in < 3s
                                                   │
                                                   ▼
                                      ┌─────────────────────────┐
                                      │  LiveKit SFU Voice Room │
                                      │  (Encrypted Audio Opus) │
                                      └─────────────────────────┘
```

### 2.1 Low-Latency Queue Pipeline
Traditional matchmaking systems rely on polling databases or persistent WebSocket pools that degrade under peak load. PairTalk utilizes a distributed, in-memory **Redis** queue cluster:
1. **Atomic Ingestion**: When a candidate taps *Start Practicing*, the request is serialized with target criteria and pushed to an atomic Redis list keyed by target band score.
2. **Deterministic FIFO Pairing**: A worker process executes non-blocking `LPOP` / `RPOPLPUSH` operations with atomic lock guards (`SET NX EX`), guaranteeing zero race conditions and preventing duplicate matching.
3. **Queue Fallback Expansion**: If an exact whole-band match is not found within 2.5 seconds, the algorithm expands tolerance by $\pm 1$ band tier to ensure immediate connection without prolonged wait times.
4. **Sub-3s Guarantee**: Average match resolution takes **1.2 to 2.4 seconds** globally.

---

## 3. Whole-Band 4-Criteria Pairing Logic

PairTalk adheres strictly to the official British Council / IDP IELTS 4-criteria assessment framework using **whole bands only** (5, 6, 7, 8, 9):

| Criterion | Abbreviation | Core Competency Evaluated |
| :--- | :---: | :--- |
| **Fluency & Coherence** | `FC` | Speech rate, continuity, natural hesitation vs. language search, logical sequencing, cohesive connectives. |
| **Lexical Resource** | `LR` | Range of vocabulary, idiomatic precision, paraphrase flexibility, collocation awareness, avoidance of repetition. |
| **Grammatical Range & Accuracy** | `GRA` | Mix of simple and complex sentence structures, tense consistency, error-free clause percentage. |
| **Pronunciation** | `P` | Intonation, phonemic accuracy, word and sentence stress, rhythm, global intelligibility without regional strain. |

### 3.1 Overall Band Calculation
The overall calibrated target band is calculated as the rounded arithmetic mean of the four sub-scores:
$$\text{Overall Band} = \text{round}\left(\frac{\text{FC} + \text{LR} + \text{GRA} + \text{P}}{4}\right) \in \{5, 6, 7, 8, 9\}$$

### 3.2 Complementary Skill Synergy
Beyond raw score matching, PairTalk’s algorithm identifies complementary strengths. For example, a candidate targeting Band 7 who demonstrates strong Grammar (`GRA: 8`) but requires work on Pronunciation (`P: 6`) can be paired with a partner excelling in Pronunciation (`P: 8`), fostering reciprocal peer learning during qualitative debriefs.

---

## 4. Exam Simulation Lifecycle & Part 1, 2, 3 Flow

Each PairTalk voice session follows the official IELTS Speaking test structure:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PAIRTALK SESSION TIMELINE                                 │
├─────────────────────┬────────────────────────────────────┬─────────────────────────────┤
│  PART 1 (4-5 Mins)  │         PART 2 (3-4 Mins)          │      PART 3 (4-5 Mins)      │
│  Introduction &     │  Cue Card Monologue                │  Abstract Two-Way           │
│  Familiar Topics    │  • 1:00 min timed preparation      │  Discussion & Analysis      │
│  (Work, Home, Hobbies)│ • 2:00 min uninterrupted speaking│  (Societal & Global Trends) │
└─────────────────────┴────────────────────────────────────┴─────────────────────────────┘
```

### 4.1 Part 1: Warm-up & Introduction (4–5 minutes)
- Focus on general questions regarding familiar topics (studies, hometown, accommodation, leisure, technology).
- Builds initial rapport, reduces speaking anxiety, and tests sentence-level fluency.

### 4.2 Part 2: Individual Long Turn / Cue Card (3–4 minutes)
- **Automated 1-Minute Prep Timer**: The in-call HUD displays a randomized cue card topic with four prompting bullet points. Both candidates receive a synchronized 60-second timer to take mental or written notes.
- **2-Minute Speaking Phase**: The designated candidate speaks for 1 to 2 uninterrupted minutes. An on-screen countdown signals pacing checkpoints at 1:00, 1:30, and 2:00 minutes.
- **Follow-up Rounding-off Question**: The partner asks one or two brief rounding-off questions.

### 4.3 Part 3: Deep Analytical Discussion (4–5 minutes)
- Explores abstract, speculative, and societal themes connected to Part 2.
- Emphasizes justification, hypothesis formulation (`If governments were to...`), contrasting perspectives, and complex discourse markers.

---

## 5. Role Alternation Protocol

To ensure both participants obtain equal speaking and evaluation practice:
1. **First Half (Candidate A Speaking, Candidate B Examining)**: Candidate B reads prompt cards, keeps time, and listens actively for grammatical slips and lexical range.
2. **Second Half (Candidate B Speaking, Candidate A Examining)**: Roles invert seamlessly with a fresh topic card.
3. **Session Duration Caps**: Free tier sessions provide up to 15 minutes; PLUS, PRO, and BOSS tiers allow extended deep dives up to 30, 60, and 90 minutes respectively.

---

## 6. Peer Assessment & Reciprocal Feedback Loop

Upon call completion, both candidates enter the **Post-Call Assessment Screen**:

1. **Sub-Criteria Scoring**: Each learner rates their partner on integer whole bands (5 to 9) across `FC`, `LR`, `GRA`, and `P`.
2. **Structured Qualitative Feedback**: Quick-select tags for positive reinforcement (*"Natural Idioms"*, *"Fluid Transitions"*, *"Accurate Word Stress"*) and constructive improvement areas (*"Filler Word Overuse"*, *"Monotone Intonation"*, *"Tense Inconsistency"*).
3. **Reputation & Calibration Weighting**: Ratings submitted by experienced, high-reputation candidates carry higher statistical weight, mitigating malicious or inaccurate ratings.
4. **Community Trust Engine**: Accounts maintaining an average peer rating $\ge 4.2★$ receive priority matchmaking placement and leaderboard badges.

---

## 7. Studio-Grade WebRTC SFU Audio Infrastructure

PairTalk uses dedicated **LiveKit Selective Forwarding Units (SFU)** deployed across low-latency edge regions (Frankfurt, Singapore, Virginia):

- **Opus HD Codec**: Adaptive bitrate audio encoding (24–64 kbps) optimized for voice clarity and accent intelligibility.
- **Acoustic Echo Cancellation (AEC) & Noise Suppression (NS)**: Server- and client-side digital signal processing eliminates room echo and ambient noise.
- **Cross-Device Audio Auto-Unlock**: Proprietary audio context unlock handlers overcome iOS Safari and Android WebView silent audio restrictions, ensuring instantaneous audio playback upon connection.
- **Direct End-to-End Media Encryption**: All audio streams are encrypted in transit via DTLS-SRTP.

---

## 8. Cloud Recording & Retention Lifecycle

| Subscription Plan | Monthly Calls | Max Call Duration | Cloud Audio Recordings | Retention Window | Storage Purge Method |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **FREE** | Complimentary | 15 mins | 1 recording | **24 hours (1 day)** | Automated cron hard-delete |
| **PLUS** | 10 calls | 30 mins | 3 recordings | **7 days** | Automated cron hard-delete |
| **PRO** | 25 calls | 60 mins | 7 recordings | **30 days** | Automated cron hard-delete |
| **BOSS** | 50 calls | 90 mins | 15 recordings | **90 days** | Automated cron hard-delete |

*Note: Recording is entirely optional. Both participants must have recording permissions enabled, and either participant can disable recording at any point during the call.*

---

## 9. 100% Anonymity & Security

- **Cryptographic Alias**: You are identified only as `P2P-XXXXXXXX` (e.g., `P2P-0284DB68`).
- **Zero PII Exposure**: Real name, phone number, Telegram `@username`, profile photo, and geolocation are never revealed to peers or exposed in WebRTC SDP signaling.
- **Safety Interventions**: In-call 1-tap disconnect, partner blocking, and automated harassment flagging. See [Safety Guide](./SAFETY_GUIDE.md) and [Community Guidelines](./COMMUNITY_GUIDELINES.md).

---

## 10. Summary of Key Links

- [Official Band Descriptors & Practice Guide](./IELTS_SPEAKING_GUIDE.md)
- [Community Guidelines & Moderation Ladder](./COMMUNITY_GUIDELINES.md)
- [Safety & Anti-Solicitation Guide](./SAFETY_GUIDE.md)
- [Privacy Policy & 100% Refund Guarantee](./PRIVACY_POLICY.md)
- [Terms of Service](./TERMS_OF_SERVICE.md)
- [Frequently Asked Questions (FAQ)](./FAQ.md)
