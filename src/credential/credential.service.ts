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

  findByUser(userAddress: string) {
    return this.credRepo.find({ where: { userAddress }, relations: ['issuer'] });
  }

  async findById(id: string) {
    const c = await this.credRepo.findOne({ where: { id }, relations: ['issuer'] });
    if (!c) throw new NotFoundException('Credential not found');
    return c;
  }

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
