# Dispatch for Test Writer Tier 1

**Working Directory**: D:\telegram-p2p-voice-call\.agents\test_writer_tier1
**Task**: Build Tier 1 Feature Coverage Test Suite (at least 5 test cases per feature for Features 1 through 17).

## Inputs & Requirements
Read:
- `D:\telegram-p2p-voice-call\.agents\ORIGINAL_REQUEST.md`
- `D:\telegram-p2p-voice-call\PROJECT.md`
- `D:\telegram-p2p-voice-call\.agents\spec_miner_e2e_1\analysis.md`
- Test harness helpers in `test/harness/` (`webappAuth.js`, `socketClient.js`, `dbHelper.js`, `botMock.js`)

## Target Output Files (`test/tier1_protocol/`)
1. `test/tier1_protocol/botFeatures.test.js`:
   - Feature 1: Onboarding & Sub-scores (5+ tests)
   - Feature 2: Interactive Menu (5+ tests)
   - Feature 3: Post-Call Rating & Reports (5+ tests)
   - Feature 8: Telegram Stars Payments (5+ tests)
2. `test/tier1_protocol/matchmakingCalls.test.js`:
   - Feature 4: $O(1)$ Complementary Matchmaking Queue (5+ tests)
   - Feature 5: LiveKit SFU & Audio Egress Token Issue (5+ tests)
   - Feature 9: Mini App Radar Screen Queue Events (5+ tests)
   - Feature 10: Active Voice Call Controls (5+ tests)
   - Feature 11: Dynamic Audio Visualizer Stream Events (5+ tests)
   - Feature 17: Mixed-Plan Call Duration Resolution (5+ tests)
3. `test/tier1_protocol/securityModeration.test.js`:
   - Feature 6: Moderation Penalty Ladder (5+ tests)
   - Feature 7: Storage Cleanup Cron (5+ tests)
   - Feature 12: Mini App WebApp Lockdown 403 (5+ tests)
   - Feature 13: Stealth `/admin` 2FA Link & Token Exchange (5+ tests)
4. `test/tier1_protocol/adminFeatures.test.js`:
   - Feature 14: Admin Analytics Dashboard (5+ tests)
   - Feature 15: Dynamic Plan & Price Editor (5+ tests)
   - Feature 16: Unblock Appeals Queue (5+ tests)

Total minimum tests in Tier 1: **85 tests** (17 features x 5 tests).

## Requirements
- Each test must use assertions that verify happy-path functionality of the feature cleanly.
- Tests must export/be compatible with Node test runner or `node test/run_all.js`.
- Run `node test/run_all.js` to verify Tier 1 test execution.
- Report handoff in `D:\telegram-p2p-voice-call\.agents\test_writer_tier1\handoff.md`.
