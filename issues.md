# RepuZK Backend — Contributor Issues

> **Stack:** NestJS · TypeScript · PostgreSQL · Redis · Circom/SnarkJS · Stellar SDK  
> **Start here:** [`README.md`](./README.md) · [`structure.md`](./structure.md)

---

## Labels
| | |
|---|---|
| 🟢 Good First Issue | Small, self-contained — great starting point |
| 🟡 Intermediate | Requires understanding one module |
| 🔴 Advanced | Touches multiple modules or the blockchain layer |
| 🐛 Bug | Something is broken |
| ✨ Feature | New functionality |
| 🧹 Refactor / Chore | Cleanup, tooling, no logic change |
| 📄 Docs | Documentation only |

---

## Open Issues

### #1 · 🟢 📄 Add JSDoc to all service methods
Add JSDoc (`@param`, `@returns`, brief description) to every public method in `auth`, `issuer`, `credential`, `proof`, `reputation`, and `stellar` services. No logic changes.

**Done when:** Every public service method has a JSDoc block and the PR touches no runtime code.

---

### #2 · 🟢 🧹 Add `class-validator` decorators to all DTOs
Request bodies are not validated — missing fields cause unhandled runtime errors.

**Done when:** All DTOs use `class-validator` decorators, `ValidationPipe` is enabled globally in `main.ts`, and invalid requests return HTTP 400 with a descriptive message.

---

### #3 · 🟢 📄 Write `CONTRIBUTING.md`
No onboarding guide exists for new contributors.

**Done when:** `CONTRIBUTING.md` covers local setup, required env vars, how to run tests, and the PR workflow.

---

### #4 · 🟢 🧹 Add a global exception filter
Errors are returned in inconsistent shapes across controllers.

**Done when:** A `GlobalExceptionFilter` in `src/common/` returns `{ statusCode, message, timestamp, path }` for all errors, registered globally in `main.ts`.

---

### #5 · 🟢 ✨ Add `GET /health` endpoint
No health-check endpoint exists for deployment monitoring.

**Done when:** `GET /health` returns `{ status: "ok", timestamp }` with HTTP 200, no auth required.

---

### #6 · 🟡 ✨ Implement JWT refresh token rotation
Only short-lived access tokens are issued — users get logged out frequently.

**Done when:** `POST /auth/refresh` accepts a refresh token, returns a new access + refresh token pair, stores refresh tokens in Redis (7-day TTL), and invalidates the old token on use. Unit tests cover the happy path and replay attack.

---

### #7 · 🟡 ✨ Rate-limit auth endpoints
`/auth/challenge` and `/auth/verify` have no rate limiting, enabling brute-force attacks.

**Done when:** `@nestjs/throttler` limits `/auth/*` to 10 requests/minute per IP, returns HTTP 429 on excess, and limits are configurable via env vars.

---

### #8 · 🟡 ✨ Enforce credential expiry in the credential service
Expired credentials are returned without any expiry indication.

**Done when:** `GET /credential/user/:address` includes `is_expired` on each item, a `?active=true` filter excludes expired ones, and a daily `@Cron` job marks expired rows in the DB.

---

### #9 · 🟡 ✨ Paginate all list endpoints
`GET /issuer/all`, `GET /proof/user/:address`, etc. return unbounded lists.

**Done when:** All list endpoints accept `?page=1&limit=20`, respond with `{ data, total, page, limit }`, default limit is 20, max is 100.

---

### #10 · 🟡 🐛 Fix proof job status stuck on `"pending"` after Stellar failure
When the `stellar-submit` queue job fails, `GET /proof/status/:jobId` still returns `"pending"`.

**Done when:** On Stellar submission failure the Redis status is updated to `{ status: "failed", error }`, reflected correctly by the status endpoint, with up to 3 retries before marking failed.

---

### #11 · 🟡 ✨ Implement `POST /credential/upload-ipfs`
The endpoint is defined but returns a stub — no actual IPFS upload occurs.

**Done when:** The credential payload is fetched from DB, encrypted with the user's public key, uploaded to IPFS via Pinata using `IPFS_API_KEY`, and the returned CID is stored in `credentials.ipfs_cid`.

---

### #12 · 🟡 ✨ Make `GET /reputation/verify/:address` read from on-chain
Currently reads only from the PostgreSQL cache, not the live on-chain score.

**Done when:** Calls `StellarService.getScoreValue(address)` for the live score, returns `{ address, score, threshold, passes: boolean }`, and caches the result in Redis for 60 seconds.

---

### #13 · 🟡 🧹 Centralize Stellar contract config
Contract IDs are scattered as raw `process.env` reads inside `StellarService`.

**Done when:** A dedicated config service holds all contract IDs, the app fails fast with a clear error if any ID is missing, and no direct `process.env` reads remain in `StellarService`.

---

### #14 · 🟡 ✨ Wire `POST /proof/revoke` to the on-chain contract
Revocation only marks the proof inactive in the DB — it never calls `revoke_proof` on-chain.

**Done when:** The endpoint calls `StellarService` to invoke `revoke_proof` on the Reputation Registry, updates the DB only after confirmed on-chain revocation, and returns the Stellar transaction hash.

---

### #15 · 🟡 ✨ Add integration tests for the `auth` module
No tests exist for the Stellar wallet challenge/verify auth flow.

**Done when:** Tests use `@nestjs/testing`, cover valid signature → JWT issued, invalid signature → 401, and expired nonce → 401.

---

### #16 · 🔴 ✨ Move ZK proof generation to a Bull queue worker
`POST /proof/generate` runs `snarkjs.groth16.fullProve` synchronously, blocking for up to 30 seconds.

**Done when:** Generation is dispatched to a `proof-generation` Bull queue, the endpoint returns `{ jobId }` immediately (HTTP 202), and `GET /proof/status/:jobId` reflects `queued | generating | complete | failed` in real time.

---

### #17 · 🔴 ✨ Implement the `stellar-submit` Bull queue worker
Stellar transactions are submitted synchronously inside request handlers, causing timeouts on network delays.

**Done when:** All on-chain transactions go through the `stellar-submit` queue, the worker handles build → sign → submit → confirm, duplicates are de-duplicated by `proof_hash`, and failed jobs retry up to 3 times with exponential backoff.

---

### #18 · 🔴 ✨ Add a Soroban event indexer for proof registrations
The backend cannot detect proof registration events from the Reputation Registry contract.

**Done when:** A scheduled NestJS task polls `("proof", "reg")` Soroban events every 30 seconds, syncs new records into the `proofs` DB table (idempotent), and the start ledger is configurable via env var.

---

### #19 · 🔴 ✨ Implement and bundle Circom circuits
`src/proof/circuits/` is empty — no circuits are compiled or available.

**Done when:** At least `success_rate_gt_95.circom` is implemented, compiled `.wasm` and `.zkey` files are placed under `src/proof/circuits/`, `ProofService` loads the correct files by `circuitName`, and `scripts/compile-circuits.sh` documents the steps.

---

### #20 · 🔴 🧹 Add Swagger / OpenAPI documentation
No auto-generated API docs exist.

**Done when:** `@nestjs/swagger` is configured in `main.ts`, all controllers have `@ApiTags`/`@ApiOperation`/`@ApiResponse`, all DTOs have `@ApiProperty`, Swagger UI is at `/docs` in dev, and `npm run docs:export` generates `openapi.json`.

---

## How to Contribute

1. Pick an issue, leave a comment so others know you're working on it.
2. Branch: `git checkout -b feat/issue-{number}-short-description`
3. Make changes and add/update tests.
4. Run `npm run lint && npm run test` — everything must pass.
5. Open a PR referencing the issue: `Closes #N`.

PRs are reviewed within 48 hours. Questions? Drop a comment on the issue. 🙌
