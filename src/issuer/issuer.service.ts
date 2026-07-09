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

  /**
   * Register a new credential issuer both on-chain (IssuerRegistry contract) and
   * in the local database.
   *
   * @param stellarAddress - The issuer's Stellar public key (G-address).
   * @param name           - Human-readable display name for the issuer.
   * @param description    - Optional description of the issuer's purpose.
   * @returns The newly created {@link Issuer} database record.
   * @throws ConflictException if the address is already registered as an issuer.
   */
  async register(stellarAddress: string, name: string, description: string): Promise<Issuer> {
    const existing = await this.issuerRepo.findOne({ where: { stellarAddress } });
    if (existing) throw new ConflictException('Issuer already registered');

    // Register on-chain
    await this.stellar.addIssuer(stellarAddress, name, description);

    const issuer = this.issuerRepo.create({ stellarAddress, name, description });
    return this.issuerRepo.save(issuer);
  }

  /**
   * Define a new credential type schema under the given issuer.
   *
   * @param issuerAddress - Stellar address of the issuer adding the credential type.
   * @param typeId        - Unique identifier string for this credential type.
   * @param name          - Human-readable name of the credential type.
   * @param description   - Optional description of what this credential type represents.
   * @param schemaJson    - JSON schema object describing the credential's data structure.
   * @param requiresZk    - Whether ZK proof generation is required for this type.
   * @returns The newly created {@link CredentialType} record.
   * @throws NotFoundException if the issuerAddress is not a registered issuer.
   */
  async addCredentialType(
    issuerAddress: string,
    typeId: string,
    name: string,
    description: string,
    schemaJson: object,
    requiresZk: boolean,
  ): Promise<CredentialType> {
    const issuer = await this.findByAddress(issuerAddress);
    const ct = this.credTypeRepo.create({ typeId, name, description, schemaJson, requiresZk, issuer });
    return this.credTypeRepo.save(ct);
  }

  /**
   * Issue a credential to a user: persists the payload off-chain and registers
   * the credential hash on the IssuerRegistry Soroban contract.
   *
   * @param issuerAddress    - Stellar address of the issuing party.
   * @param userAddress      - Stellar address of the credential recipient.
   * @param credentialType   - Credential type identifier string.
   * @param payload          - Arbitrary credential data object to be stored off-chain.
   * @param expiresAt        - Optional expiry date for the credential.
   * @returns The saved {@link Credential} database record.
   * @throws NotFoundException if the issuerAddress is not a registered issuer.
   */
  async issueCredential(
    issuerAddress: string,
    userAddress: string,
    credentialType: string,
    payload: object,
    expiresAt?: Date,
  ): Promise<Credential> {
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

  /**
   * Look up a registered issuer by their Stellar address.
   *
   * @param stellarAddress - The Stellar public key to look up.
   * @returns The matching {@link Issuer} record.
   * @throws NotFoundException if no issuer with the given address exists.
   */
  async findByAddress(stellarAddress: string): Promise<Issuer> {
    const issuer = await this.issuerRepo.findOne({ where: { stellarAddress } });
    if (!issuer) throw new NotFoundException('Issuer not found');
    return issuer;
  }

  /**
   * Retrieve all registered issuers from the database.
   *
   * @returns An array of all {@link Issuer} records.
   */
  findAll(): Promise<Issuer[]> {
    return this.issuerRepo.find();
  }
}
