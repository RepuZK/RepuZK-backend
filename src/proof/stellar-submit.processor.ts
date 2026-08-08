import { Processor, Process } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { StellarService } from '../stellar/stellar.service';
import { ProofService } from './proof.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';

/** Redis key used to record that a proof_hash has already been submitted on-chain. */
const dedupKey = (proofHash: string) => `stellar-submit:dedup:${proofHash}`;

/**
 * Processes jobs from the "stellar-submit" Bull queue.
 *
 * Responsibilities:
 *  1. De-duplicate: skip jobs whose proof_hash was already confirmed on-chain.
 *  2. Persist the proof record in the DB (idempotent – tolerates duplicate key).
 *  3. Call StellarService.registerProof() → build → sign → submit → confirm.
 *  4. Store the resulting tx hash and mark the dedup key in Redis.
 *
 * Retry policy (attempts: 3, exponential backoff) is configured at queue
 * registration in ProofModule. Re-throwing any error here causes Bull to retry
 * automatically up to the configured limit.
 */
@Processor('stellar-submit')
export class StellarSubmitProcessor {
  private readonly logger = new Logger(StellarSubmitProcessor.name);

  constructor(
    private readonly stellar: StellarService,
    private readonly proofService: ProofService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Process('submit')
  async handleSubmit(job: Job): Promise<void> {
    const {
      jobId: proofJobId,
      userAddress,
      issuerAddress,
      proofHash,
      credentialHash,
      credentialType,
      expiresAt,
      metadataUri,
      credentialId,
      proof,
      publicSignals,
      circuitName,
    } = job.data;

    /** Maximum attempts configured on the queue (default: 3). */
    const maxAttempts: number = (job.opts as any)?.attempts ?? 3;
    /** True when this is the final attempt – no more retries will follow. */
    const isFinalAttempt = job.attemptsMade >= maxAttempts - 1;

    this.logger.log(
      `[job ${job.id}] stellar-submit received for proof ${proofHash} (attempt ${job.attemptsMade + 1}/${maxAttempts})`,
    );

    // ── 1. De-duplication ────────────────────────────────────────────────────
    const alreadySubmitted = await this.redis.get(dedupKey(proofHash));
    if (alreadySubmitted) {
      this.logger.warn(
        `[job ${job.id}] Proof ${proofHash} already submitted (tx: ${alreadySubmitted}). Skipping.`,
      );
      // Update status to complete so the polling endpoint reflects the real state
      if (proofJobId) {
        await this.setStatus(proofJobId, { status: 'complete', proofHash });
      }
      return; // Acknowledge the job without doing any work
    }

    // ── 2. Persist proof record (idempotent) ─────────────────────────────────
    try {
      await this.proofService.registerProofOnChain({
        proofHash,
        credentialHash,
        credentialType,
        expiresAt,
        metadataUri,
        userAddress,
        issuerAddress,
        credentialId,
        proofJson: proof,
        publicSignalsJson: publicSignals,
        circuitName,
      });
    } catch (persistErr: any) {
      // Unique-key violation means the record already exists – safe to continue
      if (persistErr?.code === '23505' || persistErr?.message?.includes('duplicate key')) {
        this.logger.warn(
          `[job ${job.id}] Proof record for ${proofHash} already persisted. Continuing to on-chain step.`,
        );
      } else {
        this.logger.error(`[job ${job.id}] Failed to persist proof record`, persistErr);
        if (isFinalAttempt && proofJobId) {
          await this.setStatus(proofJobId, {
            status: 'failed',
            error: persistErr?.message ?? 'Failed to persist proof record',
          });
        }
        throw persistErr; // Trigger Bull retry
      }
    }

    // ── 3. Build → sign → submit → confirm (via StellarService) ─────────────
    let txHash: string;
    try {
      txHash = await this.stellar.registerProof(
        userAddress,
        issuerAddress,
        Buffer.from(proofHash, 'hex'),
        Buffer.from(credentialHash, 'hex'),
        credentialType,
        expiresAt,
        metadataUri,
      );
    } catch (stellarErr: any) {
      this.logger.error(
        `[job ${job.id}] Stellar submission failed for proof ${proofHash} (attempt ${job.attemptsMade + 1}/${maxAttempts})`,
        stellarErr,
      );
      // On the final attempt, mark the proof job as failed in Redis so the
      // status endpoint stops returning "pending" / "complete" and surfaces the error.
      if (isFinalAttempt && proofJobId) {
        await this.setStatus(proofJobId, {
          status: 'failed',
          error: stellarErr?.message ?? 'Stellar submission failed after maximum retries',
        });
      }
      throw stellarErr; // Bull will retry with exponential backoff
    }

    // ── 4. Persist tx hash + mark dedup ─────────────────────────────────────
    await this.proofService.updateStellarTxHash(proofHash, txHash);

    // Keep dedup key for 7 days so we never re-submit even after a crash-restart
    await this.redis.setex(dedupKey(proofHash), 7 * 24 * 3600, txHash);

    // Update the proof job status so callers see the confirmed tx hash
    if (proofJobId) {
      await this.setStatus(proofJobId, { status: 'complete', proofHash, txHash });
    }

    this.logger.log(
      `[job ${job.id}] Proof ${proofHash} registered on-chain. txHash: ${txHash}`,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async setStatus(jobId: string | number, data: object): Promise<void> {
    await this.redis.setex(`proof:status:${jobId}`, 3600, JSON.stringify(data));
  }
}
