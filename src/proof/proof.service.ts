import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { Proof } from '../common/database/entities/proof.entity';
import { Credential } from '../common/database/entities/credential.entity';
import { StellarService } from '../stellar/stellar.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import Redis from 'ioredis';

@Injectable()
export class ProofService {
  constructor(
    @InjectRepository(Proof) private readonly proofRepo: Repository<Proof>,
    @InjectRepository(Credential) private readonly credRepo: Repository<Credential>,
    @InjectQueue('proof-generation') private readonly proofQueue: Queue,
    private readonly stellar: StellarService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Queue an asynchronous ZK proof generation job for the given credential.
   * The job status is cached in Redis with a 1-hour TTL and can be polled
   * via {@link getStatus}.
   *
   * @param credentialId  - UUID of the credential to generate a proof for.
   * @param circuitName   - Name of the SnarkJS circuit to use (must have matching .wasm + .zkey).
   * @param privateInputs - Private witness inputs specific to the chosen circuit.
   * @returns An object with `jobId` that can be used to poll job status.
   * @throws NotFoundException if the credential does not exist.
   */
  async generateProof(
    credentialId: string,
    circuitName: string,
    privateInputs: object,
  ): Promise<{ jobId: string | number }> {
    const credential = await this.credRepo.findOne({ where: { id: credentialId }, relations: ['issuer'] });
    if (!credential) throw new NotFoundException('Credential not found');

    const job = await this.proofQueue.add('generate', {
      credentialId,
      circuitName,
      privateInputs,
      userAddress: credential.userAddress,
      issuerAddress: credential.issuer.stellarAddress,
      credentialType: credential.credentialType,
      payloadHash: credential.payloadHash,
    });

    await this.redis.setex(`proof:status:${job.id}`, 3600, JSON.stringify({ status: 'queued' }));
    return { jobId: job.id };
  }

  /**
   * Retrieve the current status of a proof generation job from Redis.
   *
   * @param jobId - The Bull job ID returned by {@link generateProof}.
   * @returns A status object (e.g. `{ status: 'queued' | 'complete' | 'failed', proofHash? }`)
   *          or `{ status: 'not_found' }` if the key has expired or never existed.
   */
  async getStatus(jobId: string): Promise<object> {
    const raw = await this.redis.get(`proof:status:${jobId}`);
    return raw ? JSON.parse(raw) : { status: 'not_found' };
  }

  /**
   * Persist a completed proof record to the database after on-chain registration.
   *
   * @param dto - Data transfer object containing all proof metadata:
   *   - `proofHash`        — hex-encoded keccak/SHA hash of the proof
   *   - `credentialHash`   — hex-encoded hash of the underlying credential
   *   - `credentialType`   — string identifier of the credential type
   *   - `expiresAt`        — Unix timestamp (seconds) for proof expiry, or 0 for never
   *   - `metadataUri`      — IPFS URI or other metadata pointer
   *   - `userAddress`      — Stellar address of the proof owner
   *   - `issuerAddress`    — Stellar address of the issuing party
   *   - `credentialId`     — (optional) UUID of the linked credential record
   *   - `proofJson`        — Raw Groth16 proof object from SnarkJS
   *   - `publicSignalsJson`— Public signals array from SnarkJS
   *   - `circuitName`      — Name of the circuit used for this proof
   * @returns The saved {@link Proof} database record.
   */
  async registerProofOnChain(dto: {
    proofHash: string;
    credentialHash: string;
    credentialType: string;
    expiresAt: number;
    metadataUri: string;
    userAddress: string;
    issuerAddress: string;
    credentialId?: string;
    proofJson: object;
    publicSignalsJson: object;
    circuitName: string;
  }): Promise<Proof> {
    const proof = this.proofRepo.create({
      userAddress: dto.userAddress,
      issuerAddress: dto.issuerAddress,
      credentialId: dto.credentialId,
      proofHash: dto.proofHash,
      proofJson: dto.proofJson,
      publicSignalsJson: dto.publicSignalsJson,
      circuitName: dto.circuitName,
      metadataUri: dto.metadataUri,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt * 1000) : null,
    });
    return this.proofRepo.save(proof);
  }

  /**
   * Update the Stellar transaction hash on an existing proof record after
   * on-chain submission completes.
   *
   * @param proofHash - The hex proof hash identifying the record to update.
   * @param txHash    - The Stellar transaction hash to store.
   */
  async updateStellarTxHash(proofHash: string, txHash: string): Promise<void> {
    await this.proofRepo.update({ proofHash }, { stellarTxHash: txHash });
  }

  /**
   * Revoke a proof on-chain via the ReputationRegistry contract, then mark it
   * inactive in the database. The DB update only happens after the Stellar
   * transaction is confirmed, ensuring both states stay in sync.
   *
   * @param proofHash   - The hex proof hash of the proof to revoke.
   * @param revokerAddress - Stellar address of the caller authorised to revoke.
   * @returns An object containing the confirmed Stellar transaction hash.
   * @throws NotFoundException if no proof with the given hash exists in the DB.
   */
  async revokeProof(proofHash: string, revokerAddress: string): Promise<{ txHash: string }> {
    const proof = await this.proofRepo.findOne({ where: { proofHash } });
    if (!proof) throw new NotFoundException(`Proof not found: ${proofHash}`);

    // Submit revocation on-chain; throws on failure (DB stays unchanged)
    const txHash = await this.stellar.revokeProof(
      Buffer.from(proofHash, 'hex'),
      revokerAddress,
    );

    // Only mark inactive after the Soroban tx is confirmed
    await this.proofRepo.update({ proofHash }, { isActive: false });

    return { txHash };
  }

  /**
   * List proof records associated with a given wallet address, paginated.
   *
   * @param userAddress - The Stellar public key of the proof owner.
   * @param page        - 1-indexed page number.
   * @param limit       - Page size (max 100).
   * @returns A page of {@link Proof} records belonging to the user.
   */
  async findByUser(userAddress: string, page = 1, limit = 20): Promise<PaginatedResult<Proof>> {
    const [data, total] = await this.proofRepo.findAndCount({
      where: { userAddress },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }
}
