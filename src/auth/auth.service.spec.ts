import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';

describe('AuthService - refresh token rotation', () => {
  let service: AuthService;
  let redisStore: Map<string, string>;
  let redis: {
    get: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    redisStore = new Map();
    redis = {
      get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
      setex: jest.fn((key: string, _ttl: number, value: string) => {
        redisStore.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key: string) => {
        const existed = redisStore.delete(key);
        return Promise.resolve(existed ? 1 : 0);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { sign: jest.fn(() => 'signed.jwt.token') } },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  const ADDRESS = 'GABCXYZADDRESS';

  async function issueInitialPair() {
    const key = `refresh:seed-token`;
    redisStore.set(key, ADDRESS);
    return key.replace('refresh:', '');
  }

  describe('happy path', () => {
    it('returns a new access + refresh token pair and stores the new refresh token in Redis with a 7-day TTL', async () => {
      const oldRefreshToken = await issueInitialPair();

      const result = await service.refresh(oldRefreshToken);

      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.refresh_token).toBeDefined();
      expect(result.refresh_token).not.toBe(oldRefreshToken);

      expect(redis.setex).toHaveBeenCalledWith(
        `refresh:${result.refresh_token}`,
        7 * 24 * 60 * 60,
        ADDRESS,
      );
      expect(await redis.get(`refresh:${result.refresh_token}`)).toBe(ADDRESS);
    });

    it('invalidates the old refresh token once it has been used', async () => {
      const oldRefreshToken = await issueInitialPair();

      await service.refresh(oldRefreshToken);

      expect(redis.del).toHaveBeenCalledWith(`refresh:${oldRefreshToken}`);
      expect(await redis.get(`refresh:${oldRefreshToken}`)).toBeNull();
    });
  });

  describe('replay attack', () => {
    it('rejects reuse of a refresh token that was already rotated', async () => {
      const oldRefreshToken = await issueInitialPair();

      await service.refresh(oldRefreshToken);

      await expect(service.refresh(oldRefreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown or expired refresh token', async () => {
      await expect(service.refresh('never-issued-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
