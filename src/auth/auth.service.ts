import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import * as nacl from 'tweetnacl';
import { v4 as uuidv4 } from 'uuid';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';

const CHALLENGE_TTL = 300; // 5 minutes
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days
const REFRESH_TOKEN_PREFIX = 'refresh:';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Generate a one-time challenge nonce for the given Stellar address.
   * The nonce is stored in Redis with a 5-minute TTL and must be signed
   * by the corresponding private key to authenticate.
   *
   * @param address - The Stellar public key (G-address) requesting authentication.
   * @returns An object containing the generated nonce string.
   */
  async generateChallenge(address: string): Promise<{ nonce: string }> {
    const nonce = uuidv4();
    await this.redis.setex(`challenge:${address}`, CHALLENGE_TTL, nonce);
    return { nonce };
  }

  /**
   * Verify a Stellar Ed25519 signature against the stored challenge nonce.
   * On success, the nonce is consumed (deleted) and a JWT + refresh token pair is issued.
   *
   * @param address   - The Stellar public key (G-address) that signed the nonce.
   * @param signature - Base64-encoded Ed25519 signature of the nonce.
   * @param nonce     - The plain-text nonce previously issued by {@link generateChallenge}.
   * @returns A {@link TokenPair} containing `access_token` and `refresh_token`.
   * @throws UnauthorizedException if the nonce is missing/expired or the signature is invalid.
   */
  async verifySignature(address: string, signature: string, nonce: string): Promise<TokenPair> {
    const stored = await this.redis.get(`challenge:${address}`);
    if (!stored || stored !== nonce) {
      throw new UnauthorizedException('Invalid or expired challenge');
    }

    // Verify Ed25519 signature: wallet signs the nonce
    try {
      const keypair = Keypair.fromPublicKey(address);
      const messageBytes = Buffer.from(nonce, 'utf8');
      const signatureBytes = Buffer.from(signature, 'base64');
      const publicKeyBytes = keypair.rawPublicKey();
      const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
      if (!valid) throw new Error('bad sig');
    } catch {
      throw new UnauthorizedException('Signature verification failed');
    }

    await this.redis.del(`challenge:${address}`);
    return this.issueTokenPair(address);
  }

  /**
   * Rotate a refresh token: validate the supplied token, invalidate it immediately
   * to prevent replay attacks, and issue a fresh access + refresh token pair.
   *
   * @param refreshToken - The opaque refresh token previously issued by the auth flow.
   * @returns A new {@link TokenPair} with a fresh access token and rotated refresh token.
   * @throws UnauthorizedException if the refresh token is unknown or already used.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const key = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
    const address = await this.redis.get(key);
    if (!address) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Invalidate the used token immediately so it cannot be replayed.
    await this.redis.del(key);
    return this.issueTokenPair(address);
  }

  /**
   * Sign a new JWT access token and store a fresh refresh token in Redis.
   *
   * @param address - The Stellar public key to embed in the token payload.
   * @returns A {@link TokenPair} with a signed JWT and a UUID refresh token.
   */
  private async issueTokenPair(address: string): Promise<TokenPair> {
    const access_token = this.jwtService.sign({ sub: address, address });
    const refresh_token = uuidv4();
    await this.redis.setex(
      `${REFRESH_TOKEN_PREFIX}${refresh_token}`,
      REFRESH_TOKEN_TTL,
      address,
    );
    return { access_token, refresh_token };
  }
}
