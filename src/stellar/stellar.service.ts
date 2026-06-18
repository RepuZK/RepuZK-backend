import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
  BASE_FEE,
} from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly server: SorobanRpc.Server;
  private readonly adminKeypair: Keypair;
  private readonly network: string;
  private readonly networkPassphrase: string;

  private readonly issuerRegistryId: string;
  private readonly reputationRegistryId: string;
  private readonly marketplaceId: string;

  constructor(private readonly config: ConfigService) {
    this.network = config.get('STELLAR_NETWORK', 'testnet');
    this.networkPassphrase = this.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    this.server = new SorobanRpc.Server(
      this.network === 'mainnet'
        ? 'https://mainnet.sorobanrpc.com'
        : 'https://soroban-testnet.stellar.org',
    );
    this.adminKeypair = Keypair.fromSecret(config.get('STELLAR_ADMIN_SECRET'));
    this.issuerRegistryId = config.get('ISSUER_REGISTRY_CONTRACT');
    this.reputationRegistryId = config.get('REPUTATION_REGISTRY_CONTRACT');
    this.marketplaceId = config.get('MARKETPLACE_CONTRACT');
  }

  /** Build and submit a contract invocation, returning the tx hash */
  private async invoke(contractId: string, method: string, args: xdr.ScVal[]): Promise<string> {
    const account = await this.server.getAccount(this.adminKeypair.publicKey());
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(this.adminKeypair);
    const result = await this.server.sendTransaction(prepared);

    if (result.status === 'ERROR') throw new Error(`Stellar tx error: ${JSON.stringify(result)}`);

    // Poll for confirmation
    let getResult = await this.server.getTransaction(result.hash);
    let attempts = 0;
    while (getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 20) {
      await new Promise((r) => setTimeout(r, 1500));
      getResult = await this.server.getTransaction(result.hash);
      attempts++;
    }

    if (getResult.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`Transaction failed: ${getResult.status}`);
    }

    this.logger.log(`Tx ${result.hash} confirmed (${method})`);
    return result.hash;
  }

  /** Read-only simulation */
  private async simulate(contractId: string, method: string, args: xdr.ScVal[]): Promise<any> {
    const account = await this.server.getAccount(this.adminKeypair.publicKey());
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(sim)) throw new Error('Simulation failed');
    const retVal = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    return retVal ? scValToNative(retVal) : null;
  }

  // ── IssuerRegistry ────────────────────────────────────────────────────────

  async addIssuer(address: string, name: string, description: string): Promise<string> {
    return this.invoke(this.issuerRegistryId, 'add_issuer', [
      new Address(address).toScVal(),
      nativeToScVal(name, { type: 'string' }),
      nativeToScVal(description, { type: 'string' }),
    ]);
  }

  async isIssuer(address: string): Promise<boolean> {
    return this.simulate(this.issuerRegistryId, 'is_issuer', [new Address(address).toScVal()]);
  }

  async issueCredential(
    issuer: string,
    user: string,
    credentialId: string,
    hash: Buffer,
    expiresAt: number,
  ): Promise<string> {
    return this.invoke(this.issuerRegistryId, 'issue_credential', [
      new Address(issuer).toScVal(),
      new Address(user).toScVal(),
      nativeToScVal(credentialId, { type: 'string' }),
      nativeToScVal(hash, { type: 'bytes' }),
      nativeToScVal(expiresAt, { type: 'u64' }),
    ]);
  }

  // ── ReputationRegistry ────────────────────────────────────────────────────

  async registerProof(
    owner: string,
    issuer: string,
    proofHash: Buffer,
    credentialHash: Buffer,
    credentialType: string,
    expiresAt: number,
    metadataUri: string,
  ): Promise<string> {
    return this.invoke(this.reputationRegistryId, 'register_proof', [
      new Address(owner).toScVal(),
      new Address(issuer).toScVal(),
      nativeToScVal(proofHash, { type: 'bytes' }),
      nativeToScVal(credentialHash, { type: 'bytes' }),
      nativeToScVal(credentialType, { type: 'string' }),
      nativeToScVal(expiresAt, { type: 'u64' }),
      nativeToScVal(metadataUri, { type: 'string' }),
    ]);
  }

  async revokeProof(proofHash: Buffer, revoker: string): Promise<string> {
    return this.invoke(this.reputationRegistryId, 'revoke_proof', [
      nativeToScVal(proofHash, { type: 'bytes' }),
      new Address(revoker).toScVal(),
    ]);
  }

  async getScoreValue(user: string): Promise<number> {
    return this.simulate(this.reputationRegistryId, 'get_score_value', [
      new Address(user).toScVal(),
    ]);
  }

  async getReputationScore(user: string): Promise<any> {
    return this.simulate(this.reputationRegistryId, 'get_reputation_score', [
      new Address(user).toScVal(),
    ]);
  }

  async hasCredential(user: string, credentialType: string): Promise<boolean> {
    return this.simulate(this.reputationRegistryId, 'has_credential', [
      new Address(user).toScVal(),
      nativeToScVal(credentialType, { type: 'string' }),
    ]);
  }

  async verifyScoreThreshold(user: string, threshold: number): Promise<boolean> {
    return this.simulate(this.reputationRegistryId, 'verify_score_threshold', [
      new Address(user).toScVal(),
      nativeToScVal(threshold, { type: 'u32' }),
    ]);
  }

  async getUserBadges(user: string): Promise<string[]> {
    return this.simulate(this.reputationRegistryId, 'get_user_badges', [
      new Address(user).toScVal(),
    ]);
  }

  // ── Marketplace ───────────────────────────────────────────────────────────

  async createListing(
    provider: string,
    title: string,
    description: string,
    category: string,
    price: bigint,
    tokenAddress: string,
    minScore: number,
    requiredCreds: string[],
    deliveryDays: number,
  ): Promise<string> {
    return this.invoke(this.marketplaceId, 'create_listing', [
      new Address(provider).toScVal(),
      nativeToScVal(title, { type: 'string' }),
      nativeToScVal(description, { type: 'string' }),
      nativeToScVal(category, { type: 'string' }),
      nativeToScVal(price, { type: 'i128' }),
      new Address(tokenAddress).toScVal(),
      nativeToScVal(minScore, { type: 'u32' }),
      nativeToScVal(requiredCreds),
      nativeToScVal(deliveryDays, { type: 'u32' }),
    ]);
  }

  async purchaseService(buyer: string, listingId: bigint, zkProofHash: Buffer): Promise<string> {
    return this.invoke(this.marketplaceId, 'purchase_service', [
      new Address(buyer).toScVal(),
      nativeToScVal(listingId, { type: 'u64' }),
      nativeToScVal(zkProofHash, { type: 'bytes' }),
    ]);
  }
}
