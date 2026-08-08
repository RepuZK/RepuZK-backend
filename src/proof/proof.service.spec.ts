import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { NotFoundException } from '@nestjs/common';
import { ProofService } from './proof.service';
import { Proof } from '../common/database/entities/proof.entity';
import { Credential } from '../common/database/entities/credential.entity';
import { StellarService } from '../stellar/stellar.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';

describe('ProofService', () => {
  let service: ProofService;
  let credRepo: { findOne: jest.Mock };
  let proofQueue: { add: jest.Mock };
  let redis: { setex: jest.Mock; get: jest.Mock };
  let stellar: { revokeProof: jest.Mock };

  const CREDENTIAL = {
    id: 'cred-1',
    userAddress: 'GUSERADDRESS',
    credentialType: 'kyc',
    payloadHash: 'hash123',
    issuer: { stellarAddress: 'GISSUERADDRESS' },
  };

  beforeEach(async () => {
    credRepo = { findOne: jest.fn() };
    proofQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    redis = { setex: jest.fn().mockResolvedValue('OK'), get: jest.fn() };
    stellar = { revokeProof: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProofService,
        { provide: getRepositoryToken(Proof), useValue: {} },
        { provide: getRepositoryToken(Credential), useValue: credRepo },
        { provide: getQueueToken('proof-generation'), useValue: proofQueue },
        { provide: StellarService, useValue: stellar },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(ProofService);
  });

  describe('generateProof', () => {
    it('throws NotFoundException when the credential does not exist', async () => {
      credRepo.findOne.mockResolvedValue(null);

      await expect(service.generateProof('missing', 'circuit', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(proofQueue.add).not.toHaveBeenCalled();
    });

    it('dispatches a job to the proof-generation queue, marks it queued, and returns the jobId', async () => {
      credRepo.findOne.mockResolvedValue(CREDENTIAL);

      const result = await service.generateProof('cred-1', 'success_rate_gt_95', { secret: 1 });

      expect(proofQueue.add).toHaveBeenCalledWith('generate', {
        credentialId: 'cred-1',
        circuitName: 'success_rate_gt_95',
        privateInputs: { secret: 1 },
        userAddress: CREDENTIAL.userAddress,
        issuerAddress: CREDENTIAL.issuer.stellarAddress,
        credentialType: CREDENTIAL.credentialType,
        payloadHash: CREDENTIAL.payloadHash,
      });
      expect(redis.setex).toHaveBeenCalledWith(
        'proof:status:job-1',
        3600,
        JSON.stringify({ status: 'queued' }),
      );
      expect(result).toEqual({ jobId: 'job-1' });
    });
  });

  describe('getStatus', () => {
    it('returns the parsed status from Redis when present', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ status: 'generating' }));

      const result = await service.getStatus('job-1');

      expect(redis.get).toHaveBeenCalledWith('proof:status:job-1');
      expect(result).toEqual({ status: 'generating' });
    });

    it('returns not_found when no status is stored for the job', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.getStatus('unknown-job');

      expect(result).toEqual({ status: 'not_found' });
    });
  });
});
