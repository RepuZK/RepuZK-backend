import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StellarService } from '../stellar/stellar.service';
import { Verification } from '../common/database/entities/verification.entity';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';

const SCORE_TTL = 60;

@Injectable()
export class ReputationService {
  constructor(
    @InjectRepository(Verification) private readonly verificationRepo: Repository<Verification>,
    private readonly stellar: StellarService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getScore(address: string) {
    const cached = await this.redis.get(`score:${address}`);
    if (cached) return JSON.parse(cached);

    const score = await this.stellar.getReputationScore(address);
    await this.redis.setex(`score:${address}`, SCORE_TTL, JSON.stringify(score));
    return score;
  }

  async verifyThreshold(address: string, threshold: number) {
    return this.stellar.verifyScoreThreshold(address, threshold);
  }

  async getBadges(address: string) {
    return this.stellar.getUserBadges(address);
  }

  async verifyOnChain(dto: {
    userAddress: string;
    requiredScore: number;
    requiredCredentials: string[];
    zkProofHash: string;
  }) {
    const [meetsScore, credResults] = await Promise.all([
      this.stellar.verifyScoreThreshold(dto.userAddress, dto.requiredScore),
      Promise.all(
        dto.requiredCredentials.map((cred) => this.stellar.hasCredential(dto.userAddress, cred)),
      ),
    ]);

    const meetsCredentials = credResults.every(Boolean);
    const isValid = meetsScore && meetsCredentials;

    const record = this.verificationRepo.create({
      requesterAddress: dto.userAddress,
      targetAddress: dto.userAddress,
      proofHash: dto.zkProofHash,
      completedAt: new Date(),
      isValid,
    });
    await this.verificationRepo.save(record);
    return { isValid, meetsScore, meetsCredentials };
  }
}
