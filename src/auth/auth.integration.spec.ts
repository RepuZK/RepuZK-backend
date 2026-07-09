/**
 * Integration tests for the auth module challenge/verify flow.
 *
 * These tests use @nestjs/testing to wire up AuthService with real
 * JwtService and an in-process Redis mock, then exercise the full
 * challenge → sign → verify cycle using an actual Ed25519 keypair
 * so that tweetnacl signature verification runs end-to-end.
 *
 * Scenarios covered (task #15):
 *   1. Valid signature → JWT + refresh token issued
 *   2. Invalid signature → UnauthorizedException (401)
 *   3. Expired / missing nonce → UnauthorizedException (401)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import * as nacl from 'tweetnacl';
import { AuthService } from './auth.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';

// ── In-process Redis stub ──────────────────────────────────────────────────

function buildRedisMock() {
  const store = new Map<string, string>();

  return {
    _store: store,
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setex: jest.fn((key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      const existed = store.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a base64-encoded Ed25519 signature over `message` using the
 * raw 32-byte secret scalar embedded in the Stellar Keypair.
 * tweetnacl.sign.detached expects a 64-byte "seed+public" secret key.
 */
function signNonce(keypair: Keypair, nonce: string): string {
  const messageBytes = Buffer.from(nonce, 'utf8');
  // Stellar's rawSecretKey() is the 32-byte seed; nacl needs the 64-byte expanded key.
  const secretKey = nacl.sign.keyPair.fromSeed(keypair.rawSecretKey()).secretKey;
  const signatureBytes = nacl.sign.detached(messageBytes, secretKey);
  return Buffer.from(signatureBytes).toString('base64');
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('AuthService — challenge / verifySignature integration', () => {
  let service: AuthService;
  let redis: ReturnType<typeof buildRedisMock>;

  // A real Stellar keypair so that tweetnacl verification runs for real.
  const keypair = Keypair.random();
  const address = keypair.publicKey();

  beforeEach(async () => {
    redis = buildRedisMock();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    redis._store.clear();
  });

  // ── 1. Valid signature → JWT issued ───────────────────────────────────────

  describe('valid signature', () => {
    it('returns an access_token and a refresh_token when the signature is correct', async () => {
      // Step 1: request challenge
      const { nonce } = await service.generateChallenge(address);
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(0);

      // Step 2: sign the nonce with the real keypair
      const signature = signNonce(keypair, nonce);

      // Step 3: verify — should succeed and return tokens
      const result = await service.verifySignature(address, signature, nonce);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(typeof result.access_token).toBe('string');
      expect(result.access_token.split('.').length).toBe(3); // valid JWT structure
    });

    it('stores the nonce in Redis with challenge: prefix before verification', async () => {
      const { nonce } = await service.generateChallenge(address);

      expect(redis.setex).toHaveBeenCalledWith(
        `challenge:${address}`,
        300, // 5-minute TTL
        nonce,
      );
    });

    it('consumes the nonce after successful verification (one-time use)', async () => {
      const { nonce } = await service.generateChallenge(address);
      const signature = signNonce(keypair, nonce);

      await service.verifySignature(address, signature, nonce);

      // The nonce must have been deleted from Redis
      expect(redis.del).toHaveBeenCalledWith(`challenge:${address}`);
      expect(await redis.get(`challenge:${address}`)).toBeNull();
    });

    it('stores the refresh token in Redis with a 7-day TTL', async () => {
      const { nonce } = await service.generateChallenge(address);
      const signature = signNonce(keypair, nonce);

      const { refresh_token } = await service.verifySignature(address, signature, nonce);

      expect(redis.setex).toHaveBeenCalledWith(
        `refresh:${refresh_token}`,
        7 * 24 * 60 * 60,
        address,
      );
    });
  });

  // ── 2. Invalid signature → 401 ────────────────────────────────────────────

  describe('invalid signature', () => {
    it('throws UnauthorizedException when the signature is tampered with', async () => {
      const { nonce } = await service.generateChallenge(address);

      // Produce a valid-looking but incorrect signature by signing different data
      const wrongSignature = signNonce(keypair, 'this-is-not-the-nonce');

      await expect(
        service.verifySignature(address, wrongSignature, nonce),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the signature is random garbage', async () => {
      const { nonce } = await service.generateChallenge(address);

      // 64 random bytes encoded as base64 — wrong length too
      const garbageSignature = Buffer.from(nacl.randomBytes(64)).toString('base64');

      await expect(
        service.verifySignature(address, garbageSignature, nonce),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when a different keypair signs the nonce', async () => {
      const { nonce } = await service.generateChallenge(address);

      // Sign with a completely different keypair
      const otherKeypair = Keypair.random();
      const wrongSignature = signNonce(otherKeypair, nonce);

      await expect(
        service.verifySignature(address, wrongSignature, nonce),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('does not consume the nonce when verification fails', async () => {
      const { nonce } = await service.generateChallenge(address);
      const wrongSignature = signNonce(keypair, 'wrong');

      await expect(
        service.verifySignature(address, wrongSignature, nonce),
      ).rejects.toThrow(UnauthorizedException);

      // del should NOT have been called — nonce is still in store
      expect(redis.del).not.toHaveBeenCalledWith(`challenge:${address}`);
    });
  });

  // ── 3. Expired / missing nonce → 401 ─────────────────────────────────────

  describe('expired or missing nonce', () => {
    it('throws UnauthorizedException when no challenge has been requested', async () => {
      const nonce = 'some-nonce-that-was-never-issued';
      const signature = signNonce(keypair, nonce);

      await expect(
        service.verifySignature(address, signature, nonce),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the nonce in the request does not match stored nonce', async () => {
      // Request challenge (stores nonce-A in Redis)
      await service.generateChallenge(address);

      // Submit a different nonce-B (simulates a stale or forged nonce)
      const staleNonce = 'stale-or-forged-nonce';
      const signature = signNonce(keypair, staleNonce);

      await expect(
        service.verifySignature(address, signature, staleNonce),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException after the nonce has already been consumed', async () => {
      const { nonce } = await service.generateChallenge(address);
      const signature = signNonce(keypair, nonce);

      // First use — succeeds
      await service.verifySignature(address, signature, nonce);

      // Second use — nonce was deleted; should fail
      await expect(
        service.verifySignature(address, signature, nonce),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the challenge entry was evicted from Redis (simulated TTL expiry)', async () => {
      const { nonce } = await service.generateChallenge(address);
      const signature = signNonce(keypair, nonce);

      // Simulate TTL expiry: manually remove the key from the mock store
      redis._store.delete(`challenge:${address}`);

      await expect(
        service.verifySignature(address, signature, nonce),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
