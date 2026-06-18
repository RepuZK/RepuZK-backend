import { Processor, Process } from '@nestjs/bull';
import { InjectQueue } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { createHash } from 'crypto';
import * as path from 'path';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';

// snarkjs is a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const snarkjs = require('snarkjs');

@Processor('proof-generation')
export class ProofGenerationProcessor {
  private readonly logger = new Logger(ProofGenerationProcessor.name);

  constructor(
    @InjectQueue('stellar-submit') private readonly stellarQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Process('generate')
  async handleGenerate(job: Job) {
    const { credentialId, circuitName, privateInputs, userAddress, issuerAddress, credentialType, payloadHash } = job.data;

    try {
      await this.setStatus(job.id, { status: 'processing' });

      const circuitsDir = path.join(__dirname, 'circuits');
      const wasmPath = path.join(circuitsDir, `${circuitName}.wasm`);
      const zkeyPath = path.join(circuitsDir, `${circuitName}.zkey`);

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        privateInputs,
        wasmPath,
        zkeyPath,
      );

      const proofHash = createHash('sha256').update(JSON.stringify(proof)).digest('hex');

      // Enqueue on-chain submission
      await this.stellarQueue.add('submit', {
        jobId: job.id,
        userAddress,
        issuerAddress,
        proofHash,
        credentialHash: payloadHash,
        credentialType,
        expiresAt: 0,
        metadataUri: '',
        credentialId,
        proof,
        publicSignals,
        circuitName,
      });

      await this.setStatus(job.id, { status: 'complete', proofHash });
      this.logger.log(`Proof generated for job ${job.id}: ${proofHash}`);
    } catch (err) {
      this.logger.error(`Proof generation failed for job ${job.id}`, err);
      await this.setStatus(job.id, { status: 'failed', error: err.message });
    }
  }

  private async setStatus(jobId: string | number, data: object) {
    await this.redis.setex(`proof:status:${jobId}`, 3600, JSON.stringify(data));
  }
}
