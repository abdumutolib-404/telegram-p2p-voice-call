# PairTalk REST API Specification Reference

> **Standard**: Cloudflare / Stripe / AWS Enterprise REST API Documentation  
> **Base Ingress URL**: `https://pairtalk.online` (or `http://localhost:3001` in local dev)  
> **Content-Type**: `application/json; charset=utf-8` (unless otherwise specified)  
> **Correlation Tracking**: All requests accept and return the `X-Request-ID` header.

---

## 1. Global Invariants & Standard Error Format

### 1.1 Canonical Error Schema

All API error responses adhere to the canonical schema:

```json
{
  "error": "Human-readable diagnostic description of the failure.",
  "code": "CANONICAL_ERROR_CODE",
  "status": "error",
  "retryAfterSeconds": 300
}
```

### 1.2 Common HTTP Status Codes

| Code | Status Phrase | Meaning & Invariant |
| :--- | :--- | :--- |
| `200` | **OK** | Standard successful response. Payload returned in body. |
| `201` | **Created** | Resource successfully created (e.g. topic created, challenge generated). |
| `301` | **Moved Permanently** | Canonical host redirection (e.g. `www.pairtalk.online` -> `pairtalk.online`). |
| `302` | **Found** | Temporary redirect (e.g. presigned S3 audio download URL). |
| `400` | **Bad Request** | Malformed JSON, missing mandatory fields, or invalid enum values. |
| `401` | **Unauthorized** | Missing, expired, or cryptographically invalid session or auth token. |
| `403` | **Forbidden** | Account suspended/banned, quota exhausted, or admin privilege required. |
| `404` | **Not Found** | Resource ID does not exist or has expired past retention. |
| `409` | **Conflict** | Unique constraint violation (e.g. slug already taken, duplicate order). |
| `429` | **Too Many Requests** | Distributed rate limit exceeded or active abuse penalty block triggered. |
| `500` | **Internal Server Error** | Unhandled exception or subsystem degradation. |
| `503` | **Service Unavailable** | Primary database or Redis ping failure during health probe. |

---

## 2. Server Root & Public Edge Endpoints

### 2.1 Direct Gateway Liveness Check

```http
GET /healthz
```

- **Auth**: None (Public)
- **Description**: Probes the Go Gateway engine directly without proxying to Node.js.
- **Headers**: None
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "service": "gateway",
  "timestamp": "2026-09-06T17:30:00Z"
}
```

---

### 2.2 Deep System Health Check

```http
GET /health
```

- **Auth**: None (Public)
- **Description**: Forwarded through Go reverse proxy to Node.js backend. Verifies PostgreSQL connectivity.
- **Headers**: None
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-09-06T17:30:00.123Z"
}
```
- **Response `503 Service Unavailable`**:
```json
{
  "status": "error",
  "db": "disconnected",
  "error": "Database connection timeout"
}
```

---

### 2.3 Search Engine Crawler Policy

```http
GET /robots.txt
```

- **Auth**: None (Public)
- **Description**: Dynamically serves crawler exclusion and allowance rules based on request `Host`.
- **Response `200 OK` (`text/plain`)**:
```text
User-agent: Googlebot
User-agent: Bingbot
User-agent: ClaudeBot
Allow: /
Disallow: /api/
Disallow: /admin
Sitemap: https://pairtalk.online/sitemap.xml
```

---

### 2.4 Dynamic XML Sitemap

```http
GET /sitemap.xml
```

- **Auth**: None (Public)
- **Description**: XML sitemap of public landing pages, guidelines, and privacy policies.
- **Response `200 OK` (`application/xml`)**: Valid XML sitemap specification.

---

## 3. Authentication & Verification APIs

### 3.1 Telegram WebApp Handshake & Verification

```http
POST /api/auth/verify
```

- **Auth**: None (Validates Telegram HMAC signature).
- **Rate Limit**: Action `AUTH_VERIFY` (20 req / 60s, penalty 300s).
- **Headers**:
  - `x-telegram-init-data`: (Optional if provided in body) Raw query string from `Telegram.WebApp.initData`.
- **Request Body**:
```json
{
  "initData": "query_id=AAHd...&user=%7B%22id%22%3A12345678...%7D&auth_date=1725640000&hash=d3b07384d..."
}
```

- **Response `200 OK` (Access Granted)**:
```json
{
  "success": true,
  "status": "granted",
  "access": "granted",
  "user": {
    "id": "usr_7b9d1e2f-3a4b-5c6d-7e8f-9a0b1c2d3e4f",
    "telegramId": "12345678",
    "alias": "P2P-Partner-7821",
    "band": 6.5,
    "subFC": 6.0,
    "subLR": 7.0,
    "subGRA": 6.5,
    "subP": 6.5,
    "plan": "FREE",
    "isBanned": false,
    "profile": {
      "plan": "FREE",
      "rank": 0,
      "isActivePaid": false,
      "dailyCallsUsed": 1,
      "dailyCallsLimit": 3,
      "maxCallDurationMinutes": 15,
      "recordingsUsed": 0,
      "recordingsLimit": 1,
      "retentionDays": 1
    },
    "hasActiveCall": false,
    "activeCall": null
  }
}
```

- **Response `200 OK` (Active Call In Progress on Another Device/Tab)**:
```json
{
  "success": true,
  "status": "granted",
  "access": "granted",
  "hasActiveCall": true,
  "activeCall": {
    "id": "sess_8a7f6c5b-1122-3344-5566-778899aabbcc",
    "roomName": "room_8a7f6c5b-1122-3344-5566-778899aabbcc",
    "partnerAlias": "P2P-Partner-1042"
  },
  "user": { ... }
}
```

- **Response `200 OK` (Quota Exhausted)**:
```json
{
  "success": true,
  "status": "exhausted_quota",
  "access": "exhausted_quota",
  "reason": "exhausted_quota",
  "user": { ... }
}
```

- **Response `403 Forbidden` (Suspended / Banned / Tampered Signature)**:
```json
{
  "error": "Account is temporarily suspended.",
  "code": "suspended",
  "reason": "suspended",
  "status": "suspended",
  "bannedUntil": "2026-09-07T12:00:00.000Z",
  "remainingSeconds": 64800,
  "user": {
    "id": "usr_7b9d1e2f-3a4b-5c6d-7e8f-9a0b1c2d3e4f",
    "telegramId": "12345678",
    "alias": "P2P-Partner-7821"
  }
}
```

---

### 3.2 Bot Information Discovery

```http
GET /api/auth/bot-info
```

- **Auth**: None (Public)
- **Response `200 OK`**:
```json
{
  "botUsername": "PairTalkBot",
  "appUrl": "https://pairtalk.online/client",
  "status": "ok"
}
```

---

## 4. Voice Calls & Recording Retrieval APIs

### 4.1 Query Active Call Session

```http
GET /api/calls/active
```

- **Auth**: Telegram `initData` token header (`x-telegram-init-data`).
- **Response `200 OK` (No Active Call)**:
```json
{
  "hasActiveCall": false
}
```

- **Response `200 OK` (Active Call Found)**:
```json
{
  "hasActiveCall": true,
  "roomName": "room_7b9d1e2f-3a4b-5c6d-7e8f-9a0b1c2d3e4f",
  "livekitToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "livekitUrl": "https://pairtalk.livekit.cloud",
  "partnerAlias": "P2P-Partner-4412",
  "partnerBand": 7.0,
  "callDurationLimit": 840
}
```

---

### 4.2 Retrieve Audio Call Recording

```http
GET /api/calls/recording/:sessionId
GET /api/calls/:sessionId/recording
```

- **Auth**: Telegram `initData` token header (`x-telegram-init-data`).
- **Path Parameters**:
  - `sessionId`: UUID string of the completed `CallSession`.
- **Query Parameters**:
  - `format`: Optional. Pass `json` to receive the presigned S3 URL as JSON rather than an immediate `302 Found` redirect.
- **Response `302 Found`**:
  - `Location`: `https://pairtalk-recordings.s3.amazonaws.com/recordings/room_...mp3?AWSAccessKeyId=...&Signature=...`
- **Response `200 OK` (`format=json`)**:
```json
{
  "url": "https://pairtalk-recordings.s3.amazonaws.com/recordings/room_...mp3?...",
  "size": 1548290,
  "contentType": "audio/mpeg",
  "expiresInSeconds": 3600
}
```
- **Error Responses**:
  - `401 Unauthorized`: Missing authentication.
  - `403 Forbidden`: Requester was not a participant in this call session, or the plan's retention period has expired.
  - `404 Not Found`: Recording file not found or egress failed.

---

## 5. IELTS Question Bank & Content APIs

### 5.1 List Active Topics

```http
GET /api/ielts/topics
```

- **Auth**: None (Public)
- **Response `200 OK`**:
```json
{
  "success": true,
  "topics": [
    {
      "id": "top_01",
      "name": "Artificial Intelligence & Automation",
      "slug": "artificial-intelligence-automation",
      "description": "Technological advancements, societal impact, and ethics in AI.",
      "relevance": 9,
      "isActive": true,
      "_count": { "questions": 24 }
    }
  ]
}
```

---

### 5.2 Query Paginated Questions (Redis Cached)

```http
GET /api/ielts/questions
```

- **Auth**: None (Public)
- **Headers**:
  - `x-bypass-cache`: `true` (Optional: bypass 5-minute Redis cache).
- **Query Parameters**:
  - `part`: Optional enum (`PART_1`, `PART_2`, `PART_3`).
  - `topicId`: Optional UUID or topic slug string.
  - `limit`: Integer (1-50, default `30`).
  - `page`: Integer (default `1`).
  - `fresh`: `true` (alias for cache bypass).
- **Response `200 OK`**:
```json
{
  "success": true,
  "questions": [
    {
      "id": "que_123",
      "topicId": "top_01",
      "part": "PART_2",
      "questionText": "Describe a time when you used artificial intelligence to solve a problem.",
      "cueCardBullets": "[\"What the tool was\",\"Why you needed it\",\"How it helped you\",\"How you felt about the result\"]",
      "questionType": "CUE_CARD",
      "source": "OFFICIAL_RECALL",
      "sourceHash": "a9f4c3...fingerprint",
      "isActive": true,
      "createdAt": "2026-09-01T10:00:00.000Z",
      "topic": {
        "id": "top_01",
        "name": "Artificial Intelligence & Automation",
        "slug": "artificial-intelligence-automation"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 30,
    "total": 142,
    "totalPages": 5
  }
}
```

---

### 5.3 Export Questions (JSON / CSV)

```http
GET /api/ielts/questions/export
```

- **Auth**: None (Public)
- **Query Parameters**:
  - `part`: Optional enum (`PART_1`, `PART_2`, `PART_3`).
  - `topicId`: Optional topic ID or slug.
  - `format`: `json` or `csv` (default `json`).
- **Response `200 OK` (`format=csv`)**:
  - `Content-Type`: `text/csv; charset=utf-8`
  - `Content-Disposition`: `attachment; filename="ielts_questions_all_2026-09-06.csv"`

---

## 6. LiveKit Webhook Handler

```http
POST /api/livekit/webhook
```

- **Auth**: LiveKit cryptographic Authorization header verified via `WebhookReceiver`.
- **Headers**:
  - `Authorization`: Cryptographic signature generated by LiveKit server.
- **Request Body**: Raw LiveKit Webhook Event payload (`egress_started` or `egress_ended`).
- **Response `200 OK`**:
```text
OK
```
- **Error Response `401 Unauthorized`**: Signature verification failure.

---

## 7. Admin Operations & Stealth 2FA APIs

### 7.1 Stealth 2FA Step 1: Master Password Authentication

```http
POST /api/admin/auth/password
```

- **Auth**: None
- **Rate Limit**: Action `ADMIN_LOGIN` (5 req / 900s, penalty 900s).
- **Request Body**:
```json
{
  "password": "MasterAdminSecretPassword123!"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "challengeId": "ch_98f1a2b3c4d5e6f7",
  "message": "Two-factor verification code dispatched to authorized Telegram administrators.",
  "expiresInSeconds": 300
}
```
- **Error Response `401 Unauthorized`**: Invalid password.

---

### 7.2 Stealth 2FA Step 2: One-Time Password (OTP) Verification

```http
POST /api/admin/auth/otp
```

- **Auth**: None
- **Rate Limit**: Action `ADMIN_OTP` (10 req / 900s, penalty 900s).
- **Request Body**:
```json
{
  "challengeId": "ch_98f1a2b3c4d5e6f7",
  "otp": "839201"
}
```
- **Response `200 OK`**:
  - Sets HTTP-only secure cookie `admin_session` with 24-hour TTL.
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "admin": {
    "username": "PairTalk Root Administrator",
    "role": "SUPER_ADMIN"
  }
}
```

---

### 7.3 Admin Logout

```http
POST /api/admin/auth/logout
```

- **Auth**: Admin JWT Cookie or Bearer header.
- **Response `200 OK`**: Clears `admin_session` cookie and responds with `{ "success": true }`.

---

### 7.4 Cluster Telemetry Probes

All telemetry endpoints require Admin Auth (`Authorization: Bearer <token>` or `admin_session` cookie).

#### Health Probe: `GET /api/admin/telemetry/health`
```json
{
  "status": "ok",
  "api": {
    "uptime": 142850,
    "memoryMb": 182
  },
  "database": {
    "status": "healthy",
    "latencyMs": 4
  },
  "redis": {
    "status": "healthy",
    "latencyMs": 2
  },
  "livekit": {
    "status": "healthy",
    "activeRooms": 14
  },
  "bot": {
    "status": "healthy",
    "polling": true
  }
}
```

#### Queue Distribution: `GET /api/admin/telemetry/queue`
```json
{
  "totalWaiting": 18,
  "buckets": {
    "match_queue:6.5:FC:LR": 3,
    "match_queue:7.0:LR:FC": 2,
    "match_queue:priority:BOSS": 1,
    "match_queue:band:6.5": 5
  }
}
```

#### Active WebRTC Rooms: `GET /api/admin/telemetry/active-calls`
```json
{
  "count": 2,
  "rooms": [
    {
      "sessionId": "a8f3b2c1...",
      "roomName": "room_7b9d1e2f...",
      "userA": { "id": "usr_1", "alias": "P2P-Partner-101", "band": 6.5 },
      "userB": { "id": "usr_2", "alias": "P2P-Partner-202", "band": 6.5 },
      "durationSeconds": 340,
      "createdAt": "2026-09-06T17:20:00Z"
    }
  ]
}
```

#### Ring Buffer Errors: `GET /api/admin/telemetry/errors`
Returns recent structured operational error logs from memory.

---

## 8. Admin Candidate & Payment Operations APIs

### 8.1 Candidate Management

- `GET /api/admin/users`: Paginated candidate search by alias, telegramId, or plan. Query params: `page`, `limit`, `search`, `plan`.
- `PATCH /api/admin/users/:id/plan`: Adjust user plan tier (`FREE`, `PLUS`, `PRO`, `BOSS`), custom call duration limit, or retention days.
  - Body: `{ "plan": "PRO", "maxDuration": 60, "retentionOverride": 30 }`
- `POST /api/admin/users/:id/moderate`: Issue warnings. Body: `{ "action": "WARN", "reason": "Background music" }`
- `POST /api/admin/users/:id/ban`: Impose temporary or permanent suspension.
  - Body: `{ "ban": true, "permanent": false, "durationHours": 24, "reason": "Offensive language" }`

### 8.2 Payment Processing & Disputes

- `GET /api/admin/payments/manual`: Query manual UZS payment requests. Query params: `status` (`PENDING`, `APPROVED`, `REJECTED`, `REFUND_PENDING`, `REFUNDED`).
- `GET /api/admin/payments/manual/:id/receipt`: Streams or provides presigned URL to uploaded payment receipt screenshot.
- `POST /api/admin/payments/manual/:id/approve`: Approves payment, updates user plan, and triggers notification message via Telegram bot.
- `POST /api/admin/payments/manual/:id/reject`: Rejects payment with feedback. Body: `{ "reason": "Blurry screenshot" }`
- `POST /api/admin/payments/manual/:id/refund`: Authorizes refund with receipt proof. Body: `{ "refundProof": "https://..." }`
- `GET /api/admin/payments/stars`: Queries Telegram Stars transaction log.
- `POST /api/admin/payments/stars/:id/refund`: Records Telegram Stars refund and revokes upgraded tier.

---

## 9. Admin IELTS Crawler & Question Governance APIs

Mounted under `/api/admin/ielts/*`:

| Method & Route | Access | Payload / Query | Description |
| :--- | :--- | :--- | :--- |
| `GET /topics` | Admin | - | List all topics including inactive topics with question counts. |
| `POST /topics` | Admin | `{ "name", "slug", "description", "relevance" }` | Create new IELTS topic. Returns `201 Created`. |
| `PATCH /topics/:id` | Admin | `{ "name", "description", "relevance", "isActive" }` | Update topic properties or toggle active status. |
| `DELETE /topics/:id` | Admin | - | Deletes topic and cascades question records. |
| `GET /questions` | Admin | `topicId`, `part`, `page`, `limit` | Full catalog of questions including inactive items. |
| `POST /questions` | Admin | `{ "topicId", "part", "questionText", "cueCardBullets", "questionType" }` | Create question with SHA-256 fingerprint deduplication. |
| `PATCH /questions/:id` | Admin | `{ "questionText", "cueCardBullets", "isActive" }` | Update question text and regenerate hash. |
| `DELETE /questions/:id` | Admin | - | Delete question item. |
| `POST /questions/bulk` | Admin | `{ "items": [...], "defaultTopicId": "..." }` | Batch import question strings with automatic deduplication. |
| `GET /crawler/status` | Admin | - | Fetches latest sync log, question counts, and Gemini status. |
| `POST /crawler/gemini-check` | Admin | - | Executes live network ping to Google Gemini 2.0 Flash API. |
| `GET /crawler/logs` | Admin | - | Retrieves 20 most recent crawler sync execution logs. |
| `POST /crawler/run` | Admin | `{ "customUrl": "...", "deepCrawl": boolean }` | Triggers immediate background crawler ingestion cycle. |
| `POST /crawler/filter-run` | Admin | - | Triggers daily question sanitation and deduplication filter. |
