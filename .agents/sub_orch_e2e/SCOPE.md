# Scope: Milestone M4 — E2E Testing Track

## Objectives
Design, implement, execute, and verify a comprehensive opaque-box E2E test suite covering all project requirements, then publish `TEST_READY.md`.

## Specific Requirements & Test Methodology
1. **Requirement-Driven Test Suite**:
   - **Tier 1 - Feature Coverage (>=5 per feature)**: Bot onboarding, command handling, Radar queueing, Active Call controls, LiveKit token issuance, Telegram Stars payment flow, WebApp lockdown 403, Stealth `/admin` 2FA link generation, Admin stats/editor/appeals.
   - **Tier 2 - Boundary & Edge Cases (>=5 per feature)**: Empty/invalid inputs, invalid initData HMAC, missing master password, rate limiting 429 retries, audio retention expiration boundary (1d/7d/30d), expired 1-time 2FA tokens.
   - **Tier 3 - Cross-Feature Combinations**: Complementary matchmaking under load, mixed-plan call duration selection ($\max(limit_A, limit_B)$), moderation escalation ladder (warning -> 6h block -> permanent lock).
   - **Tier 4 - Real-World Workload Scenarios**: Complete user lifecycle (Onboarding -> Radar Match -> Live Call + Waveform + Record Toggle -> Finish Call -> Post-call Review -> Admin Appeals).
2. **Infrastructure**:
   - Create test runner script or test file harness in project root / `test/` folder.
   - Ensure tests can be executed automatically and report pass/fail with exit code 0.
3. **Artifact**:
   - Create `TEST_READY.md` at project root (`D:\telegram-p2p-voice-call\TEST_READY.md`) containing test command, total test case counts per tier, feature checklist, and status when complete.

## Verification Criteria
- All Tier 1-4 tests pass cleanly with exit code 0.
- `TEST_READY.md` generated at project root.
