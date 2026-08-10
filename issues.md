# RepuZK Backend — Known Gaps / Roadmap

> **Stack:** NestJS · TypeScript · PostgreSQL · Redis · Circom/SnarkJS · Stellar SDK
> **Start here:** [`README.md`](./README.md) · [`structure.md`](./structure.md)

This is a solo-maintained project. This file is an honest, current snapshot of
what's done and what's still open — not a contributor board.

---

## Recently closed

- Startup env-var validation (Joi schema on `ConfigModule`) — a missing
  `JWT_SECRET`, `STELLAR_ADMIN_SECRET`, contract ID, etc. now fails fast at
  boot instead of surfacing deep inside a request handler.
- `helmet()` + CORS restricted to a configured origin allowlist (was wide open).
- Rate limiting extended from `/auth/*` only to `/proof/generate`,
  `/proof/revoke`, and `/credential/upload-ipfs`.
- Marketplace list endpoints (`getListings`, buyer/seller orders) now use the
  same `{data, total, page, limit}` pagination pattern as the rest of the API.
- Added the marketplace order lifecycle to the REST surface: `POST
  /marketplace/orders/:id/{start,complete,dispute}`, wired to the contract's
  `start_order`/`complete_order`/`raise_dispute` — these existed on-chain but
  had no HTTP endpoint.
- `stellar/` (the on-chain client that signs and submits real transactions)
  and `marketplace/` now have unit test coverage; previously zero.
- **Test coverage for `reputation/`, `issuer/`, and `health/`** — all three
  had zero tests; now covered (cache hit/miss behavior and score-threshold
  logic for `reputation`, registration/hashing/pagination for `issuer`,
  liveness shape for `health`). `npm test` no longer passes with
  `--passWithNoTests`, so an accidentally-emptied suite now fails CI.
- **IPFS credential payload was plaintext.** `credential/upload-ipfs` now
  encrypts the payload (AES-256-GCM, key derived per-credential via HKDF
  from `CREDENTIAL_ENCRYPTION_KEY`) before pinning to Pinata, so the raw
  data isn't readable by anyone who only has the CID — see
  `src/credential/credential-encryption.ts`.

## Genuinely open

- **Session storage**: the frontend stores the JWT in `localStorage`
  (XSS-exfiltration risk). Moving to an httpOnly cookie would require
  coordinated backend + frontend changes (CORS `credentials`, cookie
  issuance on `/auth/verify` and `/auth/refresh`) — not started.
- **Marketplace order REST paths**: `start`/`complete`/`dispute` are new and
  unverified against a running frontend + live testnet contract end-to-end;
  they're unit-tested against a mocked Soroban client, not integration-tested.

---

## Contributing

Solo project for now — open an issue if you'd like to pick something up.
