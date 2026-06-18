# RepuZK — Backend API

> Privacy-preserving reputation infrastructure for the Stellar ecosystem.  
> NestJS · PostgreSQL · Redis · Soroban · SnarkJS

---

## What This Does

RepuZK Backend is the API layer between the frontend and the three deployed Soroban smart contracts. It handles:

- **Wallet authentication** — Stellar signature challenge/verify → JWT
- **Credential issuance** — off-chain credential storage with IPFS pinning
- **ZK proof generation** — async SnarkJS (Groth16) proof jobs via Bull queues
- **On-chain registration** — submits proof hashes to the Reputation Registry contract
- **Reputation queries** — score lookups with Redis caching, badge resolution
- **Marketplace** — listing creation and service purchase via escrow

---

## Deployed Contracts (Testnet)

| Contract | Address |
|---|---|
| IssuerRegistry | `CBKPGRVKOSSLZL3CPLHFMQOUKAFR2HJDSVOVKLNCBBZY5RYPNGI3YE6S` |
| ReputationRegistry | `CA63GY2TWJTKGECG6FPR4ITW4G5PUH3PCGY7P6HY3EC6NM2VSJIATFOK` |
| Marketplace | `CBCUF26JXDAT64BEOWD5GPH5MNX5OAYW7BUYWSPBVJII5DSO67R6O4RE` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS + TypeScript |
| Database | PostgreSQL (TypeORM) |
| Cache / Queues | Redis + Bull |
| Blockchain | Stellar Testnet / Soroban SDK |
| ZK Proofs | SnarkJS (Groth16) |
| Credential Storage | IPFS via Pinata |
| Auth | JWT + Stellar Ed25519 signature |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis

### Install

```bash
git clone https://github.com/RepuZK/RepuZK-backend
cd RepuZK-backend
npm install
```

### Configure

Copy `.env` and fill in your values:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/repuzk
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret
STELLAR_ADMIN_SECRET=S...
IPFS_API_KEY=...
IPFS_API_SECRET=...
```

Contract addresses are pre-filled for testnet.

### Run

```bash
# Development
npm run start:dev

# Production
npm run build && npm start
```

API is available at `http://localhost:3000/api`

---

## API Overview

### Auth
```
POST /api/auth/challenge     { address }         → { nonce }
POST /api/auth/verify        { address, signature, nonce } → { access_token }
```

### Issuer
```
POST /api/issuer/register         Register as a credential issuer
POST /api/issuer/credential-type  Define a new credential type
POST /api/issuer/issue            Issue a credential to a user
GET  /api/issuer/:address         Get issuer details
GET  /api/issuer/all              List all issuers
```

### Credential
```
GET  /api/credential/user/:address   List user credentials
GET  /api/credential/:id             Get credential by ID
POST /api/credential/upload-ipfs     Pin credential payload to IPFS
```

### Proof
```
POST /api/proof/generate        { credentialId, circuitName, privateInputs } → { jobId }
GET  /api/proof/status/:jobId   Poll proof generation status
GET  /api/proof/user/:address   List user's registered proofs
POST /api/proof/revoke          { proofHash }
```

### Reputation
```
GET  /api/reputation/score/:address           On-chain score + components
GET  /api/reputation/verify/:address?threshold=800
GET  /api/reputation/badges/:address          Awarded badges
POST /api/reputation/verify-on-chain          Cross-contract credential check
```

---

## ZK Proof Flow

```
1. POST /proof/generate
        ↓
2. Bull queue: snarkjs.groth16.fullProve(inputs, circuit.wasm, circuit.zkey)
        ↓
3. Bull queue: stellar.register_proof(...) → on-chain tx
        ↓
4. GET /proof/status/:jobId  →  { status: "complete", proofHash: "0x..." }
```

Place compiled circuit files in `src/proof/circuits/`:
- `<circuit_name>.wasm`
- `<circuit_name>.zkey`

| Circuit | Claim |
|---|---|
| `success_rate_gt_N` | success_rate ≥ N |
| `jobs_completed_gt_N` | jobs_completed ≥ N |
| `score_gt_N` | reputation score ≥ N |
| `disputes_zero` | disputes = 0 |
| `votes_gt_N` | governance votes ≥ N |
| `gpa_gt_N` | GPA ≥ N |

---

## Project Structure

```
src/
├── auth/               Wallet auth + JWT
├── stellar/            Soroban contract clients
├── issuer/             Issuer management
├── credential/         Credential storage + IPFS
├── proof/              ZK generation + on-chain submission
│   └── circuits/       .wasm + .zkey files go here
├── reputation/         Score queries + badges
└── common/
    ├── database/       TypeORM entities
    ├── redis/          Redis client
    └── guards/         JWT guard
```

---

## Related Repos

| Repo | Description |
|---|---|
| [RepuZK-contract](https://github.com/RepuZK/RepuZK-contract) | Soroban smart contracts (Rust) |
| [RepuZK-frontend](https://github.com/RepuZK/RepuZK-frontend) | Next.js user dashboard + marketplace |

---

<p align="center">Built on Stellar · Powered by Zero-Knowledge Proofs</p>
