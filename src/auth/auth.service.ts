import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import * as nacl from 'tweetnacl';
import { v4 as uuidv4 } from 'uuid';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';

const CHALLENGE_TTL = 300; // 5 minutes

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
    const access_token = this.jwtService.sign({ sub: address, address });
    return { access_token };
  }
}
