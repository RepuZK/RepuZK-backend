import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { Proof } from '../common/database/entities/proof.entity';
import { Credential } from '../common/database/entities/credential.entity';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';

@Injectable()
export class ProofService {
  constructor(
    @InjectRepository(Proof) private readonly proofRepo: Repository<Proof>,
    @InjectRepository(Credential) private readonly credRepo: Repository<Credential>,
    @InjectQueue('proof-generation') private readonly proofQueue: Queue,
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
   * Mark a proof as revoked (sets `isActive = false`) in the database.
   *
   * @param proofHash - The hex proof hash of the proof to revoke.
   */
  async revokeProof(proofHash: string): Promise<void> {
    await this.proofRepo.update({ proofHash }, { isActive: false });
  }

  /**
   * List all proof records associated with a given wallet address.
   *
   * @param userAddress - The Stellar public key of the proof owner.
   * @returns An array of {@link Proof} records belonging to the user.
   */
  findByUser(userAddress: string): Promise<Proof[]> {
    return this.proofRepo.find({ where: { userAddress } });
  }
}
