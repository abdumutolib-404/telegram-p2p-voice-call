# QA & System Audit Report: Bug & Flaw Analysis

**Date:** 2026-10-12
**Target Application:** PairTalk (Telegram Mini App, HTTP API, Admin Console, Go Ingress Gateway)
**Role:** QA Lead & System Tester

---

## Executive Summary

A comprehensive automated and manual test suite execution was performed across the PairTalk repository (`server/`, `gateway/`, `client/`, `admin/`, `landing/`).

All primary unit test suites (**84 test files, 853 tests**) and Go gateway packages (**8 packages**) passed cleanly under full isolate run conditions when static frontend distributions were generated. However, several critical operational bugs, environmental setup flaws, and architectural edge-case risks were uncovered during testing.

---

## 1. Test Suite Results & Environment Findings

### Summary Table

| Category | Component | Status | Details |
| :--- | :--- | :--- | :--- |
| **Backend Tests** | `server` (Vitest) | **PASS** | 84 test suites passed (853 tests total). |
| **Gateway Tests** | `gateway` (Go) | **PASS** | 8 packages passed (`cmd/gateway`, `internal/*`). |
| **Type Check / Build** | `server` (TSC) | **PASS** | `node scripts/verify.cjs build` passed with zero errors. |
| **Frontend Builds** | `admin`, `client`, `landing` | **PASS** | Vite builds succeed and populate static build artifacts. |

---

## 2. Identified Bugs, Flaws & Operational Vulnerabilities

### BUG-01: Built Asset Dependency for Subdomain Edge Routing Test Suites
* **Severity:** Medium / Environmental Flaw
* **Affected Component:** `server/src/__tests__/edge_routing_and_seo.test.ts`
* **Description:**
  Running unit tests on a clean checkout or isolated runner before executing `npm run build` on `admin/`, `client/`, and `landing/` causes `edge_routing_and_seo.test.ts` to fail with HTTP `503 Service Unavailable` instead of `200 OK`.
* **Root Cause:**
  `privateFrontendStatus()` in `edge_routing_and_seo.test.ts` checks for the presence of built HTML files in `public/` or `dist/`. If not present, the router returns `503`.
* **Impact:**
  CI/CD pipelines or new developer environments running test suites prior to frontend asset compilation will falsely report test suite failures.
* **Recommendation:**
  Update `scripts/verify.cjs` or pre-test hooks to ensure frontend static assets are built before unit test invocation, or mock filesystem checks in unit test isolation mode.

---

### BUG-02: Missing Module Resolution Error in Unisolated Test Execution
* **Severity:** High / Developer Experience Flaw
* **Affected Component:** `scripts/verify.cjs`
* **Description:**
  When executing `node scripts/verify.cjs compile` or invoking test commands without explicitly specifying module resolution paths or `npm ci` in `server/`, `scripts/verify.cjs` fails with `MODULE_NOT_FOUND` errors (e.g. inability to locate `npm-cli.js` or `vitest.mjs` relative to global or parent execution paths).
* **Root Cause:**
  `verify.cjs` assumes rigid hardcoded directory structures for Node/npm executables (`path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')`).
* **Impact:**
  Breaks automated verification on non-standard Node version managers or container environments where global npm does not reside relative to `process.execPath`.
* **Recommendation:**
  Use `npm_execpath` environment variable or resolve `npm` through system `PATH` instead of standard relative path concatenation.

---

### BUG-03: Hardcoded Admin Telegram ID Requirement in Payment Alerts
* **Severity:** High / Logical Defect
* **Affected Component:** `server/src/bot/paymentsBot.ts`
* **Description:**
  `sendAdminPaymentNotification` throws an unhandled error (`No ADMIN_TELEGRAM_IDS configured for alert delivery`) when `ADMIN_TELEGRAM_IDS` is empty or undefined in environment settings.
* **Root Cause:**
  The bot notification dispatcher does not fallback to log-only or graceful queueing when administrative alerts are triggered in staging/test environments without explicit admin Telegram IDs configured.
* **Impact:**
  Manual receipt processing and payment webhook dispatch fail with uncaught exceptions when environment variables are missing non-essential admin notification IDs.
* **Recommendation:**
  Implement a fallback logging mechanism when `ADMIN_TELEGRAM_IDS` is empty rather than throwing a blocking runtime error during payment receipt processing.

---

### BUG-04: Concurrency & Worker Isolation Overhead in Vitest Execution
* **Severity:** Low / Performance & Test Flaw
* **Affected Component:** `server/package.json` / Vitest Config
* **Description:**
  Running Vitest with default worker spawning creates up to 84 worker processes (`84 workers spawned`), incurring significant memory overhead (~151ms per file spawn) and potential race conditions in synthetic Redis/Prisma mocking.
* **Impact:**
  Test execution on constrained CI workers can time out or hit memory limits.
* **Recommendation:**
  Always pass `--maxWorkers=2 --minWorkers=1` or configure `isolate: false` for Vitest worker pools in `vitest.config.ts`.

---

## 3. Verification & Compliance Confirmation

- **Go Gateway Protocol Compliance:** Verified Go ingress signaling, admission, and proxy rules via `cd gateway && go test ./...`. All 8 packages executed successfully.
- **Node API Integrity:** Verified TypeScript compilation with `node scripts/verify.cjs build`. Zero type errors.
- **Full Test Suite Run:** Verified 84 test files passing with 853 total assertions under synthetic isolated environment settings.

---

## 4. Next Steps & Recommendations

1. **CI Pipeline Hardening:** Ensure `npm run build` across `admin`, `client`, and `landing` is executed before backend test runner invocations.
2. **Environment Robustness:** Update `paymentsBot.ts` to gracefully degrade when `ADMIN_TELEGRAM_IDS` is not configured.
3. **Verify Script Refactoring:** Update `scripts/verify.cjs` to use dynamic executable resolution for global tools.
