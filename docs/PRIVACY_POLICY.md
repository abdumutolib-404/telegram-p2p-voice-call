# PairTalk Privacy Policy

**Effective Date:** August 16, 2026

Welcome to **PairTalk**, the real-time peer-to-peer IELTS Speaking practice platform. We are committed to protecting your personal data, ensuring privacy, and maintaining transparency about how our platform operates.

---

## 1. Information We Collect

### A. Telegram Profile Data
When you launch the Mini App or interact with our Telegram Bot, we receive:
- **Telegram User ID**: Numeric identifier used for account authentication and matchmaking.
- **Display Name / Alias**: Your permanent randomized practice alias (e.g. `P2P-0284DB68`). We do not display or share your real Telegram username or phone number with other learners.
- **Band Score & Skills**: Self-reported target IELTS band score and sub-skill ratings (Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation) used solely for matching you with appropriate practice partners.

### B. Voice Call Metadata
For operational integrity, quota tracking, and abuse prevention, we record:
- **Call Session Identifiers**: Unique session IDs linking caller and callee.
- **Timestamps & Durations**: Start time, end time, and total connected seconds.
- **Call Outcomes**: Normal completion, user hangup, network timeout, or cancellation.

### C. Payment & Transaction Records
- **Telegram Stars (XTR)**: Transaction IDs, amounts, and plan tiers processed directly via Telegram Stars API. We do not process or store credit card numbers for Stars purchases.
- **Manual UZS Card Transfers**: Payment receipt metadata (`file_id`, MIME type, timestamp, amount) submitted by users for administrative verification.

---

## 2. Voice Audio & Recording Policy

- **Real-Time Voice Calls**: All active voice audio streams are routed through encrypted WebRTC Selective Forwarding Units (SFUs). Live audio is ephemeral and never listened to by administrators.
- **Optional Call Recordings**:
  - Recording is **opt-in** and initiated by participants during a call.
  - Recorded audio files are stored in access-controlled, isolated cloud storage (AWS S3) with strict expiration windows based on your subscription tier:
    - **Free Plan**: 1 day retention (1 recording/month)
    - **Plus Plan**: 7 days retention (3 recordings/month)
    - **Pro Plan**: 30 days retention (7 recordings/month)
    - **Boss Plan**: 90 days retention (15 recordings/month)
  - Only call participants may retrieve and listen to their session recordings.
  - When the retention window expires, recording files and database references are permanently purged.

---

## 3. Data Retention & Erasure

- **Account Data**: Maintained while your account is active.
- **Right to Deletion**: You may request complete erasure of your profile and history at any time by contacting `@PairTalkSupport` or using support commands in the bot.

---

## 4. Security & Access Control

- All WebRTC connections use DTLS/SRTP encryption.
- Administrative endpoints are protected by 2FA one-time passwords and strict IP/Telegram ID whitelists.
- We never sell, rent, or trade your personal data to third parties.

---

## 5. Contact & Inquiries

For questions regarding this policy or data protection requests:
- **Telegram Support**: `@PairTalkSupport`
- **In-App Command**: `/paysupport`
