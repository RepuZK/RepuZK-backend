import { Injectable, BadRequestException } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { PaginatedResult } from '../common/dto/pagination-query.dto';

/**
 * Slice an in-memory array into a page, matching the `{ data, total, page,
 * limit }` shape used by the DB-backed list endpoints. The Marketplace
 * Soroban contract has no on-chain pagination of its own — `get_active_listings`,
 * `get_buyer_orders`, and `get_seller_orders` always return the full set — so
 * pagination is applied here after the on-chain read.
 */
function paginate<T>(items: T[], page: number, limit: number): PaginatedResult<T> {
  const start = (page - 1) * limit;
  return { data: items.slice(start, start + limit), total: items.length, page, limit };
}

@Injectable()
export class MarketplaceService {
  constructor(private readonly stellar: StellarService) {}

  async createListing(
    provider: string,
    title: string,
    description: string,
    category: string,
    price: bigint,
    tokenAddress: string,
    minScore: number,
    requiredCredentials: string[],
    deliveryDays: number,
  ) {
    const txHash = await this.stellar.createListing(
      provider, title, description, category, price,
      tokenAddress, minScore, requiredCredentials, deliveryDays,
    );
    return { txHash };
  }

  async purchaseService(buyer: string, listingId: bigint, zkProofHash: string) {
    const txHash = await this.stellar.purchaseService(
      buyer,
      listingId,
      Buffer.from(zkProofHash.replace(/^0x/, ''), 'hex'),
    );
    return { txHash };
  }

  /**
   * Fetch active marketplace listings, optionally filtered by category/minimum
   * score, paginated.
   *
   * @param category - Optional category to filter by.
   * @param minScore - Optional minimum `min_reputation_score` to filter by.
   * @param page     - 1-indexed page number.
   * @param limit    - Page size (max 100).
   */
  async getListings(
    category?: string,
    minScore?: number,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<any>> {
    // Read active listings; filter applied client-side since contract returns all
    const listings = await this.stellar.getActiveListings(category, minScore);
    return paginate(listings, page, limit);
  }

  async getListing(id: string) {
    return this.stellar.getListing(BigInt(id));
  }

  /**
   * Fetch orders placed by the given buyer, paginated.
   *
   * @param address - Stellar address of the buyer.
   * @param page    - 1-indexed page number.
   * @param limit   - Page size (max 100).
   */
  async getBuyerOrders(address: string, page = 1, limit = 20): Promise<PaginatedResult<any>> {
    const orders = await this.stellar.getBuyerOrders(address);
    return paginate(orders, page, limit);
  }

  /**
   * Fetch orders received by the given seller, paginated.
   *
   * @param address - Stellar address of the seller/provider.
   * @param page    - 1-indexed page number.
   * @param limit   - Page size (max 100).
   */
  async getSellerOrders(address: string, page = 1, limit = 20): Promise<PaginatedResult<any>> {
    const orders = await this.stellar.getSellerOrders(address);
    return paginate(orders, page, limit);
  }

  async leaveFeedback(
    reviewer: string,
    orderId: bigint,
    rating: number,
    comment: string,
    completionProof?: string,
  ) {
    const txHash = await this.stellar.leaveFeedback(reviewer, orderId, rating, comment, completionProof ?? '');
    return { txHash };
  }

  async startOrder(seller: string, orderId: bigint) {
    const txHash = await this.stellar.startOrder(seller, orderId);
    return { txHash };
  }

  async completeOrder(seller: string, orderId: bigint, completionProof?: string) {
    // The contract expects exactly 32 bytes; default to a zero-filled proof
    // when the caller doesn't supply one (the field isn't checked against
    // anything on-chain yet — see `_completion_proof` in marketplace.rs).
    const proofHex = (completionProof ?? '').replace(/^0x/, '');
    const proofBuf = proofHex ? Buffer.from(proofHex, 'hex') : Buffer.alloc(32);
    if (proofBuf.length !== 32) {
      throw new BadRequestException('completionProof must decode to exactly 32 bytes');
    }
    const txHash = await this.stellar.completeOrder(seller, orderId, proofBuf);
    return { txHash };
  }

  async raiseDispute(buyer: string, orderId: bigint, reason: string) {
    const txHash = await this.stellar.raiseDispute(buyer, orderId, reason);
    return { txHash };
  }
}
