# PairTalk Safety, Privacy & Anti-Solicitation Guide

**Document Version:** 2026.2.0  
**Effective Date:** August 2026  
**Target Audience:** All Global PairTalk Learners & Educators  

---

## 1. Safety Philosophy & Zero-PII Guarantee

PairTalk is built from the ground up on a **Zero Personally Identifiable Information (Zero-PII)** architecture. We believe speaking practice with unfamiliar peers should be completely safe, comfortable, and free from invasive personal inquiries.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              ZERO-PII SHIELD ARCHITECTURE                              │
├──────────────────────────────┬──────────────────────────┬──────────────────────────────┤
│ WHAT PEERS SEE:              │ WHAT REMAINS PRIVATE:    │ WHAT IS STORED TEMPORARILY:  │
│ • Anonymous Alias            │ • Your Real Name         │ • Target Band Sub-scores     │
│   (e.g., P2P-0284DB68)       │ • Telegram Username      │ • Matchmaking Queue State    │
│ • Target Band (5-9)          │ • Phone Number & Avatar  │ • Optional Audio Recording   │
│ • Cumulative Rating (★)      │ • IP Address & Location  │   (Purged after 1-90 days)   │
└──────────────────────────────┴──────────────────────────┴──────────────────────────────┘
```

---

## 2. Permanent Cryptographic Candidate Aliasing

Every learner is assigned a randomized, non-reversible cryptographic identifier formatted as `P2P-XXXXXXXX` (e.g. `P2P-0284DB68`). 

- **Signaling Layer Protection**: Neither your Telegram handle (`@username`), your registered telephone number, nor your avatar photograph is transmitted in the WebRTC SDP handshake or Socket.IO signaling payload.
- **Never Share Personal Details**: PairTalk strictly advises all users **never** to disclose full names, home addresses, personal social media handles (Instagram, WhatsApp, WeChat), or financial information during voice calls.

---

## 3. Anti-Scam & Anti-Commercial Solicitation Defense

PairTalk is exclusively an academic practice platform. The following commercial and fraudulent activities are strictly prohibited and trigger an immediate **Tier 3 Permanent Ban**:

1. **Private Tutoring Solicitations**: Tutors attempting to recruit students or sell external private coaching packages.
2. **Essay Correction & Exam Material Resale**: Marketing illicit IELTS question leaks, leaked exam papers, or unauthorized editing services.
3. **Cryptocurrency & Affiliate Schemes**: Pitching investment schemes, crypto tokens, or multi-level marketing platforms.
4. **Phishing & External Links**: Directing partners to unverified external websites, file downloads, or suspicious Telegram groups.

---

## 4. In-Call Real-Time Safety Tools

During any live speaking session, candidates have access to immediate safety controls located in the call interface:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              LIVE IN-CALL SAFETY CONTROLS                              │
├──────────────────────────────┬──────────────────────────┬──────────────────────────────┤
│ 🛑 1-TAP DISCONNECT          │ 🚨 REPORT PARTNER        │ 🛡️ PERMANENT BLOCK           │
│ Instantly drop the voice     │ Submit instantaneous     │ Add partner's cryptographic  │
│ connection with 0 ms delay.  │ violation report to      │ alias to your private        │
│                              │ human moderation queue.  │ blacklisted queue forever.   │
└──────────────────────────────┴──────────────────────────┴──────────────────────────────┘
```

### 4.1 How to Report and Block a Partner:
1. Tap the **Report / Disconnect** icon on the top-right of your active call screen.
2. Select the specific infraction reason:
   - *Harassment / Hate Speech*
   - *Inappropriate / Explicit Language*
   - *Commercial Advertising / Solicitation*
   - *Refusal to Speak English*
   - *Microphone Noise / Spam*
3. Check **"Block this user permanently"** (enabled by default).
4. The call is immediately terminated, the offending candidate is logged in the administrative audit telemetry, and PairTalk's Redis matchmaking engine ensures you are never paired together again.

---

## 5. Best Practices for Safe Speaking Practice

- **Stay on IELTS Topic**: If a partner steers the conversation into personal, uncomfortable, or non-exam subjects, politely redirect: *"Let's focus on the Cue Card questions."*
- **Disconnect Immediately If Uncomfortable**: You are never obligated to remain in a call with an impolite or intrusive partner.
- **Microphone Hygiene**: Use wired or Bluetooth headphones with a dedicated microphone to avoid audio feedback and background household noise.
- **Report Retaliatory Ratings**: If an unruly partner attempts to give you an unjustified low score after you end a call, our automated rating validation engine filters out anomalous score spikes.

---

## 6. Audio Security & Encrypted Infrastructure

- **Live Media Encryption**: Real-time voice streams are encrypted in transit using Datagram Transport Layer Security (DTLS) and Secure Real-time Transport Protocol (SRTP).
- **Ephemerality by Default**: Audio is **never recorded** unless both participants explicitly consent.
- **Automated Hard Purge**: All optional cloud recordings are purged automatically upon expiration of your plan's retention window (Free = 24 hours, Plus = 7 days, Pro = 30 days, Boss = 90 days).

---

## 7. Escalation & Safety Contact

If you experience severe harassment, stalking, or security concerns:
- **Telegram Safety Desk**: Contact `@PairTalkSupport`
- **In-App Safety Command**: Type `/support` in `@PairTalkBot`
- **Response SLA**: Safety escalations are prioritized and handled within **2 to 12 hours**.

---

## 8. Summary of Related Guides

- [How Matchmaking Works](./HOW_IT_WORKS.md)
- [IELTS Speaking Practice Guide](./IELTS_SPEAKING_GUIDE.md)
- [Community Guidelines & Moderation Ladder](./COMMUNITY_GUIDELINES.md)
- [Privacy Policy & Refund Terms](./PRIVACY_POLICY.md)
- [Terms of Service](./TERMS_OF_SERVICE.md)
- [FAQ](./FAQ.md)
