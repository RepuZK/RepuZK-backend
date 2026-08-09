import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ProofIndexerService } from './proof-indexer.service';
import { Proof } from '../common/database/entities/proof.entity';
import { StellarService } from '../stellar/stellar.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';

jest.mock('@stellar/stellar-sdk', () => ({
  ...jest.requireActual('@stellar/stellar-sdk'),
  scValToNative: jest.fn(),
}));

import { scValToNative } from '@stellar/stellar-sdk';

describe('ProofIndexerService', () => {
  let service: ProofIndexerService;
  let proofRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let stellar: { getProofRegistrationEvents: jest.Mock; getLatestLedgerSequence: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock };

  const EVENT = { txHash: 'TX123', value: {} as any };

  beforeEach(async () => {
    proofRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => Promise.resolve(x)),
    };
    stellar = {
      getProofRegistrationEvents: jest.fn(),
      getLatestLedgerSequence: jest.fn().mockResolvedValue(1000),
    };
    redis = { get: jest.fn(), set: jest.fn() };
    (scValToNative as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProofIndexerService,
        { provide: getRepositoryToken(Proof), useValue: proofRepo },
        { provide: StellarService, useValue: stellar },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(ProofIndexerService);
  });

  it('starts from the cached Redis cursor when one exists', async () => {
    redis.get.mockResolvedValue('555');
    stellar.getProofRegistrationEvents.mockResolvedValue({ events: [], latestLedger: 600 });

    await service.syncProofEvents();

    expect(stellar.getProofRegistrationEvents).toHaveBeenCalledWith(555);
    expect(stellar.getLatestLedgerSequence).not.toHaveBeenCalled();
  });

  it('falls back to the chain tip when no cursor is cached', async () => {
    redis.get.mockResolvedValue(null);
    stellar.getProofRegistrationEvents.mockResolvedValue({ events: [], latestLedger: 1000 });

    await service.syncProofEvents();

    expect(stellar.getLatestLedgerSequence).toHaveBeenCalled();
    expect(stellar.getProofRegistrationEvents).toHaveBeenCalledWith(1000);
  });

  it('inserts a new row for a proof registered directly on-chain', async () => {
    redis.get.mockResolvedValue('100');
    proofRepo.findOne.mockResolvedValue(null);
    stellar.getProofRegistrationEvents.mockResolvedValue({ events: [EVENT], latestLedger: 105 });
    (scValToNative as jest.Mock).mockReturnValue([
      'GOWNER',
      'GISSUER',
      Buffer.from('ab'.repeat(32), 'hex'),
      'success_rate',
      1234n,
    ]);

    await service.syncProofEvents();

    expect(proofRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userAddress: 'GOWNER',
        issuerAddress: 'GISSUER',
        proofHash: 'ab'.repeat(32),
        stellarTxHash: 'TX123',
        syncedFromChain: true,
        isActive: true,
      }),
    );
    expect(redis.set).toHaveBeenCalledWith('indexer:proof:last_ledger', '106');
  });

  it('is idempotent: skips a proof hash already present in the DB', async () => {
    redis.get.mockResolvedValue('100');
    proofRepo.findOne.mockResolvedValue({ id: 'existing-row' });
    stellar.getProofRegistrationEvents.mockResolvedValue({ events: [EVENT], latestLedger: 105 });
    (scValToNative as jest.Mock).mockReturnValue([
      'GOWNER',
      'GISSUER',
      Buffer.from('cd'.repeat(32), 'hex'),
      'success_rate',
      1234n,
    ]);

    await service.syncProofEvents();

    expect(proofRepo.save).not.toHaveBeenCalled();
  });

  it('does not update the cursor and swallows the error when the RPC call fails', async () => {
    redis.get.mockResolvedValue('100');
    stellar.getProofRegistrationEvents.mockRejectedValue(new Error('RPC unavailable'));

    await expect(service.syncProofEvents()).resolves.not.toThrow();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
