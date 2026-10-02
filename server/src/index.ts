import { loadPlanConfiguration, startPlanConfigurationRefresh } from './services/planConfiguration';
import cookieParser from 'cookie-parser';
import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { run, RunnerHandle } from '@grammyjs/runner';
import { env } from './config/env';
import { prisma, connectDB, disconnectDB } from './config/database';
import { connectRedis, disconnectRedis, probeRedis, pubClient, subClient } from './config/redis';
import { primeAllCrawlerCaches } from './services/crawler/verifyCrawler';
import authRoutes from './routes/auth';
import callRoutes from './routes/calls';
import ieltsRoutes from './routes/ielts';
import adminRoutes, { setAdminBot } from './routes/admin';
import adminTelemetryRouter from './routes/adminTelemetry';
import { adminAuthMiddleware } from './middleware/adminAuth';
import { livekitWebhookRouter } from './routes/livekitWebhook';
import { setupSocketSignaling, startZombieSessionCleaner } from './socket/signaling';
import { createBot } from './bot/bot';
import { startStoragePurgeCron } from './services/storage';
import { startSubscriptionExpiryCron } from './services/subscriptionExpiry';
import { botLeaderLock } from './services/leaderLock';
import { questionIngestionService } from './services/crawler/ingestionService';
import { startCrawlerLifecycleCron } from './services/crawler/crawlerScheduler';
import { topicNotificationService } from './services/topicNotificationService';
import { initializeOrderSequence } from './services/plan';
import { surgeAlertService } from './services/surgeAlertService';
import { startEventSubscriber, EventSubscriberHandle } from './services/eventSubscriber';
import { scannerShieldMiddleware } from './middleware/scannerShield';
import { requestIdMiddleware } from './middleware/requestId';
import { logger } from './utils/logger';
import { getRequestId } from './utils/requestContext';
import type { MyContext } from './bot/types';
import { startStarsRefundRecovery } from './services/starsRefund';
import { notificationQueue } from './bot/notifications';
import { closeExternalConnections } from './utils/safeFetch';

// Global BigInt JSON serialization guard
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const app = express();
app.set('trust proxy', process.env.TRUSTED_PROXY_CIDRS?.split(',').map(value => value.trim()).filter(Boolean) || 'loopback');
const server = http.createServer(app);

const extractOrigin = (urlStr: string | undefined): string | null => {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    return parsed.origin;
  } catch {
    return urlStr.replace(/\/+$/, '');
  }
};

const rawAllowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((s) => extractOrigin(s.trim()))
  : [];

const configuredOrigins = [
  ...rawAllowedOrigins,
  extractOrigin(env.MINI_APP_URL),
  extractOrigin(env.ADMIN_PANEL_URL),
  'https://pairtalk.online',
  'https://app.pairtalk.online',
  'https://admin.pairtalk.online',
  'https://web.telegram.org',
  'https://webk.telegram.org',
  'https://webz.telegram.org',
].filter((o): o is string => Boolean(o));

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true; // Same-origin, mobile apps, or server-to-server calls
  if (configuredOrigins.includes(origin)) return true;
  if (env.NODE_ENV !== 'production') {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return true;
    }
  }
  return false;
};

app.disable('x-powered-by');

// 1. 🆔 Request Correlation & AsyncContext (Must be FIRST in chain)
app.use(requestIdMiddleware);

// 2. 🛡️ Automated Bot Banishment & Exploit Scanner Shield (Pre-Routing Filter)
app.use(scannerShieldMiddleware);

// 3. Standard HTTP Security Headers Middleware (Telegram WebApp compatible)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(self "https://web.telegram.org" "https://webk.telegram.org" "https://webz.telegram.org"), geolocation=(), payment=()'
  );
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// 4. CORS configuration with Request-ID support
app.use(cors({
  origin: (origin, callback) => {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-telegram-init-data',
    'Cookie',
    'X-Request-ID',
    'x-request-id',
    'x-correlation-id',
    'X-Requested-With',
    'x-requested-with',
    'X-Admin-CSRF',
    'x-admin-csrf',
  ],
  exposedHeaders: ['X-Request-ID'],
}));

app.options('*', cors());
app.use(cookieParser());
app.use('/api/livekit/webhook', express.raw({ type: '*/*', limit: '2mb' }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// --- Static Path Resolvers & Pre-Rendered SEO HTML ---
let memoLandingDistPath: string | null | undefined;
let memoClientDistPath: string | null | undefined;
let memoAdminDistPath: string | null | undefined;

const getLandingDistPath = (): string | null => {
  if (process.env.NODE_ENV === 'test') return null;
  if (memoLandingDistPath !== undefined) return memoLandingDistPath;
  const candidates = [
    path.resolve(__dirname, '../public/landing'),
    path.resolve(__dirname, '../../landing/dist'),
    path.resolve(process.cwd(), 'public/landing'),
    path.resolve(process.cwd(), '../landing/dist'),
    path.resolve(process.cwd(), 'landing/dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.existsSync(path.join(c, 'index.html'))) {
      memoLandingDistPath = c;
      return c;
    }
  }
  memoLandingDistPath = null;
  return null;
};

const getClientDistPath = (): string | null => {
  if (memoClientDistPath !== undefined) return memoClientDistPath;
  const candidates = [
    path.resolve(__dirname, '../public/client'),
    path.resolve(__dirname, '../../client/dist'),
    path.resolve(process.cwd(), 'public/client'),
    path.resolve(process.cwd(), '../client/dist'),
    path.resolve(process.cwd(), 'client/dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.existsSync(path.join(c, 'index.html'))) {
      memoClientDistPath = c;
      return c;
    }
  }
  memoClientDistPath = null;
  return null;
};

const getAdminDistPath = (): string | null => {
  if (memoAdminDistPath !== undefined) return memoAdminDistPath;
  const candidates = [
    path.resolve(__dirname, '../public/admin'),
    path.resolve(__dirname, '../../admin/dist'),
    path.resolve(process.cwd(), 'public/admin'),
    path.resolve(process.cwd(), '../admin/dist'),
    path.resolve(process.cwd(), 'admin/dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.existsSync(path.join(c, 'index.html'))) {
      memoAdminDistPath = c;
      return c;
    }
  }
  memoAdminDistPath = null;
  return null;
};

const STATIC_SEO_FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>PairTalk — IELTS Speaking Practice | Criteria-Matched P2P Calls</title>

    <!-- SEO & Search Intent Metadata -->
    <meta name="description" content="Stop waiting for your study buddy to reply. Get matched with a live IELTS partner in < 3 seconds. Practice Part 1, 2, and 3 with criteria-matched candidates. 100% anonymous & free to start on Telegram." />
    <meta name="keywords" content="ielts speaking 2026, ielts speaking band descriptors, ielts speaking part 1, ielts speaking part 2, ielts speaking part 3, ielts pronunciation practice, ielts price, ielts 6.5 speaking, ielts band 7 speaking, ielts band 8 speaking, ielts study buddy, ielts speaking partner, peer to peer ielts, telegram ielts bot, livekit webrtc speaking practice" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="author" content="PairTalk IELTS Speaking Network" />
    <meta name="theme-color" content="#07070a" />
    <link rel="canonical" href="https://pairtalk.online/" />

    <!-- Favicons & Icons -->
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/favicon.png" />

    <!-- High-CTR OpenGraph Meta Tags -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="PairTalk — IELTS Speaking Practice" />
    <meta property="og:url" content="https://pairtalk.online/" />
    <meta property="og:title" content="Partner ghosted you again? No more excuses." />
    <meta property="og:description" content="Stop waiting for your study buddy to reply. Get matched with a live IELTS partner in < 3 seconds. Practice Part 1, 2, and 3 with criteria-matched candidates. 100% anonymous & free to start on Telegram." />
    <meta property="og:image" content="https://pairtalk.online/plans_pricing.jpg" />
    <meta property="og:image:secure_url" content="https://pairtalk.online/plans_pricing.jpg" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="PairTalk — Instant Peer-to-Peer IELTS Speaking Practice on Telegram" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter Preview Card (Large Summary Image) -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@PairTalk" />
    <meta name="twitter:creator" content="@PairTalk" />
    <meta name="twitter:url" content="https://pairtalk.online/" />
    <meta name="twitter:title" content="Partner ghosted you again? No more excuses." />
    <meta name="twitter:description" content="Stop waiting for your study buddy to reply. Get matched with a live IELTS partner in < 3 seconds. Practice Part 1, 2, and 3 with criteria-matched candidates. 100% anonymous & free to start on Telegram." />
    <meta name="twitter:image" content="https://pairtalk.online/plans_pricing.jpg" />
    <meta name="twitter:image:alt" content="PairTalk Live P2P IELTS Speaking Simulation" />

    <!-- Telegram WebApp SDK -->
    <script src="https://telegram.org/js/telegram-web-app.js"></script>

    <!-- Machine-Readable Schema.org JSON-LD (SoftwareApplication, EducationalOrganization, FAQPage) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": "https://pairtalk.online/#website",
          "url": "https://pairtalk.online/",
          "name": "PairTalk — IELTS Speaking Practice",
          "description": "Instant Criteria-Matched Peer-to-Peer IELTS Speaking Practice Platform on Telegram & Web.",
          "publisher": {
            "@id": "https://pairtalk.online/#organization"
          },
          "inLanguage": "en"
        },
        {
          "@type": "Organization",
          "@id": "https://pairtalk.online/#organization",
          "name": "PairTalk",
          "legalName": "PairTalk IELTS Speaking Network",
          "url": "https://pairtalk.online/",
          "logo": "https://pairtalk.online/favicon.png",
          "sameAs": [
            "https://t.me/PairTalkBot",
            "https://t.me/PairTalkSupport",
            "https://twitter.com/PairTalk"
          ],
          "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "Customer Support",
            "url": "https://t.me/PairTalkSupport",
            "availableLanguage": ["English", "Uzbek", "Russian"]
          }
        },
        {
          "@type": "Product",
          "@id": "https://pairtalk.online/#product",
          "name": "PairTalk IELTS Speaking Practice",
          "description": "Autonomous peer-to-peer IELTS Speaking practice platform inside Telegram and Web. Connects candidates with live speaking partners worldwide in <3 seconds based on target band scores (5-9) and official IELTS criteria (FC, LR, GRA, P).",
          "image": [
            "https://pairtalk.online/plans_pricing.jpg",
            "https://pairtalk.online/favicon.png"
          ],
          "brand": {
            "@type": "Brand",
            "name": "PairTalk"
          },
          "isAccessibleForFree": true,
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "reviewCount": "184",
            "bestRating": "5",
            "worstRating": "1"
          },
          "review": [
            {
              "@type": "Review",
              "reviewRating": {
                "@type": "Rating",
                "ratingValue": "5",
                "bestRating": "5"
              },
              "author": {
                "@type": "Person",
                "name": "Farrukh K."
              },
              "datePublished": "2026-02-20",
              "reviewBody": "PairTalk's criteria-matched voice practice connected me with serious speaking partners in seconds. Improved my fluency from Band 6.0 to 7.5."
            },
            {
              "@type": "Review",
              "reviewRating": {
                "@type": "Rating",
                "ratingValue": "5",
                "bestRating": "5"
              },
              "author": {
                "@type": "Person",
                "name": "Dilnoza M."
              },
              "datePublished": "2026-02-28",
              "reviewBody": "The in-call IELTS question simulator with authentic cue cards and 1-minute prep timer completely removed my exam nervousness."
            }
          ],
          "offers": [
            {
              "@type": "Offer",
              "name": "FREE Tier",
              "price": "0",
              "priceCurrency": "USD",
              "priceValidUntil": "2026-12-31",
              "availability": "https://schema.org/InStock",
              "url": "https://pairtalk.online/#pricing",
              "image": "https://pairtalk.online/plans_pricing.jpg",
              "description": "Complimentary monthly practice calls, 15 min duration, 1 cloud audio recording with 24-hour retention.",
              "shippingDetails": {
                "@type": "OfferShippingDetails",
                "shippingRate": {
                  "@type": "MonetaryAmount",
                  "value": "0.00",
                  "currency": "USD"
                },
                "shippingDestination": {
                  "@type": "DefinedRegion",
                  "addressCountry": "US"
                },
                "deliveryTime": {
                  "@type": "ShippingDeliveryTime",
                  "handlingTime": {
                    "@type": "QuantitativeValue",
                    "minValue": 0,
                    "maxValue": 0,
                    "unitCode": "DAY"
                  },
                  "transitTime": {
                    "@type": "QuantitativeValue",
                    "minValue": 0,
                    "maxValue": 0,
                    "unitCode": "DAY"
                  }
                }
              },
              "hasMerchantReturnPolicy": {
                "@type": "MerchantReturnPolicy",
                "applicableCountry": "US",
                "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
                "merchantReturnDays": 14,
                "returnMethod": "https://schema.org/ReturnOnline",
                "returnFees": "https://schema.org/FreeReturn",
                "merchantReturnLink": "https://pairtalk.online/privacy"
              }
            },
            {
              "@type": "Offer",
              "name": "PLUS Plan",
              "price": "1.58",
              "priceCurrency": "USD",
              "priceValidUntil": "2026-12-31",
              "availability": "https://schema.org/InStock",
              "url": "https://pairtalk.online/#pricing",
              "image": "https://pairtalk.online/plans_pricing.jpg",
              "description": "10 practice calls / month, 30 min duration, 3 cloud recordings with 7-day retention (79 Telegram Stars / 15,000 UZS).",
              "shippingDetails": {
                "@type": "OfferShippingDetails",
                "shippingRate": {
                  "@type": "MonetaryAmount",
                  "value": "0.00",
                  "currency": "USD"
                },
                "shippingDestination": {
                  "@type": "DefinedRegion",
                  "addressCountry": "US"
                },
                "deliveryTime": {
                  "@type": "ShippingDeliveryTime",
                  "handlingTime": {
                    "@type": "QuantitativeValue",
                    "minValue": 0,
                    "maxValue": 0,
                    "unitCode": "DAY"
                  },
                  "transitTime": {
                    "@type": "QuantitativeValue",
                    "minValue": 0,
                    "maxValue": 0,
                    "unitCode": "DAY"
                  }
                }
              },
              "hasMerchantReturnPolicy": {
                "@type": "MerchantReturnPolicy",
                "applicableCountry": "US",
                "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
                "merchantReturnDays": 14,
                "returnMethod": "https://schema.org/ReturnOnline",
                "returnFees": "https://schema.org/FreeReturn",
                "merchantReturnLink": "https://pairtalk.online/privacy"
              }
            },
            {
              "@type": "Offer",
              "name": "PRO Plan",
              "price": "5.10",
              "priceCurrency": "USD",
              "priceValidUntil": "2026-12-31",
              "availability": "https://schema.org/InStock",
              "url": "https://pairtalk.online/#pricing",
              "image": "https://pairtalk.online/plans_pricing.jpg",
              "description": "25 practice calls / month, 60 min duration, 7 cloud recordings with 30-day retention, high priority queue (255 Telegram Stars / 55,000 UZS).",
              "shippingDetails": {
                "@type": "OfferShippingDetails",
                "shippingRate": {
                  "@type": "MonetaryAmount",
                  "value": "0.00",
                  "currency": "USD"
                },
                "shippingDestination": {
                  "@type": "DefinedRegion",
                  "addressCountry": "US"
                },
                "deliveryTime": {
                  "@type": "ShippingDeliveryTime",
                  "handlingTime": {
                    "@type": "QuantitativeValue",
                    "minValue": 0,
                    "maxValue": 0,
                    "unitCode": "DAY"
                  },
                  "transitTime": {
                    "@type": "QuantitativeValue",
                    "minValue": 0,
                    "maxValue": 0,
                    "unitCode": "DAY"
                  }
                }
              },
              "hasMerchantReturnPolicy": {
                "@type": "MerchantReturnPolicy",
                "applicableCountry": "US",
                "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
                "merchantReturnDays": 14,
                "returnMethod": "https://schema.org/ReturnOnline",
                "returnFees": "https://schema.org/FreeReturn",
                "merchantReturnLink": "https://pairtalk.online/privacy"
              }
            },
            {
              "@type": "Offer",
              "name": "BOSS Plan",
              "price": "13.58",
              "priceCurrency": "USD",
              "priceValidUntil": "2026-12-31",
              "availability": "https://schema.org/InStock",
              "url": "https://pairtalk.online/#pricing",
              "image": "https://pairtalk.online/plans_pricing.jpg",
              "description": "50 practice calls / month, 90 min duration, 15 cloud recordings with 90-day retention, VIP priority queue (679 Telegram Stars / 149,000 UZS).",
              "shippingDetails": {
                "@type": "OfferShippingDetails",
                "shippingRate": {
                  "@type": "MonetaryAmount",
                  "value": "0.00",
                  "currency": "USD"
                },
                "shippingDestination": {
                  "@type": "DefinedRegion",
                  "addressCountry": "US"
                },
                "deliveryTime": {
                  "@type": "ShippingDeliveryTime",
                  "handlingTime": {
                    "@type": "QuantitativeValue",
                    "minValue": 0,
                    "maxValue": 0,
                    "unitCode": "DAY"
                  },
                  "transitTime": {
                    "@type": "QuantitativeValue",
                    "minValue": 0,
                    "maxValue": 0,
                    "unitCode": "DAY"
                  }
                }
              },
              "hasMerchantReturnPolicy": {
                "@type": "MerchantReturnPolicy",
                "applicableCountry": "US",
                "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
                "merchantReturnDays": 14,
                "returnMethod": "https://schema.org/ReturnOnline",
                "returnFees": "https://schema.org/FreeReturn",
                "merchantReturnLink": "https://pairtalk.online/privacy"
              }
            }
          ]
        },
        {
          "@type": "FAQPage",
          "@id": "https://pairtalk.online/#faq",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What is PairTalk and how does live IELTS Speaking matchmaking work?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "PairTalk is an autonomous peer-to-peer IELTS Speaking practice platform that operates natively inside Telegram and modern web browsers. Candidates configure their target whole-band scores (Band 5 to 9) across the four official IELTS criteria (Fluency, Vocabulary, Grammar, Pronunciation). When you tap 'Start Practicing', PairTalk's matchmaking radar pairs you with an active, criteria-matched study buddy worldwide in under 3 seconds inside an encrypted WebRTC voice room."
              }
            },
            {
              "@type": "Question",
              "name": "Who is PairTalk designed for?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "PairTalk is designed for serious IELTS Academic and General Training candidates aiming for Band 6.0, 6.5, 7.0, 7.5, 8.0, or higher who need consistent, daily speaking practice. It is ideal for self-studying learners who want to eliminate speaking anxiety, test their impromptu speaking skills, and practice without paying $20–$50/hour for private tutors."
              }
            },
            {
              "@type": "Question",
              "name": "Why is PairTalk better than searching for IELTS study buddies in Discord servers or Telegram group chats?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "In public group chats and Discord channels, candidates regularly face unresponsive study partners, ghosting, misaligned English proficiency levels, background noise, and privacy risks. PairTalk eliminates waiting and ghosting by connecting active candidates on demand in <3 seconds with strict criteria matching, studio-grade WebRTC SFU audio, and 100% anonymous aliases."
              }
            },
            {
              "@type": "Question",
              "name": "How does PairTalk use the official IELTS Speaking Band Descriptors (FC, LR, GRA, P)?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "PairTalk aligns directly with the official British Council / IDP IELTS Speaking Band Descriptors: Fluency & Coherence (FC), Lexical Resource (LR), Grammatical Range & Accuracy (GRA), and Pronunciation (P). Learners set their individual target sub-scores, allowing the algorithm to match candidates with complementary strengths for maximum mutual learning synergy."
              }
            },
            {
              "@type": "Question",
              "name": "Can I practice IELTS Speaking Part 1, Part 2 (Cue Card), and Part 3 (Discussion) on PairTalk?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. PairTalk voice sessions are structured to simulate the complete 2026 IELTS Speaking exam format. Partners can alternate roles as examiner and candidate across Part 1 introductory questions, Part 2 1-minute preparation and 2-minute cue card monologues, and Part 3 abstract two-way discussions."
              }
            },
            {
              "@type": "Question",
              "name": "How much does IELTS Speaking practice cost on PairTalk compared to private tutors?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Private 1-on-1 IELTS tutors on Cambly, iTalki, or Preply typically cost $20 to $50 per hour. PairTalk is 100% free to start with complimentary monthly practice calls. Paid accelerator tiers (PLUS, PRO, BOSS) range from 79 to 679 Telegram Stars ($1.58 to $13.58 / 15,000 to 149,000 UZS) for up to 50 practice calls of up to 90 minutes each, delivering over 95% cost savings compared to traditional tutoring."
              }
            },
            {
              "@type": "Question",
              "name": "How does PairTalk help candidates achieve Band 6.5, Band 7.0, or Band 8.0 in IELTS Speaking 2026?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Achieving IELTS Band 7+ requires spontaneous fluency without unnatural hesitation, flexible idiomatic vocabulary, complex clause structures with high accuracy, and natural rhythm with correct intonation. PairTalk provides daily high-repetition conversational exposure with criteria-matched candidates, eliminating speaking anxiety and building spontaneous English reflex."
              }
            },
            {
              "@type": "Question",
              "name": "Is PairTalk completely anonymous and how is candidate privacy protected?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "PairTalk enforces strict privacy. Each candidate is assigned a randomized anonymous identifier (e.g. P2P-0284DB68). Your real name, phone number, and Telegram username are never shared with partners. Live voice calls are encrypted via WebRTC SFU, and optional cloud audio recordings are automatically and permanently purged once the tier retention window expires."
              }
            },
            {
              "@type": "Question",
              "name": "What is the official refund policy on PairTalk paid plans?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "PairTalk provides a server-enforced 100% money-back guarantee. You are eligible for a full refund if requested within 48 hours of subscription purchase AND you have consumed less than 10% of your monthly call allowance. Telegram Stars refunds are processed instantly via /refund in the bot, while bank card transfers settle within 1–3 business days."
              }
            },
            {
              "@type": "Question",
              "name": "How do referral bonus calls and the Speaking Sprint work?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "When you invite a study partner using your unique referral link, both you and your partner receive permanent bonus practice calls added to your balance. Active participants also compete on the live Community Leaderboard during Speaking Championships to win complimentary VIP, BOSS, and PRO plan upgrades."
              }
            },
            {
              "@type": "Question",
              "name": "Do I need to download or install any external application to use PairTalk?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "No external downloads or account setups are needed. PairTalk runs directly inside Telegram as a Telegram Mini App across iOS, Android, macOS, Windows, and Web. Simply launch @PairTalkBot to start practicing immediately."
              }
            },
            {
              "@type": "Question",
              "name": "What audio equipment and browser permissions are required for PairTalk?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Any smartphone, tablet, or computer with a functional microphone works. Headphones or earbuds are strongly recommended to prevent acoustic echo. Ensure you allow microphone access when prompted by Telegram or your browser."
              }
            },
            {
              "@type": "Question",
              "name": "What should I do if my speaking partner is unresponsive, abusive, or refuses to speak English?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "You have total control: tap the Report Partner button on your active call screen. Select the reason and choose to permanently block them. The call ends immediately, you will never be matched with them again, and our moderation engine receives the audit report."
              }
            }
          ]
        }
      ]
    }
    </script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

const getSeoPreRenderedHtml = (): string => {
  const landingDist = getLandingDistPath();
  if (landingDist) {
    try {
      const distIndex = path.join(landingDist, 'index.html');
      if (fs.existsSync(distIndex)) {
        const content = fs.readFileSync(distIndex, 'utf-8');
        if (content && content.length > 50) {
          return content;
        }
      }
    } catch {
      // Fallback
    }
  }

  const clientDist = getClientDistPath();
  if (clientDist) {
    try {
      const distIndex = path.join(clientDist, 'index.html');
      if (fs.existsSync(distIndex)) {
        const content = fs.readFileSync(distIndex, 'utf-8');
        if (content && content.length > 50) {
          return content;
        }
      }
    } catch {
      // Fallback to static SEO HTML
    }
  }

  const landingSrcIndex = path.resolve(__dirname, '../../landing/index.html');
  if (fs.existsSync(landingSrcIndex)) {
    try {
      const content = fs.readFileSync(landingSrcIndex, 'utf-8');
      if (content && content.includes('Partner ghosted you again?')) {
        return content;
      }
    } catch {
      // Fallback
    }
  }

  const srcIndex = path.resolve(__dirname, '../../client/index.html');
  if (fs.existsSync(srcIndex)) {
    try {
      const content = fs.readFileSync(srcIndex, 'utf-8');
      if (content && content.includes('Partner ghosted you again?')) {
        return content;
      }
    } catch {
      // Fallback
    }
  }

  return STATIC_SEO_FALLBACK_HTML;
};

// --- Subdomain Edge Routing Middleware ---
app.use((req, res, next) => {
  const rawHost = (req.headers['x-forwarded-host'] as string) || req.hostname || (req.headers.host as string) || '';
  const cleanHost = rawHost.split(':')[0].trim().toLowerCase();
  const rawUrl = req.originalUrl || req.url || '';
  const pathname = rawUrl.split('?')[0];

  // 0. Canonical WWW and Protocol 301 Redirects for Google Search Essentials
  if (cleanHost === 'www.pairtalk.online') {
    return res.redirect(301, `https://pairtalk.online${rawUrl}`);
  }
  if (req.headers['x-forwarded-proto'] === 'http' && env.NODE_ENV === 'production') {
    return res.redirect(301, `https://pairtalk.online${rawUrl}`);
  }

  // 1. Preserve Admin Portal
  if (cleanHost === 'admin.pairtalk.online' || cleanHost.startsWith('admin.')) {
    return next();
  }

  // 2. Allow API endpoints, healthcheck, websockets, and crawlers across all hosts
  if (
    pathname.startsWith('/api/') ||
    pathname === '/health' ||
    pathname.startsWith('/socket.io/') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return next();
  }

  // 3. Subdomain redirection for app.pairtalk.online and api.pairtalk.online
  const isAppSubdomain = cleanHost === 'app.pairtalk.online';
  const isApiSubdomain = cleanHost === 'api.pairtalk.online';

  if (isAppSubdomain || isApiSubdomain) {
    const hasTelegramHeader = Boolean(req.headers['x-telegram-init-data']);
    const hasTelegramQuery = Boolean(
      req.query?.tgWebAppData ||
      req.query?.tgWebAppStartParam ||
      req.query?.tgWebAppPlatform ||
      req.query?.tgWebAppVersion
    );
    const hasSession = Boolean(
      req.cookies?.session_token ||
      req.cookies?.admin_session ||
      req.headers.authorization
    );
    const userAgent = (req.headers['user-agent'] as string) || '';
    const isTelegramUA = /Telegram/i.test(userAgent);
    const referer = (req.headers.referer as string) || '';
    const isTelegramReferer = /telegram\.org/i.test(referer);

    const hasTelegramContext = hasTelegramHeader || hasTelegramQuery || hasSession || isTelegramUA || isTelegramReferer;

    if (!hasTelegramContext) {
      if (req.accepts('html') || pathname === '/' || isApiSubdomain) {
        return res.redirect(302, 'https://pairtalk.online');
      }
    }
  }

  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/ielts', ieltsRoutes);
app.use('/api/admin/telemetry', adminAuthMiddleware, adminTelemetryRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/livekit', livekitWebhookRouter);

app.get('/health', async (_req, res) => {
  try {
    await Promise.all([prisma.user.findFirst({ select: { id: true } }), probeRedis()]);
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      error: 'Required storage is unavailable',
    });
  }
});

// --- Robots.txt Crawler Filtering ---
app.get('/robots.txt', (req, res) => {
  const rawHost = (req.headers['x-forwarded-host'] as string) || req.hostname || (req.headers.host as string) || '';
  const cleanHost = rawHost.split(':')[0].trim().toLowerCase();
  const isApiSubdomain = cleanHost === 'api.pairtalk.online' || cleanHost.startsWith('api.');

  if (isApiSubdomain) {
    res.type('text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(`User-agent: *\nDisallow: /\n`);
  }

  const robotsTxt = `# Robots.txt for PairTalk Public Platform (pairtalk.online)

# Allowed AI & Major Search Engine Crawlers
User-agent: Googlebot
User-agent: Google-Extended
User-agent: Bingbot
User-agent: ClaudeBot
User-agent: anthropic-ai
User-agent: GPTBot
User-agent: ChatGPT-User
User-agent: PerplexityBot
User-agent: Applebot
User-agent: facebookexternalhit
User-agent: FacebookBot
User-agent: Twitterbot
User-agent: TelegramBot
Allow: /
Disallow: /api/
Disallow: /admin

# Block Aggressive Scrapers & Unwanted Harvesters
User-agent: Bytespider
User-agent: TikTokSpider
User-agent: CCBot
User-agent: Baiduspider
User-agent: PetalBot
User-agent: YandexBot
User-agent: MJ12bot
User-agent: AhrefsBot
User-agent: SemrushBot
User-agent: DotBot
User-agent: DataForSeoBot
User-agent: Scrapy
User-agent: Sogou
Disallow: /

# General Policy
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin

# Dynamic Sitemap Reference
Sitemap: https://pairtalk.online/sitemap.xml
`;
  res.type('text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(robotsTxt);
});

// --- Dynamic Sitemap.xml Route ---
app.get('/sitemap.xml', (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  <url>
    <loc>https://pairtalk.online/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://pairtalk.online/#guidelines</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://pairtalk.online/#privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;

  res.type('application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(sitemapXml);
});

// --- Static Asset Serving ---
const landingDist = getLandingDistPath();
if (landingDist) {
  app.use(express.static(landingDist, { index: false }));
}
const clientDist = getClientDistPath();
if (clientDist) {
  app.use(express.static(clientDist, { index: false }));
}
const adminDist = getAdminDistPath();
if (adminDist) {
  app.use('/admin', express.static(adminDist, { index: false }));
}
const serverAssetsPath = path.resolve(__dirname, '../assets');
if (fs.existsSync(serverAssetsPath)) {
  app.use('/assets', express.static(serverAssetsPath));
}

// --- Root GET / & Pre-rendered SEO Landing Page ---
app.get('/', (_req, res) => {
  const lDist = getLandingDistPath();
  if (lDist && fs.existsSync(path.join(lDist, 'index.html'))) {
    return res.sendFile(path.join(lDist, 'index.html'));
  }
  const cDist = getClientDistPath();
  if (cDist && fs.existsSync(path.join(cDist, 'index.html'))) {
    return res.sendFile(path.join(cDist, 'index.html'));
  }
  res.type('text/html; charset=utf-8').send(getSeoPreRenderedHtml());
});

// --- Catch-All SPA Fallback ---
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return next();
  }
  if (req.accepts('html')) {
    const rawHost = (req.headers['x-forwarded-host'] as string) || req.hostname || (req.headers.host as string) || '';
    const cleanHost = rawHost.split(':')[0].trim().toLowerCase();
    if (cleanHost === 'admin.pairtalk.online' || cleanHost.startsWith('admin.')) {
      const aDist = getAdminDistPath();
      if (aDist && fs.existsSync(path.join(aDist, 'index.html'))) {
        return res.sendFile(path.join(aDist, 'index.html'));
      }
    }
    const lDist = getLandingDistPath();
    if (lDist && fs.existsSync(path.join(lDist, 'index.html'))) {
      return res.sendFile(path.join(lDist, 'index.html'));
    }
    const cDist = getClientDistPath();
    if (cDist && fs.existsSync(path.join(cDist, 'index.html'))) {
      return res.sendFile(path.join(cDist, 'index.html'));
    }
    return res.type('text/html; charset=utf-8').send(getSeoPreRenderedHtml());
  }
  next();
});

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
methods: ['GET', 'POST'],
    credentials: true,
  },
});

function configureSocketAdapter() { if (pubClient && subClient) {
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('Socket.IO configured with @socket.io/redis-adapter for horizontal clustering', {
    service: 'socket',
    event: 'redis_adapter_configured',
  });
} }

let bot: Bot<MyContext> | null = null;
let eventSubscriberHandle: EventSubscriberHandle | null = null;
let stopPlanRefresh: (() => void) | null = null;
let stopRefundRecovery: (() => Promise<void>) | null = null;
let stopNotificationWorker: (() => Promise<void>) | null = null;

let stopPolling: (() => Promise<void>) | null = null;
const stopWorkers: Array<() => void> = [];
function startBotWithRetry(botInstance: Bot<MyContext>): () => Promise<void> {
  let stopped = false, epoch = 0;
  let activeRunner: RunnerHandle | null = null;
  const stopRunner = async () => {
    epoch++;
    const runner = activeRunner; activeRunner = null;
    if (runner) await runner.stop();
  };
  botLeaderLock.startElection({
    onElected: async () => {
      const pollingEpoch = ++epoch;
      if (!botInstance.isInited()) await botInstance.init();
      if (stopped || pollingEpoch !== epoch || !botLeaderLock.isCurrentLeader()) return;
      logger.info('Starting Telegram polling owner', {service:'bot',event:'bot_started'});
      const runner = run(botInstance, {sink:{concurrency:50},runner:{silent:true,maxRetryTime:30000,retryInterval:'exponential',fetch:{allowed_updates:['message','callback_query','pre_checkout_query']}}});
      activeRunner = runner;
      await runner.task();
      if (!stopped && pollingEpoch === epoch && botLeaderLock.isCurrentLeader()) throw new Error('Polling runner stopped unexpectedly');
    },
    onLost: stopRunner,
  });
  return async () => {
    stopped = true;
    botLeaderLock.stopTimers();
    await stopRunner();
    // Release only after polling has stopped, so another replica cannot overlap shutdown.
    await botLeaderLock.release();
  };
}

if (env.NODE_ENV !== 'test' && process.env.DISABLE_BOT_POLLING !== 'true' && env.BOT_TOKEN && env.BOT_TOKEN !== 'mock_bot_token') {
  try {
    bot = createBot(env.BOT_TOKEN);
    setAdminBot(bot);
  } catch (error: unknown) {
    logger.error('Telegram bot instance creation failed', {
      service: 'bot',
      event: 'bot_creation_failed',
    }, error);
  }
} else {
  logger.info('Mock bot token configured. Bot polling disabled.', {
    service: 'bot',
    event: 'bot_mock_mode',
  });
}

async function bootstrap(): Promise<void> {
  try {
    await connectDB();
    if (!await connectRedis()) throw new Error('Redis readiness failed');
    configureSocketAdapter();
    await initializeOrderSequence();
    await loadPlanConfiguration();
    stopPlanRefresh = startPlanConfigurationRefresh();
    setAdminBot(bot);

    // Start bot polling under distributed leader election only after Redis and DB are ready
    if (bot) {
      stopNotificationWorker = notificationQueue.startWorker(() => bot);
      stopPolling = startBotWithRetry(bot);
      stopRefundRecovery = startStarsRefundRecovery(bot.api);
    }

    // Warm verified crawler IP prefixes in background
    void primeAllCrawlerCaches().catch(() => undefined);

    setupSocketSignaling(io, bot ?? undefined);
    const zombieTimer = startZombieSessionCleaner(io, bot ?? undefined);
    stopWorkers.push(() => clearInterval(zombieTimer));
    eventSubscriberHandle = startEventSubscriber(() => bot);
    stopWorkers.push(startStoragePurgeCron());
    stopWorkers.push(startSubscriptionExpiryCron(() => bot));

    if (process.env.DISABLE_BACKGROUND_CRAWLER !== 'true') {
    // Initial crawler seed on boot & daily 24h periodic sync
    void questionIngestionService.runIngestion({
      onNewTopics: async (newCount, topics) => {
        if (bot) await topicNotificationService.broadcastNewTopics(newCount, topics, bot);
      },
    }).catch(() => undefined);

    // Start Two-Tier Scheduled Lifecycle (Weekly Searcher & Daily Filter)
    stopWorkers.push(startCrawlerLifecycleCron(() => bot));

    }
    // Start Peak-Hour Surge Alert Scheduler (10-minute liquidity monitor)
    surgeAlertService.startScheduler(() => bot);

    if (env.NODE_ENV !== 'test') {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(env.PORT, process.env.HOST || '0.0.0.0', resolve);
      });
      logger.info(`IELTS Speaking P2P Backend running on port ${env.PORT}`, {
        service: 'server',
        event: 'server_listening',
        port: env.PORT,
      });
    }
  } catch (error: unknown) {
    logger.error('Server bootstrap failed', {
      service: 'server',
      event: 'server_bootstrap_failed',
    }, error);
    stopPlanRefresh?.(); await stopRefundRecovery?.();
    await stopNotificationWorker?.().catch(() => undefined);
    for (const stop of stopWorkers) stop();
    surgeAlertService.stopScheduler();
    await stopPolling?.().catch(() => undefined);
    await eventSubscriberHandle?.stop().catch(() => undefined);
    io.close();
    await Promise.allSettled([disconnectDB(), disconnectRedis()]);
    process.exitCode = 1;
  }
}

if (env.NODE_ENV === 'test') setupSocketSignaling(io);
else void bootstrap().catch((error: unknown) => {
  logger.error('Server bootstrap unhandled rejection', {
    service: 'server',
    event: 'server_bootstrap_unhandled',
  }, error);
  process.exitCode = 1;
});

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const reqId = getRequestId() || req.id || req.requestId;
  if (err instanceof URIError || (err as any).status === 400 || (err as any).statusCode === 400) {
    if (!res.headersSent) res.status(400).json({ error: 'Bad request: malformed URI sequence.' });
    return;
  }
  logger.error('[Express Error] Unhandled server error', {
    service: 'server',
    event: 'unhandled_express_error',
    requestId: reqId,
    statusCode: 500,
    path: (req.originalUrl || req.url || '').split('?')[0],
    method: req.method,
  }, err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
});

let shuttingDown = false;
const gracefulShutdown = async (signal: string) => {
  if (shuttingDown) return; shuttingDown = true;
  logger.info(`Received ${signal}. Initiating graceful shutdown...`, {
    service: 'server',
    event: 'shutdown_initiated',
    signal,
  });
  try {
    stopPlanRefresh?.();
    await stopRefundRecovery?.();
    await stopNotificationWorker?.().catch(() => undefined);
    for (const stop of stopWorkers) stop();
    surgeAlertService.stopScheduler();
    await stopPolling?.();
    closeExternalConnections();
    if (eventSubscriberHandle) {
      await eventSubscriberHandle.stop().catch(() => undefined);
    }
    if (bot) await bot.stop().catch(() => undefined);
    botLeaderLock.stopTimers();
    await botLeaderLock.release();
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDB().catch(() => undefined);
    await disconnectRedis().catch(() => undefined);
    logger.info('Graceful shutdown complete.', {
      service: 'server',
      event: 'shutdown_complete',
    });
    process.exit(0);
  } catch (err) {
    logger.error('Shutdown error', {
      service: 'server',
      event: 'shutdown_error',
    }, err);
    process.exit(1);
  }
};

if (env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
}

export { app, server, io, bot };
