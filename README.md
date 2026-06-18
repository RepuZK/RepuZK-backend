<div align="center">

# RepuZK — Backend API

**Privacy-preserving reputation infrastructure for the Stellar ecosystem.**

[![NestJS](https://img.shields.io/badge/NestJS-10-red?logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Stellar](https://img.shields.io/badge/Stellar-Testnet-black?logo=stellar)](https://stellar.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

</div>

---

## Overview

RepuZK Backend is the API layer that bridges the frontend, off-chain storage, and three live Soroban smart contracts on Stellar Testnet. Users prove trustworthiness (success rates, job counts, reputation scores) using zero-knowledge proofs — without ever exposing raw private data.

**Core responsibilities:**

| Concern | Implementation |
|---|---|
| Wallet authentication | Stellar Ed25519 signature challenge → JWT |
| Credential issuance | Off-chain storage in PostgreSQL + IPFS pinning via Pinata |
| ZK proof generation | Async SnarkJS Groth16 jobs via Bull queue |
| On-chain registration | Soroban `register_proof()` via Stellar SDK |
| Reputation queries | `get_reputation_score()` with 60s Redis cache |
| Badge resolution | `get_user_badges()` from ReputationRegistry contract |

---

## Deployed Contracts (Testnet)

| Contract | Address | Explorer |
|---|---|---|
| IssuerRegistry | `CBKPGRVKOSSLZL3CPLHFMQOUKAFR2HJDSVOVKLNCBBZY5RYPNGI3YE6S` | [View](https://lab.stellar.org/r/testnet/contract/CBKPGRVKOSSLZL3CPLHFMQOUKAFR2HJDSVOVKLNCBBZY5RYPNGI3YE6S) |
| ReputationRegistry | `CA63GY2TWJTKGECG6FPR4ITW4G5PUH3PCGY7P6HY3EC6NM2VSJIATFOK` | [View](https://lab.stellar.org/r/testnet/contract/CA63GY2TWJTKGECG6FPR4ITW4G5PUH3PCGY7P6HY3EC6NM2VSJIATFOK) |
| Marketplace | `CBCUF26JXDAT64BEOWD5GPH5MNX5OAYW7BUYWSPBVJII5DSO67R6O4RE` | [View](https://lab.stellar.org/r/testnet/contract/CBCUF26JXDAT64BEOWD5GPH5MNX5OAYW7BUYWSPBVJII5DSO67R6O4RE) |

> Deployed on 2026-06-18. Admin: `GBDAMG7J7CMDFPV5ZGCAKOFPUZJ263EWITRTSNBFZEYSBI5H2IR7543R`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 + TypeScript 5 |
| Database | PostgreSQL 15 (TypeORM, auto-sync) |
| Cache / Queues | Redis + Bull |
| Blockchain | Stellar Testnet · Soroban SDK v12 |
| ZK Proofs | SnarkJS 0.7 (Groth16) |
| Credential Storage | IPFS via Pinata |
| Auth | Passport JWT + Stellar Ed25519 (tweetnacl) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### Install

```bash
git clone https://github.com/RepuZK/RepuZK-backend
cd RepuZK-backend
npm install
```

### Configure

Create a `.env` file in the project root:

```bash
# Server
PORT=3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/repuzk

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-strong-secret-here
JWT_EXPIRES_IN=7d

# Stellar
STELLAR_NETWORK=testnet
STELLAR_ADMIN_SECRET=S...          # Admin keypair secret

# Contracts (pre-filled for testnet)
ISSUER_REGISTRY_CONTRACT=CBKPGRVKOSSLZL3CPLHFMQOUKAFR2HJDSVOVKLNCBBZY5RYPNGI3YE6S
REPUTATION_REGISTRY_CONTRACT=CA63GY2TWJTKGECG6FPR4ITW4G5PUH3PCGY7P6HY3EC6NM2VSJIATFOK
MARKETPLACE_CONTRACT=CBCUF26JXDAT64BEOWD5GPH5MNX5OAYW7BUYWSPBVJII5DSO67R6O4RE

# IPFS (Pinata)
IPFS_API_URL=https://api.pinata.cloud
IPFS_API_KEY=...
IPFS_API_SECRET=...
```

### Run

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build && npm start
```

API is available at `http://localhost:3000/api`

---

## API Reference

> All protected routes require `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/api/auth/challenge` | `{ address }` | `{ nonce }` |
| `POST` | `/api/auth/verify` | `{ address, signature, nonce }` | `{ access_token }` |

**Auth flow:**
1. Request a nonce for your wallet address
2. Sign the nonce with your Stellar keypair (Ed25519)
3. Submit the base64-encoded signature to receive a JWT

---

### Issuer

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/issuer/register` | ✅ | Register caller as a credential issuer |
| `POST` | `/api/issuer/credential-type` | ✅ | Define a new credential type |
| `POST` | `/api/issuer/issue` | ✅ | Issue a credential to a user |
| `GET` | `/api/issuer/all` | — | List all registered issuers |
| `GET` | `/api/issuer/:address` | — | Get issuer by Stellar address |

---

### Credential

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/credential/user/:address` | — | List credentials for a wallet |
| `GET` | `/api/credential/:id` | — | Get credential by ID |
| `POST` | `/api/credential/upload-ipfs` | ✅ | Pin credential payload to IPFS |

---

### Proof

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/proof/generate` | ✅ | Queue a ZK proof generation job |
| `GET` | `/api/proof/status/:jobId` | — | Poll job status |
| `GET` | `/api/proof/user/:address` | — | List proofs for a wallet |
| `POST` | `/api/proof/revoke` | ✅ | Revoke an active proof |

**Generate proof request:**
```json
{
  "credentialId": "uuid",
  "circuitName": "success_rate_gt_95",
  "privateInputs": { "success_rate": 98 }
}
```

**Status response:**
```json
{ "status": "complete", "proofHash": "0xabc..." }
```

---

### Reputation

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/reputation/score/:address` | — | On-chain score + component breakdown |
| `GET` | `/api/reputation/verify/:address?threshold=800` | — | Boolean threshold check |
| `GET` | `/api/reputation/badges/:address` | — | List awarded badges |
| `POST` | `/api/reputation/verify-on-chain` | ✅ | Cross-contract credential verification |

**Score response:**
```json
{
  "score": 850,
  "proof_count": 4,
  "components": {
    "jobs_completed": 50,
    "success_rate": 70,
    "verified_human": 50,
    "proposals": 45
  }
}
```

---

## ZK Proof Flow

```
1. POST /proof/generate  { credentialId, circuitName, privateInputs }
         ↓
2. [Bull: proof-generation queue]
   snarkjs.groth16.fullProve(inputs, circuit.wasm, circuit.zkey)
         ↓
3. [Bull: stellar-submit queue]
   reputation_registry.register_proof(owner, issuer, proofHash, ...)
         ↓
4. GET /proof/status/:jobId  →  { status: "complete", proofHash }
```

### Supported Circuits

Place `.wasm` + `.zkey` files in `src/proof/circuits/`:

| Circuit | Claim Proved | Private Input |
|---|---|---|
| `success_rate_gt_N` | success_rate ≥ N | `{ success_rate }` |
| `jobs_completed_gt_N` | jobs_completed ≥ N | `{ jobs_completed }` |
| `score_gt_N` | reputation score ≥ N | `{ score }` |
| `disputes_zero` | disputes = 0 | `{ disputes }` |
| `votes_gt_N` | governance votes ≥ N | `{ votes }` |
| `gpa_gt_N` | GPA ≥ N | `{ gpa }` |

---

## Reputation Score Model

Scores range **0–1000**, computed on-chain from active registered proofs:

| Credential Type | Points |
|---|---|
| `success_rate` | +70 |
| `jobs_completed` | +50 |
| `verified_human` | +50 |
| `proposals` | +45 |
| `contributions` | +40 |
| `course_completed` | +30 |
| other | +20 |

---

## Database Schema

```
issuers              — registered issuers (mirrors on-chain)
credential_types     — credential schemas per issuer
credentials          — off-chain payloads + IPFS CIDs
proofs               — ZK proof records + Stellar tx hashes
verifications        — on-chain verification request log
```

---

## Redis Key Patterns

| Key | TTL | Purpose |
|---|---|---|
| `challenge:{address}` | 5 min | Auth nonce |
| `score:{address}` | 60 s | Cached reputation score |
| `proof:status:{jobId}` | 1 hr | ZK job status |

---

## Project Structure

```
src/
├── main.ts
├── app.module.ts
├── auth/               Wallet auth + JWT
├── stellar/            Soroban contract clients
├── issuer/             Issuer registration + credential issuance
├── credential/         Credential storage + IPFS upload
├── proof/              ZK generation + on-chain submission
│   └── circuits/       .wasm + .zkey files go here
├── reputation/         Score queries, badges, threshold checks
└── common/
    ├── database/       TypeORM entities
    ├── redis/          Global Redis client
    └── guards/         JWT auth guard
```

---

## Related Repos

| Repo | Description |
|---|---|
| [RepuZK-contract](https://github.com/RepuZK/RepuZK-contract) | Soroban smart contracts in Rust |
| [RepuZK-frontend](https://github.com/RepuZK/RepuZK-frontend) | Next.js dashboard + marketplace UI |

---

<p align="center">Built on Stellar · Powered by Zero-Knowledge Proofs</p>
