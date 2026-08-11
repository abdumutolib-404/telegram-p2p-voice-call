/**
 * test/harness/botMock.js
 * Telegram Bot API mock runner for commands, keyboards, Stars payments, and post-call reviews.
 */

const { db } = require('./dbHelper');
const crypto = require('crypto');

class TelegramBotMock {
  constructor(options = {}) {
    this.botToken = options.botToken || '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz_TEST_TOKEN';
    this.adminTelegramIds = new Set(options.adminTelegramIds || ['123456789', '999888777', 'admin_1']);
    this.sentMessages = new Map(); // telegramId -> Array<message>
    this.sentInvoices = new Map(); // telegramId -> Array<invoice>
    this.db = options.db || db;
  }

  // --- MESSAGE TRACKING ---

  recordMessage(telegramId, messagePayload) {
    const id = String(telegramId);
    if (!this.sentMessages.has(id)) {
      this.sentMessages.set(id, []);
    }
    const msg = {
      message_id: Math.floor(Math.random() * 100000),
      chat_id: id,
      date: Math.floor(Date.now() / 1000),
      ...messagePayload
    };
    this.sentMessages.get(id).push(msg);
    return msg;
  }

  getLastMessage(telegramId) {
    const msgs = this.sentMessages.get(String(telegramId));
    return msgs && msgs.length > 0 ? msgs[msgs.length - 1] : null;
  }

  clearMessageHistory(telegramId) {
    if (telegramId) {
      this.sentMessages.delete(String(telegramId));
    } else {
      this.sentMessages.clear();
    }
  }

  // --- COMMAND HANDLING ---

  /**
   * Simulates onboarding via /start command with sub-scores.
   * @param {string|number} telegramId
   * @param {object} [subscores={ FC: 6.5, LR: 6.5, GRA: 6.5, P: 6.5 }]
   * @returns {object} { user, message }
   */
  simulateStartOnboarding(telegramId, subscores = { FC: 6.5, LR: 6.5, GRA: 6.5, P: 6.5 }) {
    const idStr = String(telegramId);
    let user = this.db.getUserByTelegramId(idStr);

    // Validate subscores
    for (const key of ['FC', 'LR', 'GRA', 'P']) {
      const score = subscores[key];
      if (score === undefined || score < 5.0 || score > 9.0) {
        return {
          error: `Invalid ${key} sub-score. Must be between 5.0 and 9.0.`,
          user: null,
          message: this.recordMessage(idStr, { text: 'Invalid sub-score format. Please retry.' })
        };
      }
    }

    const band = Number(((subscores.FC + subscores.LR + subscores.GRA + subscores.P) / 4).toFixed(1));

    if (!user) {
      const alias = `IELTS_Partner_${Math.floor(1000 + Math.random() * 9000)}`;
      user = this.db.seedUser({
        telegramId: idStr,
        alias,
        band,
        subscores,
        plan: 'FREE'
      });
    } else {
      user = this.db.updateUser(user.id, { band, subscores });
    }

    const message = this.recordMessage(idStr, {
      text: `🎉 Welcome to IELTS Speaking P2P Matchmaking!\n\nYour Sub-scores: FC ${subscores.FC}, LR ${subscores.LR}, GRA ${subscores.GRA}, P ${subscores.P} (Band ${band})\nYour Alias: ${user.alias}\n\nSelect an option from the menu below:`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📞 Find Partner', web_app: { url: 'https://mini-app.example.com' } }],
          [{ text: '👤 Profile', callback_data: 'cb_profile' }, { text: '📁 Recordings', callback_data: 'cb_recordings' }],
          [{ text: '⭐ Plans', callback_data: 'cb_plans' }, { text: '📞 Direct Call', callback_data: 'cb_direct_call' }],
          [{ text: '💬 Support', callback_data: 'cb_support' }]
        ]
      }
    });

    return { user, message };
  }

  /**
   * Simulates stealth /admin command.
   * @param {string|number} telegramId
   * @returns {object} { isAuthorized, message, token }
   */
  simulateAdminCommand(telegramId) {
    const idStr = String(telegramId);
    const isAuthorized = this.adminTelegramIds.has(idStr);

    if (!isAuthorized) {
      // Stealth security: return unrecognized command message
      const message = this.recordMessage(idStr, {
        text: 'Unknown command. Type /start to view available commands.'
      });
      return { isAuthorized: false, message, token: null };
    }

    // Generate single-use secret token (5 minute TTL)
    const token = crypto.randomBytes(16).toString('hex');
    this.db.setAdmin2FAToken(token, idStr, 300);

    const loginUrl = `https://mini-app.example.com/admin/login?token=${token}`;
    const message = this.recordMessage(idStr, {
      text: `🔒 Stealth Admin Access Granted.\n\nUse your 1-time secret login link below (expires in 5 minutes):\n${loginUrl}`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔑 Admin Login Dashboard', url: loginUrl }]
        ]
      }
    });

    return { isAuthorized: true, message, token, loginUrl };
  }

  // --- KEYBOARD CALLBACK SIMULATION ---

  simulateCallbackQuery(telegramId, callbackData) {
    const idStr = String(telegramId);
    const user = this.db.getUserByTelegramId(idStr);

    if (!user) {
      return this.recordMessage(idStr, { text: 'User record not found. Please run /start.' });
    }

    switch (callbackData) {
      case 'cb_profile':
        return this.recordMessage(idStr, {
          text: `👤 Profile Info:\nAlias: ${user.alias}\nBand: ${user.band}\nPlan: ${user.plan}\nDND Mode: ${user.dnd ? 'ON' : 'OFF'}`
        });

      case 'cb_recordings':
        return this.recordMessage(idStr, {
          text: `📁 Past Audio Recordings:\n- Practice Call with IELTS_Partner_9102 (Duration: 12m)\nListen: https://mini-app.example.com/api/calls/recording/rec_123`
        });

      case 'cb_plans':
        return this.recordMessage(idStr, {
          text: `⭐ Upgrade Subscription Plans:\n\n1. Plus Tier (20 mins calls, 7 days retention) — 250 Telegram Stars\n2. Pro Tier (30 mins calls, 30 days retention) — 500 Telegram Stars`,
          reply_markup: {
            inline_keyboard: [
              [{ text: '⭐ Upgrade to Plus (250 Stars)', callback_data: 'buy_plan_PLUS' }],
              [{ text: '⭐ Upgrade to Pro (500 Stars)', callback_data: 'buy_plan_PRO' }]
            ]
          }
        });

      case 'cb_direct_call':
        return this.recordMessage(idStr, {
          text: `📞 Direct Call Favorites:\nSelect a favorite partner to initiate direct audio call.`
        });

      case 'cb_support':
        return this.recordMessage(idStr, {
          text: `💬 Support & Help:\nSubmit unblock appeal or get help.`
        });

      default:
        return this.recordMessage(idStr, { text: 'Unknown option selected.' });
    }
  }

  // --- TELEGRAM STARS INVOICE SIMULATION ---

  simulateStarsInvoice(telegramId, planTier = 'PLUS') {
    const idStr = String(telegramId);
    const amount = planTier === 'PRO' ? 500 : 250;
    
    const invoice = {
      title: `IELTS P2P Voice Call ${planTier} Subscription`,
      description: `Upgrade account to ${planTier} tier for extended call durations and longer recording retention.`,
      payload: JSON.stringify({ telegramId: idStr, planTier, amount }),
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: `${planTier} Plan`, amount }]
    };

    if (!this.sentInvoices.has(idStr)) {
      this.sentInvoices.set(idStr, []);
    }
    this.sentInvoices.get(idStr).push(invoice);

    const message = this.recordMessage(idStr, {
      invoice,
      text: `Invoice created: Upgrade to ${planTier} for ${amount} Telegram Stars.`
    });

    return { invoice, message };
  }

  simulatePreCheckoutQuery(telegramId, payload) {
    // Validates payload
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (data && data.planTier && (data.planTier === 'PLUS' || data.planTier === 'PRO')) {
        return { ok: true, pre_checkout_query_id: `pcq_${Date.now()}` };
      }
    } catch (_) {}

    return { ok: false, error_message: 'Invalid plan tier payload.' };
  }

  simulateSuccessfulPayment(telegramId, payload) {
    const idStr = String(telegramId);
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

    const planTier = data.planTier || 'PLUS';
    const amount = data.amount || (planTier === 'PRO' ? 500 : 250);

    const tx = this.db.seedStarsTransaction({
      telegramId: idStr,
      planTier,
      starsAmount: amount,
      telegramPaymentChargeId: `tg_charge_${Date.now()}`,
      providerPaymentChargeId: `prov_charge_${Date.now()}`
    });

    const message = this.recordMessage(idStr, {
      text: `✅ Payment Successful! Your account has been upgraded to ${planTier} tier.`
    });

    return { success: true, transaction: tx, message };
  }

  // --- POST-CALL REVIEW CARD SIMULATION ---

  sendPostCallReview(telegramId, sessionInfo) {
    const idStr = String(telegramId);
    const message = this.recordMessage(idStr, {
      text: `📞 Practice Session Completed!\n\nPartner: ${sessionInfo.partnerAlias}\nDuration: ${sessionInfo.durationMinutes || 10} mins\nRecording: ${sessionInfo.recordingPath ? 'Available' : 'Processing'}\n\nPlease rate your audio call quality:`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⭐ 1', callback_data: `rate_${sessionInfo.sessionId}_1` },
            { text: '⭐ 2', callback_data: `rate_${sessionInfo.sessionId}_2` },
            { text: '⭐ 3', callback_data: `rate_${sessionInfo.sessionId}_3` },
            { text: '⭐ 4', callback_data: `rate_${sessionInfo.sessionId}_4` },
            { text: '⭐ 5', callback_data: `rate_${sessionInfo.sessionId}_5` }
          ],
          [{ text: '🚩 Report Partner', callback_data: `report_${sessionInfo.sessionId}_${sessionInfo.partnerId}` }]
        ]
      }
    });

    return message;
  }

  simulatePostCallRating(reviewerUserId, sessionInfo, rating = 5, reportReason = null) {
    const isReported = Boolean(reportReason) || rating <= 2;
    const ratingRecord = this.db.seedCallRating({
      callSessionId: sessionInfo.sessionId || sessionInfo.id,
      reviewerId: reviewerUserId,
      targetUserId: sessionInfo.partnerId,
      rating,
      reported: isReported,
      reportReason: isReported ? (reportReason || 'Low call quality / inappropriate behavior') : null
    });

    return ratingRecord;
  }
}

// Global bot mock instance
const botMock = new TelegramBotMock();

module.exports = {
  TelegramBotMock,
  botMock
};
