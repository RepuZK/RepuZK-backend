# RepuZK — Frontend Implementation Guide

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Stellar Wallets Kit · React Query

---

## Overview

The frontend is a Next.js 14 App Router application. It talks exclusively to the RepuZK backend REST API — it never calls Soroban contracts directly. All blockchain interaction is proxied through the backend.

---

## Environment Variables

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_ISSUER_REGISTRY_CONTRACT=CBKPGRVKOSSLZL3CPLHFMQOUKAFR2HJDSVOVKLNCBBZY5RYPNGI3YE6S
NEXT_PUBLIC_REPUTATION_REGISTRY_CONTRACT=CA63GY2TWJTKGECG6FPR4ITW4G5PUH3PCGY7P6HY3EC6NM2VSJIATFOK
NEXT_PUBLIC_MARKETPLACE_CONTRACT=CBCUF26JXDAT64BEOWD5GPH5MNX5OAYW7BUYWSPBVJII5DSO67R6O4RE
```

---

## Dependencies

```bash
npm install \
  @tanstack/react-query \
  @stellar/stellar-wallets-kit \
  @stellar/stellar-sdk \
  axios \
  tailwindcss \
  clsx
```

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                  # Root layout: providers, navbar
│   ├── page.tsx                    # Landing page
│   ├── dashboard/page.tsx          # Score, proofs, badges
│   ├── proofs/
│   │   ├── page.tsx                # All proofs list
│   │   ├── generate/page.tsx       # ZK proof wizard
│   │   └── [proofHash]/page.tsx    # Proof detail
│   ├── marketplace/
│   │   ├── page.tsx                # Browse listings
│   │   ├── create/page.tsx         # Create listing
│   │   ├── [listingId]/page.tsx    # Listing detail + purchase
│   │   └── orders/page.tsx         # Order management
│   ├── issuer/
│   │   ├── page.tsx                # Issuer dashboard
│   │   ├── credentials/page.tsx    # Issue credentials
│   │   └── types/page.tsx          # Manage credential types
│   └── verify/[address]/page.tsx   # Public reputation profile
│
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Sidebar.tsx
│   ├── wallet/
│   │   ├── WalletConnect.tsx
│   │   └── WalletButton.tsx
│   ├── reputation/
│   │   ├── ScoreCard.tsx           # Circular gauge + breakdown
│   │   ├── ProofList.tsx
│   │   ├── ProofCard.tsx
│   │   └── BadgeGrid.tsx
│   ├── proof/
│   │   ├── ProofGeneratorWizard.tsx
│   │   ├── ClaimSelector.tsx
│   │   └── ProofStatusPoller.tsx
│   ├── marketplace/
│   │   ├── ListingGrid.tsx
│   │   ├── ListingCard.tsx
│   │   ├── ListingFilters.tsx
│   │   ├── PurchaseFlow.tsx
│   │   ├── OrderCard.tsx
│   │   └── FeedbackForm.tsx
│   └── issuer/
│       ├── CredentialForm.tsx
│       └── CredentialTypeForm.tsx
│
├── hooks/                          # React Query hooks (see below)
├── lib/
│   ├── api.ts                      # Axios instance
│   └── wallet.ts                   # Stellar Wallets Kit setup
└── providers/
    ├── QueryProvider.tsx
    └── WalletProvider.tsx
```

---

## API Client

**`src/lib/api.ts`**

```typescript
import axios from 'axios';

export const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL });

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

---

## Wallet Setup

**`src/lib/wallet.ts`**

```typescript
import { StellarWalletsKit, WalletNetwork, FREIGHTER_ID } from '@stellar/stellar-wallets-kit';

export const kit = new StellarWalletsKit({
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
    ? WalletNetwork.PUBLIC
    : WalletNetwork.TESTNET,
  selectedWalletId: FREIGHTER_ID,
});
```

---

## Providers

**`src/providers/WalletProvider.tsx`**

```tsx
'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { kit } from '@/lib/wallet';
import { api } from '@/lib/api';

type WalletCtx = { address: string | null; connect: () => Promise<void>; disconnect: () => void };
const WalletContext = createContext<WalletCtx>(null!);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  async function connect() {
    await kit.openModal({ onWalletSelected: async (option) => {
      kit.setWallet(option.id);
      const { address } = await kit.getAddress();

      // Auth: challenge → sign → JWT
      const { data: { nonce } } = await api.post('/auth/challenge', { address });
      const { signedMessage } = await kit.signMessage({ message: nonce, address });
      const { data: { access_token } } = await api.post('/auth/verify', {
        address, signature: signedMessage, nonce,
      });

      localStorage.setItem('access_token', access_token);
      setAddress(address);
    }});
  }

  function disconnect() {
    localStorage.removeItem('access_token');
    setAddress(null);
  }

  return (
    <WalletContext.Provider value={{ address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
```

**`src/app/layout.tsx`**

```tsx
import { QueryProvider } from '@/providers/QueryProvider';
import { WalletProvider } from '@/providers/WalletProvider';
import { Navbar } from '@/components/layout/Navbar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <WalletProvider>
            <Navbar />
            <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
          </WalletProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

---

## React Query Hooks

**`src/hooks/useReputation.ts`**

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const useReputationScore = (address: string) =>
  useQuery({
    queryKey: ['score', address],
    queryFn: () => api.get(`/reputation/score/${address}`).then(r => r.data),
    enabled: !!address,
  });

export const useUserBadges = (address: string) =>
  useQuery({
    queryKey: ['badges', address],
    queryFn: () => api.get(`/reputation/badges/${address}`).then(r => r.data),
    enabled: !!address,
  });

export const useVerifyThreshold = (address: string, threshold: number) =>
  useQuery({
    queryKey: ['verify', address, threshold],
    queryFn: () => api.get(`/reputation/verify/${address}?threshold=${threshold}`).then(r => r.data),
    enabled: !!address,
  });
```

**`src/hooks/useProofs.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const useUserProofs = (address: string) =>
  useQuery({
    queryKey: ['proofs', address],
    queryFn: () => api.get(`/proof/user/${address}`).then(r => r.data),
    enabled: !!address,
  });

export const useProofStatus = (jobId: string) =>
  useQuery({
    queryKey: ['proofStatus', jobId],
    queryFn: () => api.get(`/proof/status/${jobId}`).then(r => r.data),
    enabled: !!jobId,
    refetchInterval: (data) => data?.status === 'complete' || data?.status === 'failed' ? false : 2000,
  });

export const useGenerateProof = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { credentialId: string; circuitName: string; privateInputs: object }) =>
      api.post('/proof/generate', body).then(r => r.data),
  });
};
```

**`src/hooks/useCredentials.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const useUserCredentials = (address: string) =>
  useQuery({
    queryKey: ['credentials', address],
    queryFn: () => api.get(`/credential/user/${address}`).then(r => r.data),
    enabled: !!address,
  });
```

**`src/hooks/useMarketplace.ts`**

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const useListings = () =>
  useQuery({ queryKey: ['listings'], queryFn: () => api.get('/marketplace/listings').then(r => r.data) });

export const useCreateListing = () =>
  useMutation({ mutationFn: (body: object) => api.post('/marketplace/create-listing', body).then(r => r.data) });

export const usePurchaseService = () =>
  useMutation({ mutationFn: (body: { listingId: string; zkProofHash: string }) =>
    api.post('/marketplace/purchase', body).then(r => r.data) });
```

---

## Pages

### Dashboard — `src/app/dashboard/page.tsx`

```tsx
'use client';
import { useWallet } from '@/providers/WalletProvider';
import { useReputationScore, useUserBadges } from '@/hooks/useReputation';
import { useUserProofs } from '@/hooks/useProofs';
import { ScoreCard } from '@/components/reputation/ScoreCard';
import { BadgeGrid } from '@/components/reputation/BadgeGrid';
import { ProofList } from '@/components/reputation/ProofList';

export default function Dashboard() {
  const { address } = useWallet();
  const { data: score } = useReputationScore(address!);
  const { data: badges } = useUserBadges(address!);
  const { data: proofs } = useUserProofs(address!);

  if (!address) return <p>Connect your wallet to view your dashboard.</p>;

  return (
    <div className="space-y-8">
      <ScoreCard score={score} />
      <BadgeGrid badges={badges} />
      <ProofList proofs={proofs} />
    </div>
  );
}
```

---

### Proof Generator Wizard — `src/app/proofs/generate/page.tsx`

5-step flow:

```
Step 1 → Select credential    GET /credential/user/:address
Step 2 → Choose claim         Map credentialType → supported circuits
Step 3 → Generate proof       POST /proof/generate → { jobId }
Step 4 → Poll status          GET /proof/status/:jobId every 2s
Step 5 → Done                 Show proofHash + Stellar tx link
```

```tsx
'use client';
import { useState } from 'react';
import { useWallet } from '@/providers/WalletProvider';
import { useUserCredentials } from '@/hooks/useCredentials';
import { useGenerateProof, useProofStatus } from '@/hooks/useProofs';

const CIRCUIT_MAP: Record<string, string[]> = {
  success_rate:    ['success_rate_gt_95', 'success_rate_gt_80'],
  jobs_completed:  ['jobs_completed_gt_100', 'jobs_completed_gt_50'],
  verified_human:  [],
  proposals:       ['votes_gt_10', 'votes_gt_50'],
  course_completed:['gpa_gt_35'],
};

export default function GenerateProofPage() {
  const { address } = useWallet();
  const { data: credentials } = useUserCredentials(address!);
  const generate = useGenerateProof();

  const [step, setStep] = useState(1);
  const [selectedCred, setSelectedCred] = useState<any>(null);
  const [circuitName, setCircuitName] = useState('');
  const [privateInputs, setPrivateInputs] = useState<object>({});
  const [jobId, setJobId] = useState('');

  const { data: status } = useProofStatus(jobId);

  async function handleGenerate() {
    const { jobId } = await generate.mutateAsync({ credentialId: selectedCred.id, circuitName, privateInputs });
    setJobId(jobId);
    setStep(4);
  }

  // render step UI...
}
```

---

### Marketplace — `src/app/marketplace/page.tsx`

```tsx
'use client';
import { useListings } from '@/hooks/useMarketplace';
import { ListingGrid } from '@/components/marketplace/ListingGrid';
import { ListingFilters } from '@/components/marketplace/ListingFilters';

export default function MarketplacePage() {
  const { data: listings } = useListings();
  return (
    <div className="flex gap-6">
      <ListingFilters />
      <ListingGrid listings={listings} />
    </div>
  );
}
```

---

### Public Verify — `src/app/verify/[address]/page.tsx`

```tsx
import { useReputationScore, useUserBadges } from '@/hooks/useReputation';
import { useUserProofs } from '@/hooks/useProofs';
import { ScoreCard } from '@/components/reputation/ScoreCard';

export default function VerifyPage({ params }: { params: { address: string } }) {
  const { data: score } = useReputationScore(params.address);
  const { data: badges } = useUserBadges(params.address);
  const { data: proofs } = useUserProofs(params.address);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reputation Profile</h1>
      <p className="font-mono text-sm text-gray-500">{params.address}</p>
      <ScoreCard score={score} />
      {/* badges, proofs */}
    </div>
  );
}
```

---

## Key Components

### `ScoreCard.tsx`

Displays the 0–1000 score as a radial gauge with a breakdown table of components (`jobs_completed`, `success_rate`, etc.). Use the score response shape:

```typescript
// From GET /reputation/score/:address
{
  score: 850,
  proof_count: 4,
  components: {
    jobs_completed: 50,
    success_rate: 70,
    verified_human: 50,
    proposals: 45
  }
}
```

### `ProofStatusPoller.tsx`

Uses `useProofStatus(jobId)` which refetches every 2 seconds until `status === "complete"` or `"failed"`.

```tsx
export function ProofStatusPoller({ jobId }: { jobId: string }) {
  const { data } = useProofStatus(jobId);
  if (!data) return <Spinner />;
  if (data.status === 'complete') return <p>✅ Proof registered — hash: {data.proofHash}</p>;
  if (data.status === 'failed') return <p>❌ Proof generation failed</p>;
  return <p>⏳ Generating proof...</p>;
}
```

### `PurchaseFlow.tsx`

1. Call `GET /reputation/verify/:address?threshold={minScore}` — show pass/fail
2. If passes, show confirmation with price and delivery days
3. On confirm, call `POST /marketplace/purchase` with `{ listingId, zkProofHash }`
4. Show order ID and status on success

---

## Auth Flow (complete)

```
1. User clicks "Connect Wallet"
2. Stellar Wallets Kit opens modal → user selects Freighter / xBull / Lobstr
3. POST /auth/challenge { address } → { nonce }
4. kit.signMessage({ message: nonce, address }) → { signedMessage }
5. POST /auth/verify { address, signature: signedMessage, nonce } → { access_token }
6. Store access_token in localStorage
7. api.ts interceptor attaches it as Authorization: Bearer <token> on all subsequent requests
```

---

## Score Model Reference

Use these weights to show a breakdown UI:

| Credential Type | Points |
|---|---|
| `success_rate` | +70 |
| `jobs_completed` | +50 |
| `verified_human` | +50 |
| `proposals` | +45 |
| `contributions` | +40 |
| `course_completed` | +30 |
| other | +20 |

Max score: **1000**

---

## Deployment

```bash
# Build
npm run build

# Start
npm start
```

Point `NEXT_PUBLIC_API_URL` to the deployed backend URL before building for production.
