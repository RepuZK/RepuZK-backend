# Contributing to RepuZK Backend

Thank you for making RepuZK better. This guide will get you from clone to PR.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Runtime |
| npm | 9+ | Package manager |
| PostgreSQL | 15+ | Primary database |
| Redis | 7+ | Cache + Bull queues |
| Stellar CLI | optional | Local Soroban dev |

> Verify with `node --version` and `npm --version`.

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/RepuZK/RepuZK-backend.git
cd RepuZK-backend

# 2. Install dependencies
npm install

# 3. Copy the example env file and fill in secrets
cp .env.example .env

# 4. Start PostgreSQL and Redis (local or Docker)
# PostgreSQL: ensure a database named `repuzk` exists
createdb repuzk

# 5. Run the app in watch mode
npm run start:dev
```

The API will be available at `http://localhost:3000/api`.

> TypeORM is configured with `synchronize: true` in development. Tables are auto-created from entities — no migrations needed locally.

---

## Environment Variables

All required variables are documented in `.env.example`. Copy it to `.env` and fill in your values.

| Variable | Example | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/repuzk` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | `your-strong-secret-here` | JWT signing secret (min 32 chars) |
| `JWT_EXPIRES_IN` | `7d` | Access token lifetime |
| `STELLAR_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `STELLAR_ADMIN_SECRET` | `S...` | Admin keypair secret for on-chain tx submission |
| `ISSUER_REGISTRY_CONTRACT` | `CBKP...` | Deployed IssuerRegistry contract ID |
| `REPUTATION_REGISTRY_CONTRACT` | `CA63...` | Deployed ReputationRegistry contract ID |
| `MARKETPLACE_CONTRACT` | `CBCU...` | Deployed Marketplace contract ID |
| `IPFS_API_URL` | `https://api.pinata.cloud` | Pinata API base URL |
| `IPFS_API_KEY` | `...` | Pinata API key |
| `IPFS_API_SECRET` | `...` | Pinata API secret |

> Contract IDs above are pre-filled for Stellar Testnet. Ask a maintainer for mainnet values.

---

## Running Tests

### Install test dependencies (first time)

```bash
npm install
```

### Run tests

```bash
# All tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage report
npm run test:cov
```

Tests use **Jest** + **@nestjs/testing**. Place unit tests alongside the module they cover using the `*.spec.ts` convention.

> Test coverage is a work in progress. See open issues #15–#17 for planned integration test additions.

---

## Linting

```bash
# Check for issues
npm run lint

# Auto-fix what we can
npm run lint:fix
```

ESLint uses `@typescript-eslint/recommended` rules. We prefer strict typing and explicit returns, but pragmatic patches for issues get a pass.

---

## Project Structure

```
src/
├── main.ts                 App bootstrap (port, CORS, validation pipe)
├── app.module.ts           Root module (TypeORM, Bull, Redis)
├── auth/                   Stellar Ed25519 challenge → JWT
├── stellar/                Soroban contract client wrappers
├── issuer/                 Issuer registration + credential issuance
├── credential/             Credential storage + IPFS upload
├── proof/                  ZK proof generation + on-chain submission
│   └── circuits/           .wasm + .zkey files (not yet compiled)
├── reputation/             Score queries, badges, threshold checks
└── common/
    ├── database/           TypeORM entities
    ├── redis/              Global Redis client provider
    └── guards/             JWT auth guard
```

---

## PR Workflow

1. **Pick an issue.** Leave a comment so others know you're working on it.
2. **Create a branch.** Use the convention:

   ```bash
   git checkout -b feat/issue-{number}-short-description
   ```

   Examples:
   - `feat/issue-5-add-health-endpoint`
   - `fix/issue-10-proof-status-stuck`
   - `docs/issue-3-contributing-guide`

3. **Make changes.** Keep PRs focused — one logical change per PR.
4. **Run the check suite before pushing:**

   ```bash
   npm run lint
   npm test
   ```

   If both pass, commit and push.

5. **Open a Pull Request.**

   - Base branch: `main`
   - Title: `<type>(issue-{number}): short description`
   - Body: reference the issue with `Closes #{number}` or `Fixes #{number}`
   - If the PR is a work in progress, prefix the title with `WIP:`

PR reviews are turned around within 48 hours. Questions? Open a discussion on the issue.

---

## Issue Labels

| Label | Meaning |
|---|---|
| `good-first-issue` | Small, self-contained — ideal starting point |
| `intermediate` | Requires understanding one module |
| `advanced` | Touches multiple modules or the blockchain layer |
| `bug` | Something is broken |
| `feature` | New functionality |
| `refactor` | Cleanup / tooling, no logic change |
| `docs` | Documentation only |

---

## Need Help?

- Check [`README.md`](./README.md) for architecture and API reference.
- Check [`structure.md`](./structure.md) for deeper system design notes.
- Drop a comment on the relevant issue — maintainers are online PST/EST hours.
