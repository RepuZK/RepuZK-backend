import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { createHash } from 'crypto';
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

  async generateProof(credentialId: string, circuitName: string, privateInputs: object) {
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

    await this.redis.setex(`proof:status:${job.id}`, 3600, JSON.stringify({ status: 'pending' }));
    return { jobId: job.id };
  }

  async getStatus(jobId: string) {
    const raw = await this.redis.get(`proof:status:${jobId}`);
    return raw ? JSON.parse(raw) : { status: 'not_found' };
  }

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
  }) {
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

  async updateStellarTxHash(proofHash: string, txHash: string) {
    await this.proofRepo.update({ proofHash }, { stellarTxHash: txHash });
  }

  async revokeProof(proofHash: string) {
    await this.proofRepo.update({ proofHash }, { isActive: false });
  }

  findByUser(userAddress: string) {
    return this.proofRepo.find({ where: { userAddress } });
  }
}
