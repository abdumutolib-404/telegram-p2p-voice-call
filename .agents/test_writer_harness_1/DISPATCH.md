# Dispatch for Test Writer Harness 1

**Working Directory**: D:\telegram-p2p-voice-call\.agents\test_writer_harness_1
**Task**: Build test harness helpers and unified test runner in `test/`.

## Inputs & Requirements
Read:
- `D:\telegram-p2p-voice-call\.agents\ORIGINAL_REQUEST.md`
- `D:\telegram-p2p-voice-call\PROJECT.md`
- `D:\telegram-p2p-voice-call\.agents\spec_miner_e2e_1\analysis.md`

## Instructions
1. Create `test/harness/webappAuth.js`: Functions to generate valid and invalid `X-Telegram-Init-Data` HMAC signatures given a bot token and user data.
2. Create `test/harness/socketClient.js`: Socket.io test connection helper for client emission and event listening.
3. Create `test/harness/dbHelper.js`: Database mock/memory store & reset functions for users, call sessions, ratings, appeals, and Redis queue buckets.
4. Create `test/harness/botMock.js`: Helper functions to simulate Telegram `/start`, `/admin`, keyboard callbacks, and invoice processing.
5. Create `test/run_all.js`: Unified runner that executes all test files in `test/tier1_protocol/`, `test/tier2_api_socket/`, `test/tier3_workflows/`, and `test/tier4_opaque_e2e/`, produces formatted output table per tier, calculates total tests count, and exits with status 0 on 100% pass (or 1 on failure).
6. Verify harness scripts with a quick node run and report handoff in `D:\telegram-p2p-voice-call\.agents\test_writer_harness_1\handoff.md`.
