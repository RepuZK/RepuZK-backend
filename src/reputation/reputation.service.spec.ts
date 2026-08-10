import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReputationService } from './reputation.service';
import { Verification } from '../common/database/entities/verification.entity';
import { StellarService } from '../stellar/stellar.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';

describe('ReputationService', () => {
  let service: ReputationService;
  let verificationRepo: { create: jest.Mock; save: jest.Mock };
  let stellar: {
    getReputationScore: jest.Mock;
    getScoreValue: jest.Mock;
    getUserBadges: jest.Mock;
    verifyScoreThreshold: jest.Mock;
    hasCredential: jest.Mock;
  };
  let redis: { get: jest.Mock; setex: jest.Mock };

  beforeEach(async () => {
    verificationRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    stellar = {
      getReputationScore: jest.fn(),
      getScoreValue: jest.fn(),
      getUserBadges: jest.fn(),
      verifyScoreThreshold: jest.fn(),
      hasCredential: jest.fn(),
    };
    redis = { get: jest.fn(), setex: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReputationService,
        { provide: getRepositoryToken(Verification), useValue: verificationRepo },
        { provide: StellarService, useValue: stellar },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(ReputationService);
  });

  describe('getScore', () => {
    it('returns the cached score without calling the chain on a cache hit', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ score: 850 }));

      const result = await service.getScore('GADDR');

      expect(result).toEqual({ score: 850 });
      expect(stellar.getReputationScore).not.toHaveBeenCalled();
    });

    it('fetches on-chain and caches for 60s on a cache miss', async () => {
      redis.get.mockResolvedValue(null);
      stellar.getReputationScore.mockResolvedValue({ score: 400 });

      const result = await service.getScore('GADDR');

      expect(result).toEqual({ score: 400 });
      expect(redis.setex).toHaveBeenCalledWith('score:GADDR', 60, JSON.stringify({ score: 400 }));
    });
  });

  describe('verifyThreshold', () => {
    it('reports passes=true when the on-chain score meets the threshold', async () => {
      redis.get.mockResolvedValue(null);
      stellar.getScoreValue.mockResolvedValue(800);

      const result = await service.verifyThreshold('GADDR', 800);

      expect(result).toEqual({ address: 'GADDR', score: 800, threshold: 800, passes: true });
    });

    it('reports passes=false when below the threshold, and caches under a threshold-scoped key', async () => {
      redis.get.mockResolvedValue(null);
      stellar.getScoreValue.mockResolvedValue(799);

      const result = await service.verifyThreshold('GADDR', 800);

      expect(result.passes).toBe(false);
      expect(redis.setex).toHaveBeenCalledWith(
        'verify:GADDR:800',
        60,
        JSON.stringify(result),
      );
    });

    it('returns the cached result without calling the chain on a cache hit', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({ address: 'GADDR', score: 900, threshold: 500, passes: true }),
      );

      const result = await service.verifyThreshold('GADDR', 500);

      expect(result.passes).toBe(true);
      expect(stellar.getScoreValue).not.toHaveBeenCalled();
    });
  });

  describe('getBadges', () => {
    it('delegates directly to the chain client', async () => {
      stellar.getUserBadges.mockResolvedValue(['top_developer']);

      const result = await service.getBadges('GADDR');

      expect(result).toEqual(['top_developer']);
      expect(stellar.getUserBadges).toHaveBeenCalledWith('GADDR');
    });
  });

  describe('verifyOnChain', () => {
    const dto = {
      userAddress: 'GADDR',
      requiredScore: 800,
      requiredCredentials: ['jobs_completed', 'success_rate'],
      zkProofHash: '0xabc',
    };

    it('is valid only when both score and every required credential pass, and persists the verification', async () => {
      stellar.verifyScoreThreshold.mockResolvedValue(true);
      stellar.hasCredential.mockResolvedValue(true);

      const result = await service.verifyOnChain(dto);

      expect(result).toEqual({ isValid: true, meetsScore: true, meetsCredentials: true });
      expect(stellar.hasCredential).toHaveBeenCalledWith('GADDR', 'jobs_completed');
      expect(stellar.hasCredential).toHaveBeenCalledWith('GADDR', 'success_rate');
      expect(verificationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ requesterAddress: 'GADDR', targetAddress: 'GADDR', isValid: true }),
      );
    });

    it('is invalid when the score threshold is not met, even if all credentials are held', async () => {
      stellar.verifyScoreThreshold.mockResolvedValue(false);
      stellar.hasCredential.mockResolvedValue(true);

      const result = await service.verifyOnChain(dto);

      expect(result).toEqual({ isValid: false, meetsScore: false, meetsCredentials: true });
    });

    it('is invalid when any single required credential is missing, even if the score passes', async () => {
      stellar.verifyScoreThreshold.mockResolvedValue(true);
      stellar.hasCredential.mockImplementation(async (_addr: string, cred: string) => cred !== 'success_rate');

      const result = await service.verifyOnChain(dto);

      expect(result).toEqual({ isValid: false, meetsScore: true, meetsCredentials: false });
    });
  });
});
