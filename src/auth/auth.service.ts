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

  async generateChallenge(address: string): Promise<{ nonce: string }> {
    const nonce = uuidv4();
    await this.redis.setex(`challenge:${address}`, CHALLENGE_TTL, nonce);
    return { nonce };
  }

  async verifySignature(address: string, signature: string, nonce: string) {
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
