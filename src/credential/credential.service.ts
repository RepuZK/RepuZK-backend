import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { Credential } from '../common/database/entities/credential.entity';
import { PaginatedResult } from '../common/dto/pagination-query.dto';
import { encryptCredentialPayload } from './credential-encryption';

type CredentialWithExpiry = Credential & { isExpired: boolean };

@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);

  constructor(
    @InjectRepository(Credential) private readonly credRepo: Repository<Credential>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Retrieve credentials issued to the given wallet address, paginated.
   *
   * Each returned item carries a live-computed `isExpired` flag (true if
   * `expiresAt` has passed, regardless of whether the daily cleanup cron has
   * caught up to it yet).
   *
   * @param userAddress - The Stellar public key of the credential holder.
   * @param active      - When true, excludes credentials already marked expired.
   * @param page        - 1-indexed page number.
   * @param limit       - Page size (max 100).
   * @returns A page of {@link Credential} records with their issuer relation loaded.
   */
  async findByUser(
    userAddress: string,
    active = false,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<CredentialWithExpiry>> {
    const where = active ? { userAddress, isExpired: false } : { userAddress };
    const [rows, total] = await this.credRepo.findAndCount({
      where,
      relations: ['issuer'],
      skip: (page - 1) * limit,
      take: limit,
    });

    const now = new Date();
    const data = rows.map((c) => ({
      ...c,
      isExpired: c.isExpired || (c.expiresAt ? c.expiresAt < now : false),
    }));

    return { data, total, page, limit };
  }

  /**
   * Daily maintenance job: flags credentials whose `expiresAt` has passed as
   * `isExpired = true` so DB-level filtering (`?active=true`) stays cheap and
   * doesn't need to recompute expiry on every read.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markExpiredCredentials(): Promise<void> {
    const result = await this.credRepo.update(
      { expiresAt: LessThan(new Date()), isExpired: false },
      { isExpired: true },
    );
    if (result.affected) {
      this.logger.log(`Marked ${result.affected} credential(s) as expired`);
    }
  }

  /**
   * Fetch a single credential by its database UUID.
   *
   * @param id - UUID of the credential record.
   * @returns The matching {@link Credential} with its issuer relation populated.
   * @throws NotFoundException if no credential with the given ID exists.
   */
  async findById(id: string): Promise<Credential> {
    const c = await this.credRepo.findOne({ where: { id }, relations: ['issuer'] });
    if (!c) throw new NotFoundException('Credential not found');
    return c;
  }

  /**
   * Encrypt the credential's payload JSON (AES-256-GCM, key derived from
   * `CREDENTIAL_ENCRYPTION_KEY` + the credential ID) and pin the ciphertext
   * to IPFS via Pinata, storing the resulting CID back on the credential
   * record.
   *
   * IPFS is a public, content-addressed store — anyone who obtains the CID
   * can fetch whatever was pinned there. Encrypting before pinning means the
   * raw credential data (success rates, job counts, etc.) isn't readable by
   * anyone who only has the CID; decryption requires the server's master
   * key, matching the project's privacy-preserving design intent.
   *
   * @param credentialId - UUID of the credential whose payload should be pinned.
   * @returns An object containing the IPFS content identifier (`cid`).
   * @throws NotFoundException if the credential does not exist.
   */
  async uploadToIpfs(credentialId: string): Promise<{ cid: string }> {
    const credential = await this.findById(credentialId);

    const apiKey = this.config.get('IPFS_API_KEY');
    const apiSecret = this.config.get('IPFS_API_SECRET');
    const apiUrl = this.config.get('IPFS_API_URL', 'https://api.pinata.cloud');
    const encryptionKey = this.config.get<string>('CREDENTIAL_ENCRYPTION_KEY');

    const encrypted = encryptCredentialPayload(
      encryptionKey,
      credentialId,
      JSON.stringify(credential.payloadJson),
    );

    const { data } = await axios.post(
      `${apiUrl}/pinning/pinJSONToIPFS`,
      { pinataContent: encrypted, pinataMetadata: { name: credentialId } },
      { headers: { pinata_api_key: apiKey, pinata_secret_api_key: apiSecret } },
    );

    await this.credRepo.update(credentialId, { ipfsCid: data.IpfsHash });
    return { cid: data.IpfsHash };
  }
}
