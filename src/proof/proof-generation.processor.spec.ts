jest.mock('snarkjs', () => ({
  groth16: {
    fullProve: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { Job } from 'bull';
import { ProofGenerationProcessor } from './proof-generation.processor';
import { REDIS_CLIENT } from '../common/redis/redis.module';

const snarkjs = require('snarkjs');

describe('ProofGenerationProcessor', () => {
  let processor: ProofGenerationProcessor;
  let stellarQueue: { add: jest.Mock };
  let redis: { setex: jest.Mock };

  const jobData = {
    credentialId: 'cred-1',
    circuitName: 'success_rate_gt_95',
    privateInputs: { secret: 1 },
    userAddress: 'GUSERADDRESS',
    issuerAddress: 'GISSUERADDRESS',
    credentialType: 'kyc',
    payloadHash: 'hash123',
  };

  const makeJob = (): Job => ({ id: 'job-1', data: jobData }) as unknown as Job;

  beforeEach(async () => {
    stellarQueue = { add: jest.fn().mockResolvedValue(undefined) };
    redis = { setex: jest.fn().mockResolvedValue('OK') };
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProofGenerationProcessor,
        { provide: getQueueToken('stellar-submit'), useValue: stellarQueue },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    processor = module.get(ProofGenerationProcessor);
  });

  it('marks the job generating, then complete, and enqueues stellar-submit on success', async () => {
    (snarkjs.groth16.fullProve as jest.Mock).mockResolvedValue({
      proof: { pi_a: [], pi_b: [], pi_c: [] },
      publicSignals: ['1'],
    });

    await processor.handleGenerate(makeJob());

    const statuses = redis.setex.mock.calls.map(([, , value]) => JSON.parse(value).status);
    expect(statuses).toEqual(['generating', 'complete']);
    expect(stellarQueue.add).toHaveBeenCalledWith('submit', expect.objectContaining({
      jobId: 'job-1',
      userAddress: jobData.userAddress,
      credentialHash: jobData.payloadHash,
    }));
  });

  it('marks the job failed and does not enqueue stellar-submit when proof generation throws', async () => {
    (snarkjs.groth16.fullProve as jest.Mock).mockRejectedValue(new Error('circuit missing'));

    await processor.handleGenerate(makeJob());

    const statuses = redis.setex.mock.calls.map(([, , value]) => JSON.parse(value).status);
    expect(statuses).toEqual(['generating', 'failed']);
    expect(stellarQueue.add).not.toHaveBeenCalled();
  });
});
