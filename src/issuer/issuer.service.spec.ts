import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { IssuerService } from './issuer.service';
import { Issuer } from '../common/database/entities/issuer.entity';
import { CredentialType } from '../common/database/entities/credential-type.entity';
import { Credential } from '../common/database/entities/credential.entity';
import { StellarService } from '../stellar/stellar.service';

describe('IssuerService', () => {
  let service: IssuerService;
  let issuerRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; findAndCount: jest.Mock };
  let credTypeRepo: { create: jest.Mock; save: jest.Mock };
  let credRepo: { create: jest.Mock; save: jest.Mock };
  let stellar: { addIssuer: jest.Mock; issueCredential: jest.Mock };

  beforeEach(async () => {
    issuerRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'issuer-db-id', ...x })),
      findAndCount: jest.fn(),
    };
    credTypeRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    credRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ id: 'cred-1', ...x })) };
    stellar = { addIssuer: jest.fn(), issueCredential: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuerService,
        { provide: getRepositoryToken(Issuer), useValue: issuerRepo },
        { provide: getRepositoryToken(CredentialType), useValue: credTypeRepo },
        { provide: getRepositoryToken(Credential), useValue: credRepo },
        { provide: StellarService, useValue: stellar },
      ],
    }).compile();

    service = module.get(IssuerService);
  });

  describe('register', () => {
    it('registers on-chain then persists, when the address is not already an issuer', async () => {
      issuerRepo.findOne.mockResolvedValue(null);

      const result = await service.register('GISSUER', 'Acme', 'desc');

      expect(stellar.addIssuer).toHaveBeenCalledWith('GISSUER', 'Acme', 'desc');
      expect(issuerRepo.save).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ stellarAddress: 'GISSUER', name: 'Acme' }));
    });

    it('rejects a duplicate registration without touching the chain', async () => {
      issuerRepo.findOne.mockResolvedValue({ stellarAddress: 'GISSUER' });

      await expect(service.register('GISSUER', 'Acme', 'desc')).rejects.toThrow(ConflictException);
      expect(stellar.addIssuer).not.toHaveBeenCalled();
    });
  });

  describe('addCredentialType', () => {
    it('attaches the new credential type to the looked-up issuer', async () => {
      const issuer = { stellarAddress: 'GISSUER' };
      issuerRepo.findOne.mockResolvedValue(issuer);

      const result = await service.addCredentialType(
        'GISSUER',
        'jobs_completed',
        'Jobs Completed',
        'desc',
        { type: 'object' },
        false,
      );

      expect(credTypeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ typeId: 'jobs_completed', issuer }),
      );
      expect(result).toEqual(expect.objectContaining({ typeId: 'jobs_completed' }));
    });

    it('throws NotFoundException when the issuer does not exist', async () => {
      issuerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addCredentialType('GUNKNOWN', 'x', 'X', '', {}, false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('issueCredential', () => {
    it('hashes the payload consistently and registers the same hash on-chain', async () => {
      const issuer = { stellarAddress: 'GISSUER' };
      issuerRepo.findOne.mockResolvedValue(issuer);
      const payload = { success_rate: 98 };
      const expectedHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

      await service.issueCredential('GISSUER', 'GUSER', 'success_rate', payload);

      expect(credRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ payloadHash: expectedHash, userAddress: 'GUSER' }),
      );
      expect(stellar.issueCredential).toHaveBeenCalledWith(
        'GISSUER',
        'GUSER',
        'success_rate',
        Buffer.from(expectedHash, 'hex'),
        0,
      );
    });

    it('converts a JS expiresAt Date into a Unix-seconds timestamp for the chain call', async () => {
      issuerRepo.findOne.mockResolvedValue({ stellarAddress: 'GISSUER' });
      const expiresAt = new Date('2030-01-01T00:00:00.000Z');

      await service.issueCredential('GISSUER', 'GUSER', 'success_rate', { x: 1 }, expiresAt);

      const expectedTimestamp = Math.floor(expiresAt.getTime() / 1000);
      expect(stellar.issueCredential).toHaveBeenCalledWith(
        'GISSUER',
        'GUSER',
        'success_rate',
        expect.any(Buffer),
        expectedTimestamp,
      );
    });
  });

  describe('findByAddress', () => {
    it('throws NotFoundException for an unregistered address', async () => {
      issuerRepo.findOne.mockResolvedValue(null);
      await expect(service.findByAddress('GUNKNOWN')).rejects.toThrow(NotFoundException);
    });

    it('returns the matching issuer record', async () => {
      const issuer = { stellarAddress: 'GISSUER' };
      issuerRepo.findOne.mockResolvedValue(issuer);
      await expect(service.findByAddress('GISSUER')).resolves.toBe(issuer);
    });
  });

  describe('findAll', () => {
    it('applies page/limit as skip/take and returns pagination metadata', async () => {
      issuerRepo.findAndCount.mockResolvedValue([[{ stellarAddress: 'G1' }], 1]);

      const result = await service.findAll(2, 5);

      expect(issuerRepo.findAndCount).toHaveBeenCalledWith({ skip: 5, take: 5 });
      expect(result).toEqual({ data: [{ stellarAddress: 'G1' }], total: 1, page: 2, limit: 5 });
    });
  });
});
