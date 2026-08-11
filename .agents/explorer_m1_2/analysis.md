# Comprehensive Analysis Report: Telegram Bot (`grammy`) & Telegram Stars Payments

**Explorer**: Explorer 2 (`teamwork_preview_explorer`)  
**Working Directory**: `D:\telegram-p2p-voice-call\.agents\explorer_m1_2`  
**Target Path**: `D:\telegram-p2p-voice-call\server\src\bot`  
**Date**: 2026-08-11  

---

## 1. Executive Summary

This report provides a complete architectural specification and investigation of the Telegram Bot (`grammy`) and Telegram Stars payment integration required for the IELTS Speaking P2P Partner Match & Voice Call platform.

Inspection of `D:\telegram-p2p-voice-call\server` reveals that while `package.json` includes `grammy` version `^1.26.0`, the `src/bot/` directory does **not yet exist** in the repository. All bot handlers, commands, keyboards, post-call cards, payment webhooks, and notification dispatchers are **0% implemented** and must be created by the implementation worker.

This analysis provides exact logic chains, schemas, code patterns, and file layouts to enable seamless implementation of all 5 primary Telegram Bot feature areas required by `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `SCOPE.md`.

---

## 2. Current Implementation State vs Requirements

| Feature Component | Status | Existing Files | Notes / Gap Analysis |
|---|---|---|---|
| Grammy Bot Dependency | ✅ Installed | `server/package.json` | `grammy` v1.26.0 installed. Supports Telegram Stars (`XTR` currency code). |
| Bot Core Setup | ❌ Missing | None | `src/bot/index.ts` and `src/bot/types.ts` must be created. |
| `/start` Onboarding Flow | ❌ Missing | None | Needs wizard/session handling for FC, LR, GRA, P sub-scores & permanent alias locking. |
| Stealth `/admin` 2FA Link | ❌ Missing | None | Needs Telegram ID check, stealth unrecognized command response, 5-min 2FA token generator. |
| Main Menu Keyboard | ❌ Missing | None | Needs `ReplyKeyboardMarkup` with 6 interactive buttons & sub-menus. |
| Post-Call Review Card | ❌ Missing | None | Needs 1-5 star audio rating callback, recording access link, and partner reporting trigger. |
| Telegram Stars Invoicing & Webhooks | ❌ Missing | None | Needs `replyWithInvoice` (`XTR`), `pre_checkout_query` (<10s answer), `successful_payment` DB update. |
| Notification Queue | ❌ Missing | None | Needs rate-limit resilient queue handling Telegram API 429 retries and 403 user block errors. |

---

## 3. Requirement-by-Requirement Technical Specifications

### 3.1 `/start` Onboarding Command & Sub-score Capture & Alias Locking
1. **Command Handling**:
   - Registered via `bot.command("start", ...)`.
   - Checks if user exists in SQLite DB by `telegram_id = ctx.from.id`.
   - If user exists and `onboarded === true`:
     - Displays welcome back card with current IELTS Band, sub-scores, plan tier, and presents the **Main Menu Keyboard**.
   - If user is new or `onboarded === false`:
     - Generates a **unique plain-text alias** (e.g. `P2P-Partner-7829` or custom randomized prefix).
     - Initiates multi-step sub-score capture (using Grammy session or inline keyboard wizard):
       - Step 1: **FC** (Fluency & Coherence) selection from `4.0` to `9.0`.
       - Step 2: **LR** (Lexical Resource) selection from `4.0` to `9.0`.
       - Step 3: **GRA** (Grammatical Range & Accuracy) selection from `4.0` to `9.0`.
       - Step 4: **P** (Pronunciation) selection from `4.0` to `9.0`.
       - Step 5: **Confirmation**: Calculates Overall Band using standard IELTS formula:
         $$\text{Overall Band} = \operatorname{round}\left( \frac{\text{FC} + \text{LR} + \text{GRA} + \text{P}}{4} \times 2 \right) / 2$$
         Presents summary card with `[ ✅ Confirm & Save Profile ]` inline button.
     - On confirmation: Writes `fc`, `lr`, `gra`, `p`, `overall_band`, `alias`, and `onboarded = true` to DB.
     - **Alias Locking**: Once saved, `alias` is **locked permanently** and cannot be altered by normal menu interactions.

### 3.2 Stealth `/admin` 2FA Login Link Generator
1. **Security Mechanics**:
   - Environment variable `ADMIN_TELEGRAM_IDS` holds comma-separated authorized admin Telegram user IDs (e.g. `12345678,98765432`).
   - When a user sends `/admin`:
     - Check `authorized_ids.includes(ctx.from.id)`.
     - **Non-authorized User (Stealth Mode)**:
       - The bot MUST NOT reply with "Access Denied" or "Unauthorized" (which exposes the existence of the secret `/admin` command).
       - Bot replies with default unrecognized command response or ignores: *"Unknown command. Type /start to open main menu."*
     - **Authorized Admin**:
       - Bot generates a crypto-random 32-character hexadecimal 1-time token (`crypto.randomBytes(16).toString('hex')`).
       - Stores token in Redis or in-memory auth cache with 5-minute (300 seconds) expiration: `{ telegramId, createdAt: Date.now() }`.
       - Constructs Web Admin Panel link: `${ADMIN_PANEL_URL}/login?token=${token}`.
       - Sends private Telegram message with Markdown link & button:
         `"🔐 *Stealth Admin 2FA Link Generated*\n\nThis link is valid for single-use within 5 minutes:\n\n[🔗 Open Admin Dashboard](${loginUrl})\n\n_Master password will be requested on login page._"`

### 3.3 Interactive Main Menu Keyboard Buttons
The Telegram bot uses a persistent `ReplyKeyboardMarkup` (`resize_keyboard: true`):

```ts
const mainMenuKeyboard = new Keyboard()
  .webApp("📞 Find Partner", MINI_APP_URL)
  .text("👤 Profile")
  .row()
  .text("📁 Recordings")
  .text("⭐ Plans")
  .row()
  .text("📞 Direct Call")
  .text("💬 Support")
  .resized();
```

1. 📞 **Find Partner**: Uses Telegram `webApp` button type to open Mini App overlay directly inside Telegram.
2. 👤 **Profile**:
   - Displays user details: Alias, Band, Sub-scores, Plan Tier, Daily Calls remaining, DND status.
   - Inline action buttons: `[ ✏️ Re-evaluate Sub-scores ]` and `[ 🔕 Toggle DND ]`.
3. 📁 **Recordings**:
   - Queries DB for past call recordings involving `ctx.from.id`.
   - Filters retention based on user's `plan_tier`:
     - Free: 1 day (24 hours) retention.
     - Plus: 7 days retention.
     - Pro: 30 days retention.
   - Shows active audio stream URLs for valid recordings and `[ ❌ Expired ]` tag for older ones.
4. ⭐ **Plans**:
   - Displays side-by-side tier breakdown:
     - Free: 15-min limit, 3 daily calls, 1-day storage. Price: Free.
     - Plus: 30-min limit, 10 daily calls, 7-day storage. Price: 150 Telegram Stars.
     - Pro: 60-min limit, unlimited calls, 30-day storage. Price: 500 Telegram Stars.
   - Inline purchase buttons: `[ ⭐ Upgrade to Plus (150 Stars) ]` and `[ ⭐ Upgrade to Pro (500 Stars) ]`.
5. 📞 **Direct Call**:
   - Lists saved favorite partners (`favorite_partners` table).
   - Allows selecting a favorite to send a direct call invitation.
   - Provides `[ ➕ Add Favorite by Alias ]` option.
6. 💬 **Support**:
   - Provides FAQ, Contact Admin, and `[ ⚖️ Submit Unblock Appeal ]` for banned users.

### 3.4 Post-Call Review Card
When a voice call finishes, the backend signaling service triggers `sendPostCallReview(bot, userId, sessionData)`:

1. **Card Layout**:
   ```
   📞 *Practice Session Complete!*

   • Partner: *{partner_alias}*
   • Duration: *{duration_mm_ss}*
   • Recording: [🎧 Listen Audio Recording]({recording_url})

   *How was your call audio quality?*
   ```
2. **Inline Rating Buttons**:
   - `[ ⭐ 1 ]` `[ ⭐ 2 ]` `[ ⭐ 3 ]` `[ ⭐ 4 ]` `[ ⭐ 5 ]` -> callback `rate_audio:<session_id>:<stars>`
3. **Report Partner Button**:
   - `[ ⚠️ Report Bad Partner ]` -> callback `report_partner:<session_id>:<partner_id>`
4. **Callback Handling**:
   - `rate_audio`: Updates `audio_rating` in `call_sessions` table and updates message to show rating submitted.
   - `report_partner`: Opens inline menu to select reason (`Abusive`, `Silent / No Audio`, `Off-Topic`, `Inappropriate`).
     - Inserts record into `moderation_reports`.
     - Calls Moderation Penalty Ladder:
       - 1st Report -> Sends Warning notification via bot to reported user.
       - 2nd Report (in 30 days) -> Applies 6-hour temporary ban (`banned_until`).
       - 3rd Report -> Applies Permanent Lock (`is_permanently_banned = true`).

### 3.5 Telegram Stars Payment & Invoice System
1. **Invoice Creation**:
   - Using Grammy's `ctx.replyWithInvoice`:
     ```ts
     await ctx.replyWithInvoice(
       "Plus Plan Subscription",
       "30-min call limit, 10 daily calls, 7-day recording retention",
       `plan_purchase:plus:${ctx.from.id}:${Date.now()}`, // payload
       "", // MUST BE EMPTY STRING FOR TELEGRAM STARS!
       "XTR", // MUST BE XTR FOR TELEGRAM STARS!
       [{ label: "Plus Plan (1 Month)", amount: 150 }]
     );
     ```
2. **`pre_checkout_query` Webhook**:
   - Telegram sends `pre_checkout_query` update when user clicks Pay.
   - Handler verifies order payload and MUST respond with `ctx.answerPreCheckoutQuery(true)` within 10 seconds.
3. **`successful_payment` Webhook**:
   - Handles `message:successful_payment`.
   - Extracts `telegram_payment_charge_id` and invoice payload.
   - Updates user in DB: sets `plan_tier` (`plus`/`pro`), sets `plan_expires_at = now + 30 days`.
   - Inserts record into DB `transactions` table (`telegram_id`, `plan_tier`, `amount_stars`, `charge_id`, `created_at`).
   - Sends Telegram confirmation message to user.

---

## 4. Target Architecture & Recommended File Layout

```
server/src/bot/
├── index.ts                     # Grammy Bot instantiation, error catching, middleware & command registration
├── types.ts                     # Bot Context interfaces, SessionData, payload types
├── commands/
│   ├── start.ts                 # /start command & sub-scores onboarding wizard
│   └── admin.ts                 # Stealth /admin command with 2FA token generation
├── handlers/
│   ├── menu.ts                  # Main menu reply keyboard listeners (Profile, Recordings, Plans, Direct Call, Support)
│   ├── post_call.ts             # Post-call review message generator, 1-5 star audio rating & partner report callbacks
│   ├── callbacks.ts             # Generic inline keyboard callback query router (DND toggle, sub-scores re-evaluation)
│   └── payments.ts              # Telegram Stars invoice generator, pre_checkout_query & successful_payment handlers
└── notifications.ts             # Rate-limited bot notification dispatcher (handles API 429 retries & 403 blocked)
```

---

## 5. Required Database Schema Specifications

To support the bot functionalities, the database schema (SQLite / Prisma) must include:

```sql
-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  alias TEXT UNIQUE NOT NULL,
  fc REAL DEFAULT 6.0,
  lr REAL DEFAULT 6.0,
  gra REAL DEFAULT 6.0,
  p REAL DEFAULT 6.0,
  overall_band REAL DEFAULT 6.0,
  plan_tier TEXT DEFAULT 'free', -- 'free', 'plus', 'pro'
  plan_expires_at DATETIME,
  is_dnd BOOLEAN DEFAULT 0,
  onboarded BOOLEAN DEFAULT 0,
  banned_until DATETIME,
  is_permanently_banned BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table (Telegram Stars Payments)
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  plan_tier TEXT NOT NULL,
  amount_stars INTEGER NOT NULL,
  charge_id TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Moderation Reports Table
CREATE TABLE IF NOT EXISTS moderation_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  reported_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Favorite Partners Table
CREATE TABLE IF NOT EXISTS favorite_partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  partner_alias TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, partner_alias)
);
```

---

## 6. Implementation Snippets for Implementer

### 6.1 `server/src/bot/index.ts`
```ts
import { Bot, session } from "grammy";
import { MyContext, SessionData } from "./types.js";
import { setupStartCommand } from "./commands/start.js";
import { setupAdminCommand } from "./commands/admin.js";
import { setupMenuHandlers } from "./handlers/menu.js";
import { setupPaymentHandlers } from "./handlers/payments.js";
import { setupCallbackHandlers } from "./handlers/callbacks.js";

export function createBot(token: string): Bot<MyContext> {
  const bot = new Bot<MyContext>(token);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({ step: "idle" }),
    })
  );

  // Error handling middleware
  bot.catch((err) => {
    console.error(`[Grammy Error] Error in update ${err.ctx.update.update_id}:`, err.error);
  });

  // Register commands & handlers
  setupStartCommand(bot);
  setupAdminCommand(bot);
  setupMenuHandlers(bot);
  setupPaymentHandlers(bot);
  setupCallbackHandlers(bot);

  return bot;
}
```

### 6.2 `server/src/bot/handlers/payments.ts`
```ts
import { Bot } from "grammy";
import { MyContext } from "../types.js";

export function setupPaymentHandlers(bot: Bot<MyContext>) {
  // Pre-checkout query handler (MUST reply within 10s)
  bot.on("pre_checkout_query", async (ctx) => {
    try {
      const payload = ctx.preCheckoutQuery.invoice_payload;
      if (!payload || !payload.startsWith("plan_purchase:")) {
        await ctx.answerPreCheckoutQuery(false, { error_message: "Invalid invoice payload." });
        return;
      }
      await ctx.answerPreCheckoutQuery(true);
    } catch (err) {
      console.error("Pre-checkout query failed:", err);
      await ctx.answerPreCheckoutQuery(false, { error_message: "Checkout error occurred." });
    }
  });

  // Successful payment handler
  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;
    const payload = payment.invoice_payload;
    const parts = payload.split(":");
    const tier = parts[1]; // 'plus' or 'pro'

    // Update DB user tier & record transaction...
    await ctx.reply(`🎉 *Payment Received!* Your subscription has been upgraded to *${tier.toUpperCase()}*.`, {
      parse_mode: "Markdown",
    });
  });
}
```

---

## 7. Summary & Next Steps

1. Worker agent can create `server/src/bot/` with the target file structure outlined in Section 4.
2. Implement DB interaction helper methods for users, transactions, reports, and favorites.
3. Verify compilation via `npm run build` in `server/`.
