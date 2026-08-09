import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { scValToNative, SorobanRpc } from '@stellar/stellar-sdk';
import { Proof } from '../common/database/entities/proof.entity';
import { StellarService } from '../stellar/stellar.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';

const LAST_LEDGER_REDIS_KEY = 'indexer:proof:last_ledger';

/**
 * Keeps the local `proofs` table in sync with `register_proof` calls made
 * directly against the ReputationRegistry contract — e.g. by another client,
 * or a user interacting with Soroban outside this backend's own generation
 * pipeline. Without this, the DB silently drifts from on-chain truth.
 */
@Injectable()
export class ProofIndexerService {
  private readonly logger = new Logger(ProofIndexerService.name);
  private running = false;

  constructor(
    private readonly stellar: StellarService,
    private readonly config: ConfigService,
    @InjectRepository(Proof) private readonly proofRepo: Repository<Proof>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Cron('*/30 * * * * *')
  async syncProofEvents(): Promise<void> {
    // A slow RPC round-trip could otherwise overlap with the next tick.
    if (this.running) return;
    this.running = true;

    try {
      const startLedger = await this.getStartLedger();
      const { events, latestLedger } = await this.stellar.getProofRegistrationEvents(startLedger);

      for (const event of events) {
        await this.syncEvent(event);
      }

      if (latestLedger) {
        await this.redis.set(LAST_LEDGER_REDIS_KEY, String(latestLedger + 1));
      }

      if (events.length) {
        this.logger.log(`Synced ${events.length} proof registration event(s) up to ledger ${latestLedger}`);
      }
    } catch (err) {
      this.logger.error('Proof event sync failed', err);
    } finally {
      this.running = false;
    }
  }

  private async getStartLedger(): Promise<number> {
    const cached = await this.redis.get(LAST_LEDGER_REDIS_KEY);
    if (cached) return parseInt(cached, 10);

    const configured = this.config.get('PROOF_INDEXER_START_LEDGER');
    if (configured) return parseInt(configured, 10);

    // No cursor yet: start from the current tip rather than replaying all
    // history, which Soroban RPC nodes typically don't retain anyway.
    return this.stellar.getLatestLedgerSequence();
  }

  private async syncEvent(event: SorobanRpc.Api.EventResponse): Promise<void> {
    const [owner, issuer, proofHashRaw, credentialType] = scValToNative(event.value) as [
      string,
      string,
      Buffer,
      string,
      bigint,
    ];
    const proofHash = Buffer.from(proofHashRaw).toString('hex');

    const existing = await this.proofRepo.findOne({ where: { proofHash } });
    if (existing) return; // already known — either generated locally or indexed before

    await this.proofRepo.save(
      this.proofRepo.create({
        userAddress: owner,
        issuerAddress: issuer,
        proofHash,
        stellarTxHash: event.txHash,
        isActive: true,
        syncedFromChain: true,
      }),
    );
    this.logger.log(`Indexed on-chain-only proof ${proofHash} (${credentialType}) for ${owner}`);
  }
}
