# Progress Log

Last visited: 2026-08-11T20:46:20Z

- [x] Initialized BRIEFING.md and progress.md
- [ ] Inspect existing `server/package.json`, `tsconfig.json`, `.env`
- [ ] Update `server/package.json` with required dependencies
- [ ] Create `server/prisma/schema.prisma`
- [ ] Run Prisma generate / DB setup
- [ ] Implement `src/config/` (env, db, redis, livekit)
- [ ] Implement `src/bot/` (Grammy bot, onboarding, stealth admin 2FA, menu keyboard, post-call card, Stars invoices/webhooks)
- [ ] Implement `src/services/` (Matchmaking O(1) Redis queue, LiveKit token & egress recording, mixed-plan duration rule, storage purge cron, moderation penalty ladder)
- [ ] Implement `src/middleware/` (initData lockdown 403, admin JWT)
- [ ] Implement `src/routes/` (auth, matchmaking, calls, admin REST endpoints)
- [ ] Implement `src/socket/` (signaling server)
- [ ] Implement `src/index.ts` (entry point)
- [ ] Write unit & integration tests
- [ ] Run build & test (`npm run build`, `npm test`)
- [ ] Write handoff report and notify parent
