import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Issuer } from '../common/database/entities/issuer.entity';
import { CredentialType } from '../common/database/entities/credential-type.entity';
import { Credential } from '../common/database/entities/credential.entity';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class IssuerService {
  constructor(
    @InjectRepository(Issuer) private readonly issuerRepo: Repository<Issuer>,
    @InjectRepository(CredentialType) private readonly credTypeRepo: Repository<CredentialType>,
    @InjectRepository(Credential) private readonly credRepo: Repository<Credential>,
    private readonly stellar: StellarService,
  ) {}

  async register(stellarAddress: string, name: string, description: string) {
    const existing = await this.issuerRepo.findOne({ where: { stellarAddress } });
    if (existing) throw new ConflictException('Issuer already registered');

    // Register on-chain
    await this.stellar.addIssuer(stellarAddress, name, description);

    const issuer = this.issuerRepo.create({ stellarAddress, name, description });
    return this.issuerRepo.save(issuer);
  }

  async addCredentialType(
    issuerAddress: string,
    typeId: string,
    name: string,
    description: string,
    schemaJson: object,
    requiresZk: boolean,
  ) {
    const issuer = await this.findByAddress(issuerAddress);
    const ct = this.credTypeRepo.create({ typeId, name, description, schemaJson, requiresZk, issuer });
    return this.credTypeRepo.save(ct);
  }

  async issueCredential(
    issuerAddress: string,
    userAddress: string,
    credentialType: string,
    payload: object,
    expiresAt?: Date,
  ) {
    const issuer = await this.findByAddress(issuerAddress);
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const credential = this.credRepo.create({
      issuer,
      userAddress,
      credentialType,
      payloadJson: payload,
      payloadHash,
      expiresAt,
    });
    const saved = await this.credRepo.save(credential);

    // Register on-chain
    const hashBuffer = Buffer.from(payloadHash, 'hex');
    const expiresTimestamp = expiresAt ? Math.floor(expiresAt.getTime() / 1000) : 0;
    await this.stellar.issueCredential(issuerAddress, userAddress, credentialType, hashBuffer, expiresTimestamp);

    return saved;
  }

  async findByAddress(stellarAddress: string) {
    const issuer = await this.issuerRepo.findOne({ where: { stellarAddress } });
    if (!issuer) throw new NotFoundException('Issuer not found');
    return issuer;
  }

  findAll() {
    return this.issuerRepo.find();
  }
}
