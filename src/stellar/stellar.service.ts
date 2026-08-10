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

  /**
   * Build, sign, and submit a state-changing Soroban contract invocation.
   * Polls for transaction confirmation with up to 20 retries (1.5 s apart).
   *
   * @param contractId - Soroban contract address (C-address).
   * @param method     - Contract method name to call.
   * @param args       - Ordered list of XDR-encoded arguments.
   * @returns The confirmed Stellar transaction hash.
   * @throws Error if the transaction errors or does not confirm within the retry window.
   */
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

  /**
   * Simulate a read-only Soroban contract call and return the decoded return value.
   *
   * @param contractId - Soroban contract address (C-address).
   * @param method     - Contract method name to simulate.
   * @param args       - Ordered list of XDR-encoded arguments.
   * @returns The native-decoded return value, or `null` if the method returns void.
   * @throws Error if the simulation fails.
   */
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

  /**
   * Register a new issuer on the IssuerRegistry Soroban contract.
   *
   * @param address     - Stellar public key of the issuer to register.
   * @param name        - Display name of the issuer.
   * @param description - Description of the issuer's role or organisation.
   * @returns The Stellar transaction hash of the confirmed `add_issuer` call.
   */
  async addIssuer(address: string, name: string, description: string): Promise<string> {
    return this.invoke(this.issuerRegistryId, 'add_issuer', [
      new Address(address).toScVal(),
      nativeToScVal(name, { type: 'string' }),
      nativeToScVal(description, { type: 'string' }),
    ]);
  }

  /**
   * Check whether the given address is registered as an issuer on-chain.
   *
   * @param address - Stellar public key to check.
   * @returns `true` if the address is a registered issuer, `false` otherwise.
   */
  async isIssuer(address: string): Promise<boolean> {
    return this.simulate(this.issuerRegistryId, 'is_issuer', [new Address(address).toScVal()]);
  }

  /**
   * Record a credential issuance on the IssuerRegistry Soroban contract.
   *
   * @param issuer       - Stellar address of the issuing party.
   * @param user         - Stellar address of the credential recipient.
   * @param credentialId - String identifier of the credential type.
   * @param hash         - SHA-256 hash of the credential payload (raw bytes).
   * @param expiresAt    - Unix timestamp (seconds) for credential expiry, or 0 for no expiry.
   * @returns The Stellar transaction hash of the confirmed `issue_credential` call.
   */
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

  /**
   * Register a ZK proof on the ReputationRegistry Soroban contract.
   *
   * @param owner          - Stellar address of the proof owner.
   * @param issuer         - Stellar address of the credential issuer.
   * @param proofHash      - Hash of the ZK proof (raw bytes).
   * @param credentialHash - Hash of the underlying credential (raw bytes).
   * @param credentialType - String identifier for the credential type.
   * @param expiresAt      - Unix timestamp for proof expiry, or 0 for no expiry.
   * @param metadataUri    - IPFS URI or other pointer to proof metadata.
   * @returns The Stellar transaction hash of the confirmed `register_proof` call.
   */
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

  /**
   * Revoke a previously registered proof on the ReputationRegistry contract.
   *
   * @param proofHash - Hash of the proof to revoke (raw bytes).
   * @param revoker   - Stellar address authorised to revoke the proof.
   * @returns The Stellar transaction hash of the confirmed `revoke_proof` call.
   */
  async revokeProof(proofHash: Buffer, revoker: string): Promise<string> {
    return this.invoke(this.reputationRegistryId, 'revoke_proof', [
      nativeToScVal(proofHash, { type: 'bytes' }),
      new Address(revoker).toScVal(),
    ]);
  }

  /**
   * Read the raw numeric reputation score for a wallet from the on-chain contract.
   *
   * @param user - Stellar public key to query.
   * @returns The numeric score (0–1000).
   */
  async getScoreValue(user: string): Promise<number> {
    return this.simulate(this.reputationRegistryId, 'get_score_value', [
      new Address(user).toScVal(),
    ]);
  }

  /**
   * Fetch the full reputation score breakdown for a wallet from on-chain state.
   *
   * @param user - Stellar public key to query.
   * @returns An object with `score`, `proof_count`, and `components` map.
   */
  async getReputationScore(user: string): Promise<any> {
    return this.simulate(this.reputationRegistryId, 'get_reputation_score', [
      new Address(user).toScVal(),
    ]);
  }

  /**
   * Check whether a user holds an active credential of the specified type on-chain.
   *
   * @param user           - Stellar public key of the holder to check.
   * @param credentialType - Credential type identifier string.
   * @returns `true` if the user holds the credential, `false` otherwise.
   */
  async hasCredential(user: string, credentialType: string): Promise<boolean> {
    return this.simulate(this.reputationRegistryId, 'has_credential', [
      new Address(user).toScVal(),
      nativeToScVal(credentialType, { type: 'string' }),
    ]);
  }

  /**
   * Verify whether a user's on-chain reputation score meets or exceeds the given threshold.
   *
   * @param user      - Stellar public key to verify.
   * @param threshold - Minimum score required (0–1000).
   * @returns `true` if the score meets the threshold, `false` otherwise.
   */
  async verifyScoreThreshold(user: string, threshold: number): Promise<boolean> {
    return this.simulate(this.reputationRegistryId, 'verify_score_threshold', [
      new Address(user).toScVal(),
      nativeToScVal(threshold, { type: 'u32' }),
    ]);
  }

  /**
   * Retrieve all reputation badges awarded to a wallet from the on-chain registry.
   *
   * @param user - Stellar public key to query.
   * @returns An array of badge identifier strings.
   */
  async getUserBadges(user: string): Promise<string[]> {
    return this.simulate(this.reputationRegistryId, 'get_user_badges', [
      new Address(user).toScVal(),
    ]);
  }

  /**
   * Fetch the current latest ledger sequence known to the RPC node.
   *
   * @returns The latest confirmed ledger sequence number.
   */
  async getLatestLedgerSequence(): Promise<number> {
    const { sequence } = await this.server.getLatestLedger();
    return sequence;
  }

  /**
   * Poll `("proof", "reg")` events emitted by the ReputationRegistry contract's
   * `register_proof` function, used by {@link ProofIndexerService} to keep the
   * local database in sync with proofs registered on-chain through any path
   * (not just this backend's own submission pipeline).
   *
   * @param startLedger - Ledger sequence to begin scanning from (inclusive).
   * @returns The matching decoded events plus the RPC node's latest known ledger.
   */
  async getProofRegistrationEvents(
    startLedger: number,
  ): Promise<{ events: SorobanRpc.Api.EventResponse[]; latestLedger: number }> {
    const response = await this.server.getEvents({
      startLedger,
      filters: [
        {
          type: 'contract',
          contractIds: [this.reputationRegistryId],
          topics: [[xdr.ScVal.scvSymbol('proof').toXDR('base64'), xdr.ScVal.scvSymbol('reg').toXDR('base64')]],
        },
      ],
      limit: 100,
    });
    return { events: response.events, latestLedger: response.latestLedger };
  }

  // ── Marketplace ───────────────────────────────────────────────────────────

  /**
   * Create a new service listing on the Marketplace Soroban contract.
   *
   * @param provider       - Stellar address of the service provider.
   * @param title          - Short title of the service offering.
   * @param description    - Detailed description of the service.
   * @param category       - Category string for filtering (e.g. "development").
   * @param price          - Price in the smallest token unit (bigint).
   * @param tokenAddress   - Stellar address of the payment token contract.
   * @param minScore       - Minimum reputation score required to purchase.
   * @param requiredCreds  - Array of credential type strings required to purchase.
   * @param deliveryDays   - Expected delivery time in days.
   * @returns The Stellar transaction hash of the confirmed `create_listing` call.
   */
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

  /**
   * Purchase a service listing on the Marketplace contract.
   *
   * @param buyer       - Stellar address of the buyer.
   * @param listingId   - Numeric ID of the listing to purchase.
   * @param zkProofHash - ZK proof hash (raw bytes) demonstrating the buyer meets requirements.
   * @returns The Stellar transaction hash of the confirmed `purchase_service` call.
   */
  async purchaseService(buyer: string, listingId: bigint, zkProofHash: Buffer): Promise<string> {
    return this.invoke(this.marketplaceId, 'purchase_service', [
      new Address(buyer).toScVal(),
      nativeToScVal(listingId, { type: 'u64' }),
      nativeToScVal(zkProofHash, { type: 'bytes' }),
    ]);
  }

  /**
   * Fetch details of a single marketplace listing by ID.
   *
   * @param listingId - Numeric ID of the listing to retrieve.
   * @returns The listing object decoded from on-chain state.
   */
  async getListing(listingId: bigint): Promise<any> {
    return this.simulate(this.marketplaceId, 'get_listing', [
      nativeToScVal(listingId, { type: 'u64' }),
    ]);
  }

  /**
   * Retrieve all active marketplace listings, with optional filtering by category
   * or minimum reputation score.
   *
   * @param category  - Optional category string to filter by.
   * @param minScore  - Optional minimum `min_reputation_score` to filter by.
   * @returns An array of listing objects that match the given filters.
   */
  async getActiveListings(category?: string, minScore?: number): Promise<any[]> {
    const listings: any[] = await this.simulate(this.marketplaceId, 'get_active_listings', []);
    if (category) return listings.filter((l: any) => l.category === category);
    if (minScore) return listings.filter((l: any) => l.min_reputation_score >= minScore);
    return listings;
  }

  /**
   * Fetch all orders placed by the given buyer address.
   *
   * @param buyer - Stellar address of the buyer.
   * @returns An array of order objects associated with the buyer.
   */
  async getBuyerOrders(buyer: string): Promise<any[]> {
    return this.simulate(this.marketplaceId, 'get_buyer_orders', [
      new Address(buyer).toScVal(),
    ]);
  }

  /**
   * Fetch all orders received by the given seller address.
   *
   * @param seller - Stellar address of the seller/provider.
   * @returns An array of order objects associated with the seller.
   */
  async getSellerOrders(seller: string): Promise<any[]> {
    return this.simulate(this.marketplaceId, 'get_seller_orders', [
      new Address(seller).toScVal(),
    ]);
  }

  /**
   * Submit feedback for a completed marketplace order.
   *
   * @param reviewer        - Stellar address of the reviewer leaving feedback.
   * @param orderId         - Numeric ID of the completed order.
   * @param rating          - Rating value (e.g. 1–5).
   * @param comment         - Text feedback comment.
   * @param completionProof - Proof string evidencing service completion.
   * @returns The Stellar transaction hash of the confirmed `leave_feedback` call.
   */
  async leaveFeedback(
    reviewer: string,
    orderId: bigint,
    rating: number,
    comment: string,
    completionProof: string,
  ): Promise<string> {
    return this.invoke(this.marketplaceId, 'leave_feedback', [
      new Address(reviewer).toScVal(),
      nativeToScVal(orderId, { type: 'u64' }),
      nativeToScVal(rating, { type: 'u32' }),
      nativeToScVal(comment, { type: 'string' }),
      nativeToScVal(completionProof, { type: 'string' }),
    ]);
  }

  /**
   * Mark a paid order as in-progress on the Marketplace contract.
   *
   * @param seller  - Stellar address of the order's seller.
   * @param orderId - Numeric ID of the order to start.
   * @returns The Stellar transaction hash of the confirmed `start_order` call.
   */
  async startOrder(seller: string, orderId: bigint): Promise<string> {
    return this.invoke(this.marketplaceId, 'start_order', [
      new Address(seller).toScVal(),
      nativeToScVal(orderId, { type: 'u64' }),
    ]);
  }

  /**
   * Mark an in-progress order complete and release escrow to the seller on
   * the Marketplace contract.
   *
   * @param seller          - Stellar address of the order's seller.
   * @param orderId         - Numeric ID of the order to complete.
   * @param completionProof - 32-byte proof evidencing service completion.
   * @returns The Stellar transaction hash of the confirmed `complete_order` call.
   */
  async completeOrder(seller: string, orderId: bigint, completionProof: Buffer): Promise<string> {
    return this.invoke(this.marketplaceId, 'complete_order', [
      new Address(seller).toScVal(),
      nativeToScVal(orderId, { type: 'u64' }),
      nativeToScVal(completionProof, { type: 'bytes' }),
    ]);
  }

  /**
   * Raise a dispute on an order on the Marketplace contract. The contract
   * rejects this before the listing's delivery deadline has passed.
   *
   * @param buyer   - Stellar address of the order's buyer.
   * @param orderId - Numeric ID of the order to dispute.
   * @param reason  - Free-text reason for the dispute.
   * @returns The Stellar transaction hash of the confirmed `raise_dispute` call.
   */
  async raiseDispute(buyer: string, orderId: bigint, reason: string): Promise<string> {
    return this.invoke(this.marketplaceId, 'raise_dispute', [
      new Address(buyer).toScVal(),
      nativeToScVal(orderId, { type: 'u64' }),
      nativeToScVal(reason, { type: 'string' }),
    ]);
  }
}
