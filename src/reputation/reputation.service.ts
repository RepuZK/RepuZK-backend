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

  /**
   * Fetch the on-chain reputation score for a wallet address.
   * Results are cached in Redis for 60 seconds to reduce Soroban RPC load.
   *
   * @param address - The Stellar public key to query.
   * @returns The reputation score object with `score`, `proof_count`, and `components` breakdown.
   */
  async getScore(address: string): Promise<any> {
    const cached = await this.redis.get(`score:${address}`);
    if (cached) return JSON.parse(cached);

    const score = await this.stellar.getReputationScore(address);
    await this.redis.setex(`score:${address}`, SCORE_TTL, JSON.stringify(score));
    return score;
  }

  /**
   * Check whether a wallet's on-chain reputation score meets or exceeds the
   * given threshold.
   *
   * @param address   - The Stellar public key to check.
   * @param threshold - Minimum score required (0–1000).
   * @returns `true` if the score meets the threshold, `false` otherwise.
   */
  async verifyThreshold(address: string, threshold: number): Promise<boolean> {
    return this.stellar.verifyScoreThreshold(address, threshold);
  }

  /**
   * Retrieve the list of reputation badges awarded to the given wallet on-chain.
   *
   * @param address - The Stellar public key to look up.
   * @returns An array of badge identifier strings.
   */
  async getBadges(address: string): Promise<string[]> {
    return this.stellar.getUserBadges(address);
  }

  /**
   * Perform a combined on-chain verification: checks that the user meets a minimum
   * reputation score and holds all required credential types. Logs the verification
   * result to the database.
   *
   * @param dto - Verification parameters:
   *   - `userAddress`          — Stellar address of the user to verify
   *   - `requiredScore`        — Minimum reputation score threshold
   *   - `requiredCredentials`  — Array of credential type strings that must be held
   *   - `zkProofHash`          — Hash of the ZK proof backing the verification request
   * @returns An object with `isValid`, `meetsScore`, and `meetsCredentials` boolean flags.
   */
  async verifyOnChain(dto: {
    userAddress: string;
    requiredScore: number;
    requiredCredentials: string[];
    zkProofHash: string;
  }): Promise<{ isValid: boolean; meetsScore: boolean; meetsCredentials: boolean }> {
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
