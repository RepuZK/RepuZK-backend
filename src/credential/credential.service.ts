import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Credential } from '../common/database/entities/credential.entity';

@Injectable()
export class CredentialService {
  constructor(
    @InjectRepository(Credential) private readonly credRepo: Repository<Credential>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Retrieve all credentials issued to the given wallet address.
   *
   * @param userAddress - The Stellar public key of the credential holder.
   * @returns An array of {@link Credential} records with their associated issuer loaded.
   */
  findByUser(userAddress: string): Promise<Credential[]> {
    return this.credRepo.find({ where: { userAddress }, relations: ['issuer'] });
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
   * Pin the credential's payload JSON to IPFS via Pinata and store the resulting CID
   * back on the credential record.
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

    const { data } = await axios.post(
      `${apiUrl}/pinning/pinJSONToIPFS`,
      { pinataContent: credential.payloadJson, pinataMetadata: { name: credentialId } },
      { headers: { pinata_api_key: apiKey, pinata_secret_api_key: apiSecret } },
    );

    await this.credRepo.update(credentialId, { ipfsCid: data.IpfsHash });
    return { cid: data.IpfsHash };
  }
}
