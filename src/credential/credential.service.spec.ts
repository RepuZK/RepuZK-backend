import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { CredentialService } from './credential.service';
import { Credential } from '../common/database/entities/credential.entity';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CredentialService', () => {
  let service: CredentialService;
  let credRepo: { findAndCount: jest.Mock; update: jest.Mock; findOne: jest.Mock };
  const encryptionKey = randomBytes(32).toString('hex');

  const ISSUER = { stellarAddress: 'GISSUER' };

  beforeEach(async () => {
    credRepo = { findAndCount: jest.fn(), update: jest.fn(), findOne: jest.fn() };
    mockedAxios.post.mockReset();

    const config: Record<string, string> = {
      IPFS_API_KEY: 'key',
      IPFS_API_SECRET: 'secret',
      IPFS_API_URL: 'https://api.pinata.cloud',
      CREDENTIAL_ENCRYPTION_KEY: encryptionKey,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialService,
        { provide: getRepositoryToken(Credential), useValue: credRepo },
        { provide: ConfigService, useValue: { get: (k: string, fallback?: string) => config[k] ?? fallback } },
      ],
    }).compile();

    service = module.get(CredentialService);
  });

  describe('findByUser', () => {
    it('paginates and marks past-due credentials as expired even before the cron catches up', async () => {
      const past = { id: 'c1', userAddress: 'GUSER', expiresAt: new Date('2020-01-01'), isExpired: false, issuer: ISSUER };
      const future = { id: 'c2', userAddress: 'GUSER', expiresAt: new Date('2099-01-01'), isExpired: false, issuer: ISSUER };
      const noExpiry = { id: 'c3', userAddress: 'GUSER', expiresAt: null, isExpired: false, issuer: ISSUER };
      credRepo.findAndCount.mockResolvedValue([[past, future, noExpiry], 3]);

      const result = await service.findByUser('GUSER');

      expect(credRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userAddress: 'GUSER' }, skip: 0, take: 20 }),
      );
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data.find((c) => c.id === 'c1').isExpired).toBe(true);
      expect(result.data.find((c) => c.id === 'c2').isExpired).toBe(false);
      expect(result.data.find((c) => c.id === 'c3').isExpired).toBe(false);
    });

    it('filters to isExpired: false at the DB level when active=true', async () => {
      credRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findByUser('GUSER', true, 2, 10);

      expect(credRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userAddress: 'GUSER', isExpired: false },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('respects page/limit for the skip/take offsets', async () => {
      credRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findByUser('GUSER', false, 3, 5);

      expect(credRepo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 5 }));
    });
  });

  describe('markExpiredCredentials', () => {
    it('flags rows whose expiry has passed and are not already marked', async () => {
      credRepo.update.mockResolvedValue({ affected: 4 });

      await service.markExpiredCredentials();

      expect(credRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ isExpired: false, expiresAt: expect.anything() }),
        { isExpired: true },
      );
    });

    it('does not throw when nothing was affected', async () => {
      credRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.markExpiredCredentials()).resolves.not.toThrow();
    });
  });

  describe('uploadToIpfs', () => {
    it('pins encrypted ciphertext, never the raw payload, and stores the returned CID', async () => {
      const credential = {
        id: 'cred-1',
        payloadJson: { success_rate: 98, jobs: 250 },
        issuer: ISSUER,
      };
      credRepo.findOne.mockResolvedValue(credential);
      mockedAxios.post.mockResolvedValue({ data: { IpfsHash: 'Qm123' } });

      const result = await service.uploadToIpfs('cred-1');

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [, body] = mockedAxios.post.mock.calls[0] as [
        string,
        { pinataContent: Record<string, string> },
      ];
      const pinned = JSON.stringify(body.pinataContent);

      // The plaintext claim value must never appear in what's sent to Pinata.
      expect(pinned).not.toContain('98');
      expect(pinned).not.toContain('success_rate');
      // What is sent must be the {iv, ciphertext, authTag} shape.
      expect(body.pinataContent).toEqual(
        expect.objectContaining({
          iv: expect.any(String),
          ciphertext: expect.any(String),
          authTag: expect.any(String),
        }),
      );

      expect(credRepo.update).toHaveBeenCalledWith('cred-1', { ipfsCid: 'Qm123' });
      expect(result).toEqual({ cid: 'Qm123' });
    });
  });
});
